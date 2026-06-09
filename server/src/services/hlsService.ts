import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { STREAMS_DIR } from '../config/paths';
import { storeKey } from './keyService';

/** Target segment length in seconds (roadmap Phase 1: 6-second .ts segments). */
const SEGMENT_DURATION = 6;

export interface HlsResult {
  /** Absolute path of the generated playlist on disk. */
  playlistPath: string;
  /** Relative URL clients use to load the playlist. */
  relativePlaylistUrl: string;
}

/**
 * Transcode an uploaded MP4 into an AES-128 encrypted HLS stream (Phase 1).
 *
 * Produces 6-second .ts segments + an index.m3u8 under STREAMS_DIR/<videoId>/,
 * each segment encrypted with a freshly generated AES-128 key. The encrypted
 * output is safe to host on a CDN; the key itself is written to the separate
 * key database (keyService) and the raw key material on disk is destroyed
 * immediately after FFmpeg finishes.
 *
 * The playlist references the key via the relative URI "key", which resolves to
 * GET /api/hls/<videoId>/key — a JWT-gated endpoint (hardened further in Phase 2).
 *
 * Note: this uses one key per video, the standard HLS AES-128 setup. Per-segment
 * key rotation (FFmpeg periodic_rekey) is a future enhancement; keyService's schema
 * already isolates keys per video id so it can be extended without a data migration.
 */
export async function transcodeToHls(
  videoId: string,
  inputPath: string,
  onProgress?: (pct: number) => void
): Promise<HlsResult> {
  const safeId = path.basename(videoId);
  const outDir = path.join(STREAMS_DIR, safeId);
  fs.mkdirSync(outDir, { recursive: true });

  // Total duration (for a % progress estimate). Best-effort: 0 disables progress.
  const durationSec = await probeDuration(inputPath);

  const key = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const keyHex = key.toString('hex');
  const ivHex = iv.toString('hex');

  // The raw key file and FFmpeg key_info file go to a private temp dir — NEVER into
  // the public output dir. They are deleted as soon as FFmpeg exits.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-key-'));
  const keyFilePath = path.join(tmpDir, 'enc.key');
  const keyInfoPath = path.join(tmpDir, 'enc.keyinfo');

  try {
    fs.writeFileSync(keyFilePath, key);

    // key_info file format:
    //   line 1 — key URI written verbatim into the playlist (where the player fetches the key)
    //   line 2 — path to the key file FFmpeg reads to perform encryption
    //   line 3 — IV (hex) baked into the EXT-X-KEY tag
    fs.writeFileSync(keyInfoPath, `key\n${keyFilePath}\n${ivHex}\n`);

    const playlistPath = path.join(outDir, 'index.m3u8');
    const args = [
      '-y',
      '-i', inputPath,
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264', '-profile:v', 'main', '-crf', '28', '-preset', 'ultrafast',
      '-c:a', 'aac', '-b:a', '128k',
      '-threads', '1',
      '-max_muxing_queue_size', '1024',
      // Align keyframes to segment boundaries so each 6s segment starts cleanly.
      '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_DURATION})`,
      '-hls_time', String(SEGMENT_DURATION),
      '-hls_playlist_type', 'vod',
      '-hls_key_info_file', keyInfoPath,
      '-hls_segment_filename', path.join(outDir, 'seg_%03d.ts'),
      // Machine-readable progress on stdout (out_time_us=…) for the % estimate.
      '-progress', 'pipe:1', '-nostats',
      playlistPath
    ];

    await runFfmpeg(args, durationSec, onProgress);

    // Persist the key to the key DB only after a successful transcode.
    storeKey(safeId, { method: 'AES-128', keyHex, ivHex, createdAt: new Date().toISOString() });

    // Path is relative to the client's API_BASE (which already includes "/api").
    return { playlistPath, relativePlaylistUrl: `/hls/${safeId}/index.m3u8` };
  } finally {
    // Destroy raw key material regardless of success/failure.
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Probe the input's duration in seconds via ffprobe (0 on failure). */
function probeDuration(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', inputPath
    ]);
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('error', () => resolve(0));
    proc.on('close', () => resolve(parseFloat(out.trim()) || 0));
  });
}

/**
 * Run FFmpeg with the given args, resolving on exit code 0 and rejecting otherwise.
 * Captures the tail of stderr for errors and parses -progress output for a % estimate.
 */
function runFfmpeg(args: string[], durationSec: number, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    if (onProgress && durationSec > 0) {
      proc.stdout.on('data', (chunk) => {
        const text: string = chunk.toString();
        const re = /out_time_us=(\d+)/g;
        let m: RegExpExecArray | null;
        let lastUs = -1;
        while ((m = re.exec(text)) !== null) lastUs = parseInt(m[1], 10);
        if (lastUs >= 0) {
          onProgress(Math.min(99, Math.max(0, Math.round((lastUs / 1e6 / durationSec) * 100))));
        }
      });
    }
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) {
        if (onProgress) onProgress(100);
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`));
      }
    });
  });
}
