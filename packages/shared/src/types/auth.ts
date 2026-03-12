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
