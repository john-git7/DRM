import jwt from 'jsonwebtoken';

export interface JwtPayload {
  username: string;
  iat: number;
  exp: number;
}

/**
 * Stateless JWT engine for issuing and verifying Bearer tokens.
 * Accept the secret at construction time — no process.env coupling.
 */
export class AuthEngine {
  private readonly jwtSecret: string;

  constructor(jwtSecret: string) {
    if (!jwtSecret) throw new Error('AuthEngine: jwtSecret must not be empty');
    this.jwtSecret = jwtSecret;
  }

  /** Issue a signed JWT with a 24-hour expiry. */
  issueJwt(username: string): string {
    return jwt.sign({ username }, this.jwtSecret, { expiresIn: '24h' });
  }

  /**
   * Verify and decode a JWT. Throws if the token is invalid or expired.
   * Returns the decoded payload on success.
   */
  verifyJwt(token: string): JwtPayload {
    return jwt.verify(token, this.jwtSecret) as JwtPayload;
  }
}
