import fs from 'fs';
import { ENROLLMENTS_PATH } from '../config/paths';

/**
 * Enrollment map: username -> list of video ids the user may decrypt, or the
 * wildcard "*" meaning "enrolled in everything". Stored in data/enrollments.json.
 *
 * This is the "Check enrollment" gate of Phase 2. In a real LMS this would be a
 * course-membership lookup; here it is a small flat file seeded with the admin
 * user mapped to "*".
 */
type EnrollmentMap = Record<string, '*' | string[]>;

function readEnrollments(): EnrollmentMap {
  try {
    if (!fs.existsSync(ENROLLMENTS_PATH)) return {};
    const raw = fs.readFileSync(ENROLLMENTS_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as EnrollmentMap)
      : {};
  } catch {
    console.error('Error reading enrollments.json');
    return {};
  }
}

/**
 * Return true if the user is allowed to access (decrypt) the given video.
 */
export function isEnrolled(username: string, videoId: string): boolean {
  const entry = readEnrollments()[username];
  if (!entry) return false;
  if (entry === '*') return true;
  return Array.isArray(entry) && entry.includes(videoId);
}
