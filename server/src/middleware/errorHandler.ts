import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

/**
 * Custom application error class with HTTP status code
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Global error handler middleware
 * Must be mounted last (after all routes and other middleware)
 *
 * Express requires 4 parameters (including next) to identify this as error middleware
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log error for debugging
  console.error('[Error Handler]', {
    name: err.name,
    message: err.message,
    stack: err.stack
  });

  // Handle Multer-specific errors (file upload issues)
  if (err instanceof multer.MulterError) {
    res.status(400).json({
      error: `Upload error: ${err.message}`,
      code: err.code
    });
    return;
  }

  // Handle custom AppError with explicit status code
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message
    });
    return;
  }

  // Handle unknown errors with 500 status
  res.status(500).json({
    error: err.message || 'Internal Server Error'
  });
};
