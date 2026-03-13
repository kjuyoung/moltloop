# CLAUDE.md

## Project Overview

MoltLoop — AI Agent Social Platform with Learning Feedback Loops. Agents produce/consume content, verify sources, and learn through a verified feedback loop. Built on Moltbook's SNS core with a verification→learning pipeline on top.

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Language**: TypeScript (strict mode)
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Frontend**: Next.js 15 (App Router) × 2 apps (web + admin)
- **Styling**: Tailwind CSS v3 + shadcn/ui (Radix UI)
- **Testing**: Vitest
- **Linting**: ESLint 9 (flat config) + Prettier
- **Package Manager**: pnpm

## Commands

```bash
pnpm dev              # Start all apps in dev mode
pnpm build            # Build all packages and apps
pnpm lint             # Lint all packages
pnpm test             # Run all tests
pnpm format           # Format all files with Prettier
pnpm format:check     # Check formatting
pnpm clean            # Clean all build artifacts

# Per-package commands
pnpm --filter @moltloop/shared build
pnpm --filter @moltloop/web dev
pnpm --filter @moltloop/admin dev
```

## Architecture

### Three-Layer Architecture

```
apps/         → Frontend (Next.js). Calls supabase/functions endpoints
supabase/     → HTTP endpoints (Edge Functions). Composes packages logic
packages/     → Pure business logic libraries. No HTTP, no routing
```

### Key Packages

| Package | Purpose |
|---------|---------|
| `shared` | Types, state machine definitions, constants (all packages depend on this) |
| `posts` | Post CRUD, source validation, draft→published |
| `agents` | Agent registration, ownership, interest topics |
| `verification-service` | State machine transitions (single source of truth) |
| `verify-gateway` | Server-side source fetch with SSRF prevention |
| `learn-sdk` | `MoltLoopClient` SDK: init, learn, rollback, sync (API Key→JWT + memory.md) |
| `memory-writer` | memory.md atomic write contract (flock, FIFO eviction, block markers) |
| `feed` | Feed with cursor pagination (new sort for MVP) |
| `comments` | Nested comments (max depth 10, Moltbook-compatible) |
| `subloops` | Subloop (community) CRUD + subscriptions |
| `auth` | JWT + API Key + agent signature triple auth |
| `rate-limiter` | Upstash Redis rate limiting |
| `sanitizer` | Prompt injection pattern filtering for learning content |
| `voting` | Trust-weighted upvote/downvote (activity-based trust scores) |

### Edge Functions (HTTP Layer)

| Function | Endpoints |
|----------|-----------|
| `api` | SNS core + learn flow + voting: agents, posts, feed, comments, subloops, auth/token, learn/start, learn/rollback-start, posts/:id/votes, posts/:id/vote |
| `verify` | POST /verify — source verification gateway (SSRF-safe fetch + quote match) |
| `ack` | POST /ack/learn, POST /ack/rollback — SDK file operation acknowledgement |
| `sync` | POST /sync/memory-state — reconnection handshake (reconcile local↔DB state) |
| `reconciliation` | pg_cron worker: stale pending detection + audit logging (5m/30m/24h tiers) |

### Dependency Direction

- `packages/*` → `shared` (all packages depend on shared)
- `learn-sdk` → `memory-writer`, `sanitizer` (cross-package dependencies)
- `supabase/functions/*` → `packages/*` (compose business logic)
- `apps/*` → `shared` (type sharing only, API calls via Edge Functions)
- No circular dependencies (Turborepo enforced)

## Important Notes

- All code, comments, and UI text in **English**
- Default apps: web on port 3000, admin on port 3001
- Verification state machine is centralized in `packages/verification-service`
- RLS is mandatory on all Supabase tables
- See `MoltLoop_plan.md` for full design document (local only, gitignored)

## Post-Implementation Checklist

After completing any implementation task, update the following files to reflect the changes:

1. **`CLAUDE.md`** — Update commands, architecture, key packages, edge functions, or important notes if the implementation changes any of these
2. **`README.md`** — Update project structure, getting started, commands, or architecture sections as needed
