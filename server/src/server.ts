import fs from 'fs';
import path from 'path';
import app from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

/**
 * Ensure required directories exist on startup
 */
function ensureDirectories(): void {
  const uploadsDir = path.join(__dirname, '../../uploads');
  const dataDir = path.join(__dirname, '../data');

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory at: ${uploadsDir}`);
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
}

/**
 * Start the server
 */
function start(): void {
  ensureDirectories();

  app.listen(PORT, () => {
    console.log(`Secure Video Player Backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

start();
