import fs from 'fs';
import { KEYS_PATH } from '../config/paths';

/**
 * A stored AES-128 decryption key for one video's HLS stream.
 * keyHex/ivHex are 32-character hex strings (16 raw bytes each).
 */
export interface StreamKey {
  method: 'AES-128';
  keyHex: string;
  ivHex: string;
  createdAt: string;
}

type KeyStore = Record<string, StreamKey>;

/**
 * Read the key database (data/keys.json).
 * Returns an empty store on missing file or parse error — never throws.
 *
 * This file is the "Key database" of Phase 1: it lives in server/data (gitignored),
 * deliberately separate from STREAMS_DIR so encrypted segments and the keys that
 * decrypt them are never co-located or served together.
 */
function readStore(): KeyStore {
  try {
    if (!fs.existsSync(KEYS_PATH)) return {};
    const raw = fs.readFileSync(KEYS_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as KeyStore)
      : {};
  } catch {
    console.error('Error reading keys.json');
    return {};
  }
}

function writeStore(store: KeyStore): void {
  fs.writeFileSync(KEYS_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Persist (or overwrite) the AES-128 key for a video, keyed by video id.
 */
export function storeKey(videoId: string, key: StreamKey): void {
  const store = readStore();
  store[videoId] = key;
  writeStore(store);
}

/**
 * Look up the AES-128 key for a video. Returns undefined if absent.
 */
export function getKey(videoId: string): StreamKey | undefined {
  return readStore()[videoId];
}

/**
 * Remove a video's key (e.g. on transcode failure or deletion).
 */
export function deleteKey(videoId: string): void {
  const store = readStore();
  if (store[videoId]) {
    delete store[videoId];
    writeStore(store);
  }
}
