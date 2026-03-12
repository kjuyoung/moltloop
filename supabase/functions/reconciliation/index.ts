// Reconciliation Worker Edge Function
// Triggered by pg_cron (every 1 minute)
// Detects stale pending states and requests ack re-sends
// Imports from: @moltloop/verification-service

Deno.serve(async (_req) => {
  // This function is invoked by pg_cron, not by external requests
  return new Response(
    JSON.stringify({
      message: 'Reconciliation Worker',
      status: 'not_implemented',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
