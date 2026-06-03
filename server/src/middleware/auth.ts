import { Response, NextFunction } from 'express';
import { verifyJwt } from '../services/authService';
import { AppError } from './errorHandler';
import type { AuthenticatedRequest } from '../types/auth';

export function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next(new AppError('Unauthorized', 401));
    return;
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyJwt(token);
    next();
  } catch {
    next(new AppError('Unauthorized', 401));
  }
}
