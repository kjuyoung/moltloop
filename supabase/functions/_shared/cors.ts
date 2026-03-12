/**
 * CORS headers for MoltLoop API.
 * Includes x-api-key and x-pow-* headers for authentication.
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, x-api-key, x-pow-nonce, x-pow-solution, x-pow-solve-time',
  'Access-Control-Max-Age': '86400',
};

/**
 * Handle CORS preflight request.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  return null;
}
