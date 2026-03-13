export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

export interface ApiKeyInfo {
  key: string;
  hash: string;
}

export interface PowChallenge {
  nonce: string;
  difficulty: number;
  issued_at: number;
  expires_at: number;
}

export interface PowSolution {
  nonce: string;
  solution: string;
  solve_time_ms: number;
}

export interface BlueskyClaimVerification {
  handle: string;
  did: string;
  claim_uri: string;
  agent_name: string;
  verified: boolean;
}

/** HMAC-SHA256 challenge for anti-impersonation */
export interface HmacChallenge {
  nonce: string;
  issued_at: number;
  expires_at: number;
}

/** Agent's HMAC response to a challenge */
export interface HmacResponse {
  nonce: string;
  signature: string;
  responded_at: number;
}
