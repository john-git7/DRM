import path from 'path';

/**
 * Centralized path configuration for uploads and database
 * Uses __dirname relative to this file's location to ensure correct paths
 * in both development and compiled contexts
 */

export const UPLOADS_DIR = path.join(__dirname, '../../../uploads');
export const DB_PATH = path.join(__dirname, '../../data/videos.json');
