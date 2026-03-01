/**
 * Post-Quantum Cryptography Module
 * Implements ML-KEM-512 (NIST FIPS 203, formerly CRYSTALS-KYBER 512) for key exchange,
 * AES-256-GCM for encryption, and XOR-based audio obfuscation for identity protection.
 *
 * Flow (from The.docx):
 *   Audio → Obfuscation (XOR + SHA-256 per-chunk key) → AES-GCM Encrypt → Transmit
 *   Receive → AES-GCM Decrypt → De-Obfuscation (reverse XOR) → Playback
 *
 * ML-KEM-512 (Kyber-512) provides post-quantum key encapsulation (NIST PQC standard).
 */

import { MlKem512 } from 'mlkem';

// Singleton instance of ML-KEM-512
const kemInstance = new MlKem512();

// ─── Type Definitions ────────────────────────────────────────────────

export interface KyberKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface KyberEncapsulation {
  ciphertext: Uint8Array;
  sharedSecret: Uint8Array;
}

// ─── Utility Helpers ─────────────────────────────────────────────────

function toBuffer(arr: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(arr.byteLength);
  new Uint8Array(ab).set(arr);
  return ab;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  // Handle large arrays by chunking to avoid stack overflow with spread operator
  const CHUNK_SIZE = 8192;
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    result += String.fromCharCode(...chunk);
  }
  return btoa(result);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── ML-KEM-512 / Kyber-512 KEM (Post-Quantum Key Exchange) ──────────

/**
 * Generate a Kyber-512 (ML-KEM-512) keypair.
 * Uses the real lattice-based KEM from the mlkem package (NIST FIPS 203).
 */
export async function kyberKeygen(): Promise<KyberKeyPair> {
  const [publicKey, secretKey] = await kemInstance.generateKeyPair();
  return {
    publicKey: new Uint8Array(publicKey),
    secretKey: new Uint8Array(secretKey),
  };
}

/**
 * Encapsulate — generate a shared secret using the peer's Kyber public key.
 * Returns the ciphertext (to send to the peer) and the shared secret.
 */
export async function kyberEncaps(peerPublicKey: Uint8Array): Promise<KyberEncapsulation> {
  const [ciphertext, sharedSecret] = await kemInstance.encap(peerPublicKey);
  return {
    ciphertext: new Uint8Array(ciphertext),
    sharedSecret: new Uint8Array(sharedSecret),
  };
}

/**
 * Decapsulate — derive the shared secret from the ciphertext using our secret key.
 */
export async function kyberDecaps(ciphertext: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
  const sharedSecret = await kemInstance.decap(ciphertext, secretKey);
  return new Uint8Array(sharedSecret);
}

// ─── AES-256-GCM Encryption / Decryption ─────────────────────────────

/**
 * Encrypt data with AES-256-GCM using a 32-byte key.
 */
export async function aesGcmEncrypt(
  plaintext: Uint8Array,
  key: Uint8Array
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    toBuffer(plaintext)
  );
  return { ciphertext: new Uint8Array(encrypted), nonce };
}

/**
 * Decrypt data with AES-256-GCM using a 32-byte key.
 */
export async function aesGcmDecrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(key),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource },
    cryptoKey,
    toBuffer(ciphertext)
  );
  return new Uint8Array(decrypted);
}

// ─── Audio Obfuscation / De-Obfuscation (Identity Protection) ────────
//
// From The.docx:
//   A. Key Derivation:  SHA-256(SessionKey + ChunkIndex) → unique per-chunk key
//   B. XOR Scrambling:  AudioByte ⊕ KeyByte = ObfuscatedByte
//   C. Double Lock:     Obfuscation happens BEFORE AES encryption
//
// From general working.docx:
//   Step 3 (Obfuscation): XOR-based identity hiding
//   Step 4 (Encryption): AES-GCM with Kyber session key
//   Step 5 (Reception): AES-GCM decrypt
//   Step 6 (De-obfuscation): Reverse XOR to restore original audio
//
// The XOR operation is symmetric: applying it twice with the same key
// restores the original data, so obfuscate === de_obfuscate.

/**
 * Derive a per-chunk obfuscation key using SHA-256.
 * Key = SHA-256(SessionKey || ChunkIndex)
 *
 * This ensures every audio chunk uses a unique scrambling pattern,
 * preventing pattern analysis even if an attacker obtains partial data.
 */
export async function deriveChunkKey(
  sessionKey: Uint8Array,
  chunkIndex: number
): Promise<Uint8Array> {
  // Encode chunk index as 4-byte little-endian
  const indexBytes = new Uint8Array(4);
  new DataView(indexBytes.buffer).setUint32(0, chunkIndex, true);

  // Concatenate sessionKey + chunkIndex
  const combined = new Uint8Array(sessionKey.length + 4);
  combined.set(sessionKey, 0);
  combined.set(indexBytes, sessionKey.length);

  // SHA-256 hash → 32-byte per-chunk key
  const hash = await crypto.subtle.digest('SHA-256', combined);
  return new Uint8Array(hash);
}

/**
 * Obfuscate audio data using XOR with a per-chunk derived key.
 *
 * This destroys voice fingerprints (spectrogram patterns), pitch, and timbre
 * information, making the audio sound like white noise to any observer.
 * AI-based speaker identification becomes impossible on obfuscated data.
 *
 * The key is cycled across the audio bytes:
 *   obfuscated[i] = audio[i] XOR chunkKey[i % keyLength]
 *
 * @param audioData  - Raw audio bytes (PCM samples)
 * @param sessionKey - The Kyber-derived 32-byte shared session key
 * @param chunkIndex - Sequential chunk number (0, 1, 2, ...)
 * @returns Obfuscated audio bytes (same length as input)
 */
export async function obfuscateAudio(
  audioData: Uint8Array,
  sessionKey: Uint8Array,
  chunkIndex: number
): Promise<Uint8Array> {
  const chunkKey = await deriveChunkKey(sessionKey, chunkIndex);
  const obfuscated = new Uint8Array(audioData.length);

  for (let i = 0; i < audioData.length; i++) {
    obfuscated[i] = audioData[i] ^ chunkKey[i % chunkKey.length];
  }

  return obfuscated;
}

/**
 * De-obfuscate audio data — reverse the XOR scrambling.
 *
 * XOR is symmetric: applying it twice with the same key restores the original.
 *   deobfuscated[i] = obfuscated[i] XOR chunkKey[i % keyLength]
 *
 * @param obfuscatedData - Obfuscated audio bytes
 * @param sessionKey     - The same Kyber-derived 32-byte shared session key
 * @param chunkIndex     - The same sequential chunk number used during obfuscation
 * @returns Original audio bytes restored
 */
export async function deobfuscateAudio(
  obfuscatedData: Uint8Array,
  sessionKey: Uint8Array,
  chunkIndex: number
): Promise<Uint8Array> {
  // XOR is its own inverse — same operation as obfuscation
  return obfuscateAudio(obfuscatedData, sessionKey, chunkIndex);
}

/**
 * Full sender pipeline: Obfuscate → Encrypt
 *
 * Audio → XOR Obfuscation (identity destruction) → AES-GCM Encrypt → ciphertext
 * This implements the "Double Lock" described in The.docx.
 */
export async function encryptAudioChunk(
  audioData: Uint8Array,
  sessionKey: Uint8Array,
  chunkIndex: number
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  // Step 1: Obfuscate — destroy voice fingerprint
  const obfuscated = await obfuscateAudio(audioData, sessionKey, chunkIndex);
  // Step 2: Encrypt — AES-GCM authenticated encryption
  return aesGcmEncrypt(obfuscated, sessionKey);
}

/**
 * Full receiver pipeline: Decrypt → De-obfuscate
 *
 * ciphertext → AES-GCM Decrypt → XOR De-Obfuscation → original audio
 */
export async function decryptAudioChunk(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  sessionKey: Uint8Array,
  chunkIndex: number
): Promise<Uint8Array> {
  // Step 1: Decrypt — AES-GCM
  const obfuscated = await aesGcmDecrypt(ciphertext, sessionKey, nonce);
  // Step 2: De-obfuscate — restore original audio
  return deobfuscateAudio(obfuscated, sessionKey, chunkIndex);
}
