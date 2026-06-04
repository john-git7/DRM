import { z } from 'zod';

/**
 * Zod schema for Video entity
 * Validates video metadata stored in data/videos.json
 */
export const VideoSchema = z.object({
  id: z.string().describe('Unique identifier (filename)'),
  title: z.string().describe('Display title for the video'),
  originalName: z.string().describe('Original filename as uploaded'),
  filename: z.string().describe('Stored filename on disk'),
  size: z.number().int().positive().describe('File size in bytes'),
  uploadDate: z.string().datetime().describe('ISO 8601 timestamp of upload'),
  mimeType: z.string().describe('MIME type (e.g., video/mp4)'),
  // HLS/AES-128 pipeline state (Phase 1). Optional so pre-HLS entries still validate.
  hlsStatus: z
    .enum(['processing', 'ready', 'failed'])
    .optional()
    .describe('State of FFmpeg AES-128 HLS transcoding for this video'),
  hlsPlaylist: z
    .string()
    .optional()
    .describe('Relative URL of the encrypted .m3u8 playlist once ready'),
  hlsProgress: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('AES-128 HLS transcoding progress (0-100)')
});

/**
 * Inferred TypeScript type from VideoSchema
 */
export type Video = z.infer<typeof VideoSchema>;

/**
 * Zod schema for upload request body
 * Validates req.body on POST /api/upload
 */
export const UploadBodySchema = z.object({
  title: z.string().optional().describe('Optional custom title; defaults to original filename')
});

export type UploadBody = z.infer<typeof UploadBodySchema>;
