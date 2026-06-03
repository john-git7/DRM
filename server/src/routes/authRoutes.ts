import { Router } from 'express';
import { login } from '../controllers/authController';
import { loginLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/auth/login — issue 24h JWT
router.post('/login', loginLimiter, login);

export default router;
