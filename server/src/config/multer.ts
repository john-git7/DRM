import multer from 'multer';
import path from 'path';
import { UPLOADS_DIR } from './paths';
import { AppError } from '../middleware/errorHandler';

/**
 * Multer storage configuration
 * Stores uploaded files in UPLOADS_DIR with unique names
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `video-${uniqueSuffix}${ext}`);
  }
});

/**
 * Multer file filter: only accept MP4 video files
 * Calls callback with AppError for invalid files (400 status)
 */
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype === 'video/mp4' && ext === '.mp4') {
    cb(null, true);
  } else {
    cb(new AppError('Only MP4 video files (.mp4) are allowed!', 400));
  }
};

/**
 * Multer instance configured for single video upload
 * - diskStorage: saves to UPLOADS_DIR with unique naming
 * - fileFilter: MP4 validation
 * - limits: 100MB max file size
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }
});
