import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useWebRTC } from '@/hooks/useWebRTC';
import { supabase } from '@/integrations/supabase/client';
import MeetingToolbar from '@/components/MeetingToolbar';
import ParticipantCard from '@/components/ParticipantCard';
import ChatPanel from '@/components/ChatPanel';
import ParticipantsPanel from '@/components/ParticipantsPanel';
import MetricsPanel from '@/components/MetricsPanel';
import { Mic, MicOff, Shield, Copy, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MeetingRoom() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [joined, setJoined] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [peerProfiles, setPeerProfiles] = useState<Map<string, string>>(new Map());
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'You';

  const {
    isMuted, isConnected, peers, peerMuteStates, cryptoStatus,
    deobfuscationEnabled, networkStats, cryptoMetrics, chatMessages,
    joinMeeting, leaveMeeting, toggleMute, toggleDeobfuscation,
    getSharedKey, sendChatMessage,
  } = useWebRTC(code || '', user?.id || '', displayName);

  // Fetch meeting title
  useEffect(() => {
    if (!code) return;
    supabase
      .from('meetings')
      .select('title')
      .eq('code', code)
      .single()
      .then(({ data }) => {
        if (data) setMeetingTitle(data.title || 'Untitled Meeting');
      });
  }, [code]);

  // Fetch peer profiles
  useEffect(() => {
    if (peers.length === 0) return;
    supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', peers)
      .then(({ data }) => {
        if (data) {
          const map = new Map<string, string>();
          data.forEach(p => map.set(p.user_id, p.display_name || 'Unknown'));
          setPeerProfiles(map);
        }
      });
  }, [peers]);

  // Call timer
  useEffect(() => {
    if (joined && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [joined]);

  const handleJoin = async () => {
    try {
      await joinMeeting();
      setJoined(true);
      if (user && code) {
        const { data: meeting } = await supabase
          .from('meetings').select('id').eq('code', code).single();
        if (meeting) {
          await supabase.from('participants').insert({ meeting_id: meeting.id, user_id: user.id });
        }
      }
    } catch (err) {
      toast.error('Failed to join. Check microphone permissions.');
    }
  };

  const handleLeave = () => {
    leaveMeeting();
    setCallDuration(0);
    navigate('/');
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code || '');
    toast.success('Meeting code copied!');
  };

  const togglePanel = (panel: 'participants' | 'chat' | 'metrics') => {
    if (panel === 'participants') {
      setShowParticipants(prev => !prev);
      setShowChat(false);
      setShowMetrics(false);
    } else if (panel === 'chat') {
      setShowChat(prev => !prev);
      setShowParticipants(false);
      setShowMetrics(false);
    } else {
      setShowMetrics(prev => !prev);
      setShowParticipants(false);
      setShowChat(false);
    }
  };

  // Pre-join lobby
  if (!joined) {
    return (
      <div className="min-h-screen bg-meet-surface-dark flex items-center justify-center">
        <div className="text-center max-w-lg">
          <div className="w-64 h-48 rounded-2xl bg-meet-participant-bg mx-auto mb-8 flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-3xl font-display font-bold text-primary-foreground mb-3">
              {displayName[0].toUpperCase()}
            </div>
            <span className="text-meet-toolbar-foreground text-sm">{displayName}</span>
          </div>
          <h2 className="text-2xl font-display font-semibold text-meet-toolbar-foreground mb-2">Ready to join?</h2>
          <p className="text-meet-toolbar-foreground/60 text-sm mb-6">
            Meeting code: <span className="font-mono text-primary">{code}</span>
          </p>
          <div className="flex items-center gap-4 justify-center mb-6">
            <button onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-meet-red text-meet-red-foreground' : 'bg-meet-toolbar-foreground/10 text-meet-toolbar-foreground hover:bg-meet-toolbar-foreground/20'
                }`}>
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
          </div>
          <div className="flex items-center gap-3 justify-center">
            <Button onClick={handleJoin} className="h-12 px-8 text-base rounded-full">Join now</Button>
            <Button variant="outline" onClick={() => navigate('/')} className="h-12 px-8 text-base rounded-full border-meet-toolbar-foreground/20 text-meet-toolbar-foreground hover:bg-meet-toolbar-foreground/10">Back</Button>
          </div>
          <div className="flex items-center gap-2 justify-center mt-6 text-xs text-meet-toolbar-foreground/50">
            <Shield className="w-3.5 h-3.5" />
            <span>Kyber-512 PQC + XOR Obfuscation + AES-256-GCM</span>
          </div>
        </div>
      </div>
    );
  }

  const allParticipants = [
    { userId: user?.id || '', displayName, isMuted },
    ...peers.map(peerId => ({
      userId: peerId,
      displayName: peerProfiles.get(peerId) || 'Participant',
      isMuted: peerMuteStates.get(peerId) || false,
    })),
  ];

  const gridClass = allParticipants.length <= 1
    ? 'grid-cols-1 max-w-xl'
    : allParticipants.length <= 4
      ? 'grid-cols-2 max-w-3xl'
      : 'grid-cols-3 max-w-5xl';

  return (
    <div className="h-screen flex flex-col bg-meet-surface-dark">
      {/* Top bar with title, timer, and meeting code */}
      <div className="h-14 flex items-center justify-between px-4 text-meet-toolbar-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-display font-semibold text-sm">{meetingTitle}</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Call timer */}
          <div className="flex items-center gap-1.5 text-meet-toolbar-foreground/70">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono text-sm">{formatDuration(callDuration)}</span>
          </div>
          <div className="w-px h-5 bg-meet-toolbar-foreground/20" />
          <button onClick={copyCode} className="flex items-center gap-1.5 text-xs text-meet-toolbar-foreground/60 hover:text-meet-toolbar-foreground/80 transition-colors">
            <Copy className="w-3.5 h-3.5" />{code}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main participant grid */}
        <div className="flex-1 flex items-center justify-center p-4 pb-24">
          <div className={`grid ${gridClass} gap-3 w-full mx-auto`}>
            {allParticipants.map((p) => (
              <ParticipantCard key={p.userId} displayName={p.displayName} isMuted={p.isMuted} isSelf={p.userId === user?.id} />
            ))}
          </div>
        </div>

        {/* Side panels */}
        {showParticipants && (
          <ParticipantsPanel participants={allParticipants} currentUserId={user?.id || ''} onClose={() => setShowParticipants(false)} />
        )}
        {showChat && (
          <ChatPanel messages={chatMessages} onSendMessage={sendChatMessage} onClose={() => setShowChat(false)} />
        )}
        {showMetrics && (
          <MetricsPanel networkStats={networkStats} cryptoMetrics={cryptoMetrics} cryptoStatus={cryptoStatus} peerCount={peers.length} onClose={() => setShowMetrics(false)} />
        )}
      </div>

      <MeetingToolbar
        isMuted={isMuted}
        onToggleMute={toggleMute}
        onLeave={handleLeave}
        onToggleParticipants={() => togglePanel('participants')}
        onToggleChat={() => togglePanel('chat')}
        onToggleMetrics={() => togglePanel('metrics')}
        onToggleDeobfuscation={toggleDeobfuscation}
        cryptoStatus={cryptoStatus}
        participantCount={allParticipants.length}
        showParticipants={showParticipants}
        showChat={showChat}
        showMetrics={showMetrics}
        deobfuscationEnabled={deobfuscationEnabled}
      />
    </div>
  );
}
