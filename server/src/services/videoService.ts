import fs from 'fs';
import path from 'path';
import { Video, VideoSchema, UploadBodySchema } from '../types/video';
import { UPLOADS_DIR, DB_PATH } from '../config/paths';

/**
 * Get all videos from videos.json
 * Filters out invalid entries using VideoSchema validation
 * Returns empty array on file not found or parse error
 */
export function getVideos(): Video[] {
  try {
    if (!fs.existsSync(DB_PATH)) return [];
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Video => VideoSchema.safeParse(item).success);
  } catch {
    console.error('Error reading videos.json');
    return [];
  }
}

/**
 * Save videos array to videos.json
 * Logs errors but does not throw
 */
export function saveVideos(videos: Video[]): void {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(videos, null, 2), 'utf-8');
  } catch {
    console.error('Error writing videos.json');
  }
}

/**
 * Get a single video by filename
 * Returns undefined if not found
 */
export function getVideoByFilename(filename: string): Video | undefined {
  return getVideos().find((v) => v.filename === filename);
}

/**
 * Create a new video entry and save it to the database
 * - Uses file metadata (size, name) from Multer file object
 * - Uses title from request body if provided, otherwise derives from originalname
 * - Prepends to the list (newest first)
 * Returns the created Video object
 */
export function createVideo(file: Express.Multer.File, title: string): Video {
  const newVideo: Video = {
    id: file.filename,
    title,
    originalName: file.originalname,
    filename: file.filename,
    size: file.size,
    uploadDate: new Date().toISOString(),
    mimeType: file.mimetype
  };

  const videos = getVideos();
  videos.unshift(newVideo);
  saveVideos(videos);

  return newVideo;
}

/**
 * Sync uploads directory with videos.json
 * Scans UPLOADS_DIR for *.mp4 files not present in the video list
 * Creates entries using file stats (size from fs.statSync, birthtime for uploadDate)
 * Title derived from filename (without extension, hyphens/underscores replaced with spaces)
 * Returns count of newly added videos
 */
export function syncUploadsToJson(): { added: number } {
  const currentVideos = getVideos();
  const existingFilenames = new Set(currentVideos.map((v) => v.filename));

  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    let added = 0;

    for (const file of files) {
      if (!file.toLowerCase().endsWith('.mp4')) continue;
      if (existingFilenames.has(file)) continue;

      const filePath = path.join(UPLOADS_DIR, file);
      const stat = fs.statSync(filePath);

      // Derive title from filename: remove extension, replace hyphens/underscores with spaces
      const titleBase = path.parse(file).name;
      const derivedTitle = titleBase.replace(/[-_]/g, ' ');

      const newVideo: Video = {
        id: file,
        title: derivedTitle,
        originalName: file,
        filename: file,
        size: stat.size,
        uploadDate: stat.birthtime.toISOString(),
        mimeType: 'video/mp4'
      };

      currentVideos.unshift(newVideo);
      added++;
    }

    if (added > 0) {
      saveVideos(currentVideos);
    }

    return { added };
  } catch (error) {
    console.error('Error syncing uploads directory:', error);
    return { added: 0 };
  }
}

/**
 * Get the full file path for a video filename
 * Used by streamVideo controller to avoid path construction duplication
 */
export function getVideoFilePath(filename: string): string {
  return path.join(UPLOADS_DIR, filename);
}
