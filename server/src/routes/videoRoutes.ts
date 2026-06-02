import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Video, VideoSchema, UploadBodySchema } from '../types/video';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const uploadsDir = path.join(__dirname, '../../../uploads');
const dbPath = path.join(__dirname, '../../data/videos.json');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `video-${uniqueSuffix}${ext}`);
  }
});

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

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }
});

function getVideosList(): Video[] {
  try {
    if (!fs.existsSync(dbPath)) return [];
    const raw = fs.readFileSync(dbPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Video => VideoSchema.safeParse(item).success);
  } catch {
    console.error('Error reading videos.json');
    return [];
  }
}

function saveVideosList(videos: Video[]): void {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(videos, null, 2), 'utf-8');
  } catch {
    console.error('Error writing videos.json');
  }
}

// POST /api/upload
router.post('/upload', (req: Request, res: Response, next: NextFunction): void => {
  upload.single('video')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      next(new AppError(`Upload error: ${err.message}`, 400));
      return;
    }
    if (err instanceof Error) {
      next(new AppError(err.message, 400));
      return;
    }

    if (!req.file) {
      next(new AppError('No video file provided.', 400));
      return;
    }

    const bodyResult = UploadBodySchema.safeParse(req.body);
    const title = bodyResult.success && bodyResult.data.title
      ? bodyResult.data.title
      : req.file.originalname.replace(/\.[^/.]+$/, '');

    const newVideo: Video = {
      id: req.file.filename,
      title,
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      uploadDate: new Date().toISOString(),
      mimeType: req.file.mimetype
    };

    const videos = getVideosList();
    videos.unshift(newVideo);
    saveVideosList(videos);

    res.status(201).json({ message: 'Video uploaded successfully!', video: newVideo });
  });
});

// GET /api/videos
router.get('/videos', (_req: Request, res: Response): void => {
  res.status(200).json(getVideosList());
});

// GET /api/videos/:filename — single video metadata
router.get('/videos/:filename', (req: Request, res: Response, next: NextFunction): void => {
  const safeFilename = path.basename(req.params.filename);
  const video = getVideosList().find((v) => v.filename === safeFilename);
  if (!video) {
    next(new AppError('Video metadata not found', 404));
    return;
  }
  res.status(200).json(video);
});

// GET /api/video/:filename
router.get('/video/:filename', (req: Request, res: Response, next: NextFunction): void => {
  const safeFilename = path.basename(req.params.filename);
  const videoPath = path.join(uploadsDir, safeFilename);

  if (!fs.existsSync(videoPath)) {
    next(new AppError('Video file not found', 404));
    return;
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.status(416).set('Content-Range', `bytes */${fileSize}`).send('Requested Range Not Satisfiable');
      return;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4'
    });
    fs.createReadStream(videoPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(videoPath).pipe(res);
  }
});

export default router;
