const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Path configurations
const uploadsDir = path.join(__dirname, '../../uploads');
const dbPath = path.join(__dirname, '../data/videos.json');

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate secure unique filename: timestamp + random number
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `video-${uniqueSuffix}${ext}`);
  }
});

// Configure Multer file filter
const fileFilter = (req, file, cb) => {
  // Validate that the uploaded file is indeed an MP4 video
  const mimeType = file.mimetype;
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (mimeType === 'video/mp4' && ext === '.mp4') {
    cb(null, true);
  } else {
    cb(new Error('Only MP4 video files (.mp4) are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB file limit
  }
});

/**
 * Utility: Read videos list from JSON store
 */
const getVideosList = () => {
  try {
    if (!fs.existsSync(dbPath)) {
      return [];
    }
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('Error reading videos JSON file:', error);
    return [];
  }
};

/**
 * Utility: Write videos list to JSON store
 */
const saveVideosList = (videos) => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(videos, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing to videos JSON file:', error);
  }
};

/**
 * POST /api/upload - Upload a video file
 */
router.post('/upload', (req, res) => {
  upload.single('video')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer specific errors
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      // Custom validation or other errors
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided.' });
    }

    const title = req.body.title || req.file.originalname.replace(/\.[^/.]+$/, "");
    const newVideo = {
      id: req.file.filename,
      title: title,
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      uploadDate: new Date().toISOString(),
      mimeType: req.file.mimetype
    };

    // Save to metadata store
    const videos = getVideosList();
    videos.unshift(newVideo); // add to top (newest first)
    saveVideosList(videos);

    res.status(201).json({
      message: 'Video uploaded successfully!',
      video: newVideo
    });
  });
});

/**
 * GET /api/videos - List all uploaded videos
 */
router.get('/videos', (req, res) => {
  const videos = getVideosList();
  res.status(200).json(videos);
});

/**
 * GET /api/video/:filename - Stream video via range requests
 */
router.get('/video/:filename', (req, res) => {
  // Prevent directory traversal attacks by taking only the basename
  const safeFilename = path.basename(req.params.filename);
  const videoPath = path.join(uploadsDir, safeFilename);

  // Check if file exists
  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // Boundary validation
    if (start >= fileSize || end >= fileSize) {
      res.status(416).set({
        'Content-Range': `bytes */${fileSize}`
      }).send('Requested Range Not Satisfiable');
      return;
    }

    const chunkSize = (end - start) + 1;
    const fileStream = fs.createReadStream(videoPath, { start, end });

    const headers = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    };

    res.writeHead(206, headers);
    fileStream.pipe(res);
  } else {
    const headers = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, headers);
    fs.createReadStream(videoPath).pipe(res);
  }
});

module.exports = router;
