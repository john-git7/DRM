import path from 'path';

/**
 * Centralized path configuration for uploads and database
 * Uses __dirname relative to this file's location to ensure correct paths
 * in both development and compiled contexts
 */

export const UPLOADS_DIR = path.join(__dirname, '../../../uploads');
export const DB_PATH = path.join(__dirname, '../../data/videos.json');

// Encrypted HLS output (playlists + .ts segments) — served to clients, safe to host on a CDN.
export const STREAMS_DIR = path.join(__dirname, '../../../streams');

// AES-128 decryption keys — MUST stay separate from STREAMS_DIR and never reach the CDN. Gitignored.
export const KEYS_PATH = path.join(__dirname, '../../data/keys.json');
