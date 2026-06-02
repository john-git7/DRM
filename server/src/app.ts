import express, { Request, Response } from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import videoRoutes from './routes/videoRoutes';

/**
 * Create and configure Express app
 * Does NOT call app.listen() — that's in server.ts
 */
const app = express();

// CORS middleware — allow requests from Vite dev server (http://localhost:5173)
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req: Request, res: Response): void => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api', videoRoutes);

// Global error handler (must be mounted last)
app.use(errorHandler);

export default app;
