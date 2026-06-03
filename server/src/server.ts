import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import app from './app';
import { syncUploadsToJson } from './services/videoService';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

/**
 * Ensure required directories exist on startup
 */
function ensureDirectories(): void {
  const uploadsDir = path.join(__dirname, '../../uploads');
  const streamsDir = path.join(__dirname, '../../streams');
  const dataDir = path.join(__dirname, '../data');

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory at: ${uploadsDir}`);
  }

  // Encrypted HLS output (playlists + segments) lives alongside uploads/.
  if (!fs.existsSync(streamsDir)) {
    fs.mkdirSync(streamsDir, { recursive: true });
    console.log(`Created streams directory at: ${streamsDir}`);
  }

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`Created server data directory at: ${dataDir}`);
  }

  // Ensure initial videos.json exists
  const dbPath = path.join(dataDir, 'videos.json');
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([], null, 2), 'utf-8');
    console.log(`Created metadata JSON file at: ${dbPath}`);
  }

  // Ensure the AES-128 key database exists (kept separate from streams/, gitignored).
  const keysPath = path.join(dataDir, 'keys.json');
  if (!fs.existsSync(keysPath)) {
    fs.writeFileSync(keysPath, JSON.stringify({}, null, 2), 'utf-8');
    console.log(`Created key database at: ${keysPath}`);
  }

  // Seed the enrollment map (Phase 2). The admin user is enrolled in everything ("*").
  const enrollmentsPath = path.join(dataDir, 'enrollments.json');
  if (!fs.existsSync(enrollmentsPath)) {
    const admin = process.env.ADMIN_USERNAME || 'admin';
    fs.writeFileSync(enrollmentsPath, JSON.stringify({ [admin]: '*' }, null, 2), 'utf-8');
    console.log(`Created enrollment map at: ${enrollmentsPath}`);
  }

  // Ensure the audit log exists (Phase 6).
  const auditPath = path.join(dataDir, 'audit-log.json');
  if (!fs.existsSync(auditPath)) {
    fs.writeFileSync(auditPath, JSON.stringify([], null, 2), 'utf-8');
    console.log(`Created audit log at: ${auditPath}`);
  }
}

/**
 * Start the server
 */
function start(): void {
  ensureDirectories();

  // Sync any existing MP4 files in uploads/ into videos.json on startup
  const syncResult = syncUploadsToJson();
  if (syncResult.added > 0) {
    console.log(`Synced ${syncResult.added} video(s) from uploads directory`);
  }

  app.listen(PORT, () => {
    console.log(`Secure Video Player Backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

start();
