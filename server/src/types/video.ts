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
  mimeType: z.string().describe('MIME type (e.g., video/mp4)')
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
