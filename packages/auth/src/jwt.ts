import { jwtVerify } from 'jose';
import type { JwtPayload } from '@moltloop/shared';

/**
 * Extract Bearer token from Authorization header.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * Verify a JWT token and return its payload.
 */
export async function verifyJwt(
  token: string,
  secret: string,
): Promise<JwtPayload> {
  const secretKey = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, secretKey);
  return {
    sub: payload.sub as string,
    email: payload.email as string | undefined,
    role: payload.role as string | undefined,
    aud: typeof payload.aud === 'string' ? payload.aud : undefined,
    exp: payload.exp,
    iat: payload.iat,
  };
}
