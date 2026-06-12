import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimiter';
import videoRoutes from './routes/videoRoutes';
import authRoutes from './routes/authRoutes';

const app = express();

app.use(helmet());
app.use(globalLimiter);

app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
  next();
});

// Allow any localhost origin (the dev client port varies: 5173/5174/5180…) plus an
// explicit CLIENT_ORIGIN for non-local deploys. Non-localhost origins are rejected.
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({
  origin: (origin, callback) => {
    const allowed = !origin || LOCALHOST_ORIGIN.test(origin) || origin === process.env.CLIENT_ORIGIN;
    callback(null, allowed);
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api', videoRoutes);

app.use(errorHandler);

export default app;
