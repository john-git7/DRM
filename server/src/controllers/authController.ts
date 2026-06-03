import { Request, Response, NextFunction } from 'express';
import { validateCredentials, issueJwt } from '../services/authService';
import { AppError } from '../middleware/errorHandler';

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    next(new AppError('username and password are required', 400));
    return;
  }

  const valid = await validateCredentials(username, password);
  if (!valid) {
    next(new AppError('Invalid credentials', 401));
    return;
  }

  const token = issueJwt(username);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  res.status(200).json({ token, expiresAt });
}
