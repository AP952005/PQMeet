import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  kyberKeygen,
  kyberEncaps,
  kyberDecaps,
  uint8ToBase64,
  base64ToUint8,
  type KyberKeyPair,
} from '@/lib/crypto';

interface PeerConnection {
  userId: string;
  pc: RTCPeerConnection;
  sharedKey?: Uint8Array;
}

export interface NetworkStats {
  bytesSent: number;
  bytesReceived: number;
  packetsSent: number;
  packetsReceived: number;
  rttMs: number;
  jitterMs: number;
  packetLossPercent: number;
  bitrateKbps: number;
}

export interface CryptoMetrics {
  encryptionTimeMs: number;
  decryptionTimeMs: number;
  avgOverheadMs: number;
  keyExchangeTimeMs: number;
}

// Free TURN servers for NAT traversal (allows remote users to connect)
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

/**
 * XOR obfuscation on Float32 audio samples.
 * Converts Float32→Int16, XORs with key bytes, converts back.
 */
function xorProcessAudio(input: Float32Array, output: Float32Array, key: Uint8Array) {
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    const int16 = Math.round(clamped * 32767);
    const k1 = key[(i * 2) % key.length];
    const k2 = key[(i * 2 + 1) % key.length];
    const xored = int16 ^ ((k1 << 8) | k2);
    output[i] = Math.max(-1, Math.min(1, xored / 32767));
  }
}

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  timestamp: string;
  isSelf: boolean;
}

export function useWebRTC(meetingCode: string, userId: string, displayName: string) {
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [peerMuteStates, setPeerMuteStates] = useState<Map<string, boolean>>(new Map());
  const [cryptoStatus, setCryptoStatus] = useState<'none' | 'exchanging' | 'encrypted'>('none');
  const [deobfuscationEnabled, setDeobfuscationEnabled] = useState(true);
  const [sharedKeyHex, setSharedKeyHex] = useState<string | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [cryptoMetrics, setCryptoMetrics] = useState<CryptoMetrics>({
    encryptionTimeMs: 0, decryptionTimeMs: 0, avgOverheadMs: 0, keyExchangeTimeMs: 0,
  });

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const kyberKeysRef = useRef<KyberKeyPair | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioContextsRef = useRef<AudioContext[]>([]);
  const deobfuscationRef = useRef(true);
  const keyExchangeStartRef = useRef(0);
  const encTimesRef = useRef<number[]>([]);
  const decTimesRef = useRef<number[]>([]);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBytesRef = useRef({ sent: 0, received: 0, timestamp: 0 });

  useEffect(() => { deobfuscationRef.current = deobfuscationEnabled; }, [deobfuscationEnabled]);

  const getSharedKey = useCallback((): Uint8Array | null => {
    for (const peer of peersRef.current.values()) {
      if (peer.sharedKey) return peer.sharedKey;
    }
    return null;
  }, []);

  const getLocalStream = useCallback(async () => {
    if (!localStreamRef.current) {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    }
    return localStreamRef.current;
  }, []);

  /**
   * Create an obfuscated audio stream from the microphone.
   * Pipeline: Mic → ScriptProcessor(XOR) → MediaStreamDestination
   */
  const createObfuscatedStream = useCallback((rawStream: MediaStream): MediaStream => {
    const ctx = new AudioContext({ sampleRate: 48000 });
    audioContextsRef.current.push(ctx);
    const source = ctx.createMediaStreamSource(rawStream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const destination = ctx.createMediaStreamDestination();

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const outputData = e.outputBuffer.getChannelData(0);
      const key = getSharedKey();
      if (key) {
        const start = performance.now();
        xorProcessAudio(inputData, outputData, key);
        const elapsed = performance.now() - start;
        encTimesRef.current.push(elapsed);
        if (encTimesRef.current.length > 100) encTimesRef.current.shift();
      } else {
        outputData.set(inputData);
      }
    };

    source.connect(processor);
    processor.connect(destination);
    // Keep ScriptProcessor alive with silent local output
    const gain = ctx.createGain();
    gain.gain.value = 0;
    processor.connect(gain);
    gain.connect(ctx.destination);

    return destination.stream;
  }, [getSharedKey]);

  /**
   * Set up receiver audio with de-obfuscation processing.
   * Pipeline: Remote → ScriptProcessor(de-XOR) → Speakers
   */
  const setupReceiverAudio = useCallback((remoteStream: MediaStream, peerId: string) => {
    const ctx = new AudioContext({ sampleRate: 48000 });
    audioContextsRef.current.push(ctx);
    const source = ctx.createMediaStreamSource(remoteStream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const outputData = e.outputBuffer.getChannelData(0);
      const key = getSharedKey();
      if (key && deobfuscationRef.current) {
        const start = performance.now();
        xorProcessAudio(inputData, outputData, key);
        const elapsed = performance.now() - start;
        decTimesRef.current.push(elapsed);
        if (decTimesRef.current.length > 100) decTimesRef.current.shift();
      } else {
        outputData.set(inputData);
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination);
  }, [getSharedKey]);

  // Collect WebRTC stats every second
  const startStatsCollection = useCallback(() => {
    if (statsIntervalRef.current) return;
    statsIntervalRef.current = setInterval(async () => {
      for (const peer of peersRef.current.values()) {
        try {
          const stats = await peer.pc.getStats();
          let bytesSent = 0, bytesRecv = 0, packetsSent = 0, packetsRecv = 0;
          let rtt = 0, jitter = 0, packetsLost = 0, totalPackets = 0;

          stats.forEach((report) => {
            if (report.type === 'outbound-rtp' && report.kind === 'audio') {
              bytesSent = report.bytesSent || 0;
              packetsSent = report.packetsSent || 0;
            }
            if (report.type === 'inbound-rtp' && report.kind === 'audio') {
              bytesRecv = report.bytesReceived || 0;
              packetsRecv = report.packetsReceived || 0;
              jitter = (report.jitter || 0) * 1000;
              packetsLost = report.packetsLost || 0;
              totalPackets = packetsRecv + packetsLost;
            }
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
            }
          });

          const now = Date.now();
          const elapsed = (now - (prevBytesRef.current.timestamp || now)) / 1000;
          const bitrate = elapsed > 0
            ? ((bytesSent - prevBytesRef.current.sent + bytesRecv - prevBytesRef.current.received) * 8) / elapsed / 1000
            : 0;
          prevBytesRef.current = { sent: bytesSent, received: bytesRecv, timestamp: now };

          setNetworkStats({
            bytesSent, bytesReceived: bytesRecv,
            packetsSent, packetsReceived: packetsRecv,
            rttMs: Math.round(rtt * 100) / 100,
            jitterMs: Math.round(jitter * 100) / 100,
            packetLossPercent: totalPackets > 0 ? Math.round((packetsLost / totalPackets) * 10000) / 100 : 0,
            bitrateKbps: Math.round(Math.abs(bitrate) * 100) / 100,
          });

          const avgEnc = encTimesRef.current.length > 0
            ? encTimesRef.current.reduce((a, b) => a + b, 0) / encTimesRef.current.length : 0;
          const avgDec = decTimesRef.current.length > 0
            ? decTimesRef.current.reduce((a, b) => a + b, 0) / decTimesRef.current.length : 0;
          setCryptoMetrics(prev => ({
            ...prev,
            encryptionTimeMs: Math.round(avgEnc * 1000) / 1000,
            decryptionTimeMs: Math.round(avgDec * 1000) / 1000,
            avgOverheadMs: Math.round((avgEnc + avgDec) * 1000) / 1000,
          }));
        } catch { /* ignore */ }
      }
    }, 1000);
  }, []);

  const createPeerConnection = useCallback(async (peerId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const rawStream = await getLocalStream();
    const sendStream = createObfuscatedStream(rawStream);
    sendStream.getTracks().forEach(track => pc.addTrack(track, sendStream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channelRef.current?.send({
          type: 'broadcast', event: 'ice-candidate',
          payload: { candidate: event.candidate, from: userId, to: peerId },
        });
      }
    };

    pc.ontrack = (event) => {
      setupReceiverAudio(event.streams[0], peerId);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsConnected(true);
        startStatsCollection();
      }
    };

    const peerConn: PeerConnection = { userId: peerId, pc };
    peersRef.current.set(peerId, peerConn);
    setPeers(Array.from(peersRef.current.keys()));
    return peerConn;
  }, [getLocalStream, userId, createObfuscatedStream, setupReceiverAudio, startStatsCollection]);

  const performKeyExchange = useCallback(async (peerId: string, isInitiator: boolean) => {
    setCryptoStatus('exchanging');
    keyExchangeStartRef.current = performance.now();
    if (!kyberKeysRef.current) {
      kyberKeysRef.current = await kyberKeygen();
    }
    if (isInitiator) {
      channelRef.current?.send({
        type: 'broadcast', event: 'kyber-pubkey',
        payload: { pubkey: uint8ToBase64(kyberKeysRef.current.publicKey), from: userId, to: peerId },
      });
    }
  }, [userId]);

  // Broadcast mute state change to all peers
  const broadcastMuteState = useCallback((muted: boolean) => {
    channelRef.current?.send({
      type: 'broadcast', event: 'mute-state',
      payload: { from: userId, isMuted: muted },
    });
  }, [userId]);

  const joinMeeting = useCallback(async () => {
    await getLocalStream();
    kyberKeysRef.current = await kyberKeygen();
    console.info('[PQC] Kyber-512 (ML-KEM-512) keypair generated');

    const channel = supabase.channel(`meeting:${meetingCode}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'join' }, async ({ key }) => {
        if (key !== userId) {
          const peer = await createPeerConnection(key);
          const offer = await peer.pc.createOffer();
          await peer.pc.setLocalDescription(offer);
          channel.send({
            type: 'broadcast', event: 'offer',
            payload: { sdp: offer, from: userId, to: key },
          });
          await performKeyExchange(key, true);
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        const peer = peersRef.current.get(key);
        if (peer) {
          peer.pc.close();
          peersRef.current.delete(key);
          setPeers(Array.from(peersRef.current.keys()));
          setPeerMuteStates(prev => { const n = new Map(prev); n.delete(key); return n; });
        }
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.to !== userId) return;
        const peer = await createPeerConnection(payload.from);
        await peer.pc.setRemoteDescription(payload.sdp);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        channel.send({
          type: 'broadcast', event: 'answer',
          payload: { sdp: answer, from: userId, to: payload.from },
        });
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.to !== userId) return;
        const peer = peersRef.current.get(payload.from);
        if (peer) await peer.pc.setRemoteDescription(payload.sdp);
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.to !== userId) return;
        const peer = peersRef.current.get(payload.from);
        if (peer) await peer.pc.addIceCandidate(payload.candidate);
      })
      // Mute state broadcast handler
      .on('broadcast', { event: 'mute-state' }, ({ payload }) => {
        if (payload.from === userId) return;
        setPeerMuteStates(prev => {
          const n = new Map(prev);
          n.set(payload.from, payload.isMuted);
          return n;
        });
      })
      // Chat message handler
      .on('broadcast', { event: 'chat-msg' }, ({ payload }) => {
        if (!payload || payload.senderId === userId) return;
        setChatMessages(prev => [...prev, {
          id: `${Date.now()}-${Math.random()}`,
          from: payload.from || 'Unknown',
          text: payload.text || '',
          timestamp: payload.timestamp || new Date().toISOString(),
          isSelf: false,
        }]);
      })
      // Kyber key exchange
      .on('broadcast', { event: 'kyber-pubkey' }, async ({ payload }) => {
        if (payload.to !== userId) return;
        const peerPubKey = base64ToUint8(payload.pubkey);
        const { ciphertext, sharedSecret } = await kyberEncaps(peerPubKey);
        const peer = peersRef.current.get(payload.from);
        if (peer) {
          peer.sharedKey = sharedSecret;
          const elapsed = performance.now() - keyExchangeStartRef.current;
          setCryptoMetrics(prev => ({ ...prev, keyExchangeTimeMs: Math.round(elapsed * 100) / 100 }));
          setCryptoStatus('encrypted');
          setSharedKeyHex(uint8ToBase64(sharedSecret).slice(0, 16) + '...');
          console.info('[PQC] Kyber-512 encapsulation complete');
        }
        channel.send({
          type: 'broadcast', event: 'kyber-encaps',
          payload: { ciphertext: uint8ToBase64(ciphertext), from: userId, to: payload.from },
        });
      })
      .on('broadcast', { event: 'kyber-encaps' }, async ({ payload }) => {
        if (payload.to !== userId) return;
        if (!kyberKeysRef.current) return;
        const ciphertext = base64ToUint8(payload.ciphertext);
        const sharedSecret = await kyberDecaps(ciphertext, kyberKeysRef.current.secretKey);
        const peer = peersRef.current.get(payload.from);
        if (peer) {
          peer.sharedKey = sharedSecret;
          const elapsed = performance.now() - keyExchangeStartRef.current;
          setCryptoMetrics(prev => ({ ...prev, keyExchangeTimeMs: Math.round(elapsed * 100) / 100 }));
          setCryptoStatus('encrypted');
          setSharedKeyHex(uint8ToBase64(sharedSecret).slice(0, 16) + '...');
          console.info('[PQC] Kyber-512 decapsulation complete');
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, joined_at: new Date().toISOString() });
          setIsConnected(true);
        }
      });
  }, [meetingCode, userId, getLocalStream, createPeerConnection, performKeyExchange]);

  const leaveMeeting = useCallback(() => {
    if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null; }
    peersRef.current.forEach((peer) => { peer.pc.close(); });
    peersRef.current.clear();
    setPeers([]);
    setPeerMuteStates(new Map());
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    audioContextsRef.current.forEach(ctx => { try { ctx.close(); } catch { } });
    audioContextsRef.current = [];
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    setIsConnected(false);
    setCryptoStatus('none');
    setSharedKeyHex(null);
  }, []);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMuted = !audioTrack.enabled;
        setIsMuted(newMuted);
        broadcastMuteState(newMuted);
      }
    }
  }, [broadcastMuteState]);

  const toggleDeobfuscation = useCallback(() => {
    setDeobfuscationEnabled(prev => !prev);
  }, []);

  const sendChatMessage = useCallback((text: string) => {
    if (!text.trim() || !channelRef.current) return;
    const msg: ChatMessage = {
      id: `${Date.now()}-self`,
      from: displayName,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      isSelf: true,
    };
    setChatMessages(prev => [...prev, msg]);
    channelRef.current.send({
      type: 'broadcast',
      event: 'chat-msg',
      payload: { from: displayName, text: text.trim(), timestamp: msg.timestamp, senderId: userId },
    });
  }, [displayName, userId]);

  useEffect(() => { return () => { leaveMeeting(); }; }, [leaveMeeting]);

  return {
    isMuted, isConnected, peers, peerMuteStates, cryptoStatus, sharedKeyHex,
    deobfuscationEnabled, networkStats, cryptoMetrics, chatMessages,
    joinMeeting, leaveMeeting, toggleMute, toggleDeobfuscation,
    getSharedKey, sendChatMessage,
  };
}
