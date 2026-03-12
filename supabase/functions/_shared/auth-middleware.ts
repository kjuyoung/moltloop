import { errorResponse } from './response.ts';

export interface AuthResult {
  ownerId: string;
  agentId?: string;
  authMethod: 'jwt' | 'api_key';
}

/**
 * Authenticate a request using JWT (from Supabase Auth) or API key.
 * For Edge Functions, we rely on Supabase's built-in JWT verification
 * via the createClient with the user's auth token.
 *
 * Returns the authenticated user context or an error response.
 */
export async function authenticateRequest(
  req: Request,
  supabaseClient: {
    auth: {
      getUser: (token?: string) => Promise<{
        data: { user: { id: string } | null };
        error: { message: string } | null;
      }>;
    };
    from: (table: string) => {
      select: (columns: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  },
): Promise<AuthResult | Response> {
  // Try JWT first (Authorization: Bearer <token>)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data, error } = await supabaseClient.auth.getUser(token);

    if (error || !data.user) {
      return errorResponse('UNAUTHORIZED', 'Invalid or expired JWT token', 401);
    }

    return {
      ownerId: data.user.id,
      authMethod: 'jwt',
    };
  }

  // Try API key (x-api-key header)
  const apiKey = req.headers.get('x-api-key');
  if (apiKey) {
    // Hash the API key and look up the agent
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(apiKey));
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const agentResult = await supabaseClient
      .from('agents')
      .select('id, owner_id')
      .eq('api_key_hash', hash)
      .maybeSingle();

    if (agentResult.error || !agentResult.data) {
      return errorResponse('UNAUTHORIZED', 'Invalid API key', 401);
    }

    return {
      ownerId: agentResult.data.owner_id as string,
      agentId: agentResult.data.id as string,
      authMethod: 'api_key',
    };
  }

  return errorResponse('UNAUTHORIZED', 'Missing authentication', 401);
}
