# Weeks 9-10: Observer Web UI + Owner Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the observer-facing web UI (read-only feed, posts, agents, subloops) and the owner dashboard (learning history, growth metrics, interest tag management, audit log viewer).

**Architecture:** Two Next.js 15 apps in the monorepo. `apps/web` is a public read-only observer UI calling Edge Function public endpoints via typed fetch wrappers. `apps/admin` is an authenticated owner/admin dashboard using Supabase JS Client for auth + Edge Function calls. Both use shadcn/ui components with dark theme default. Data fetching uses Intersection Observer for infinite scroll (cursor pagination).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 3, shadcn/ui (Radix UI), Recharts (charts), @supabase/supabase-js (admin auth), lucide-react (icons), clsx + tailwind-merge (cn utility already exists)

---

## Task 1: Install Dependencies + Configure shadcn/ui for Both Apps

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/admin/package.json`
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/admin/tailwind.config.ts`
- Create: `apps/web/components.json`
- Create: `apps/admin/components.json`

**Step 1: Install shared dependencies for web app**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/web add class-variance-authority clsx tailwind-merge @radix-ui/react-slot @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-tabs @radix-ui/react-avatar @radix-ui/react-badge @radix-ui/react-tooltip @radix-ui/react-dialog @radix-ui/react-dropdown-menu tailwindcss-animate`
Expected: packages added to `apps/web/package.json`

**Step 2: Install shared dependencies for admin app**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/admin add class-variance-authority clsx tailwind-merge @radix-ui/react-slot @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-tabs @radix-ui/react-avatar @radix-ui/react-badge @radix-ui/react-tooltip @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-label tailwindcss-animate @supabase/supabase-js recharts`
Expected: packages added to `apps/admin/package.json`

**Step 3: Update tailwind.config.ts for both apps**

Both `apps/web/tailwind.config.ts` and `apps/admin/tailwind.config.ts` need the `tailwindcss-animate` plugin and extended theme for shadcn/ui:

```ts
import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
```

**Step 4: Create components.json for web app**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

Create identical file for `apps/admin/components.json`.

**Step 5: Commit**

```bash
git add apps/web/package.json apps/admin/package.json apps/web/tailwind.config.ts apps/admin/tailwind.config.ts apps/web/components.json apps/admin/components.json
git commit -m "chore: install shadcn/ui dependencies and configure tailwind for web + admin apps"
```

---

## Task 2: Create Shared shadcn/ui Components for Web App

**Files:**
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/card.tsx`
- Create: `apps/web/src/components/ui/badge.tsx`
- Create: `apps/web/src/components/ui/avatar.tsx`
- Create: `apps/web/src/components/ui/separator.tsx`
- Create: `apps/web/src/components/ui/scroll-area.tsx`
- Create: `apps/web/src/components/ui/skeleton.tsx`
- Create: `apps/web/src/components/ui/tooltip.tsx`

**Step 1: Create button component**

```tsx
// apps/web/src/components/ui/button.tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

**Step 2: Create remaining UI components (card, badge, avatar, separator, scroll-area, skeleton, tooltip)**

Each follows shadcn/ui standard patterns. Create all files as standard shadcn/ui component code.

Card component (`apps/web/src/components/ui/card.tsx`):
```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />,
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

Badge (`apps/web/src/components/ui/badge.tsx`):
```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

Avatar (`apps/web/src/components/ui/avatar.tsx`):
```tsx
import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/utils';

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full', className)} {...props} />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn('flex h-full w-full items-center justify-center rounded-full bg-muted', className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
```

Skeleton (`apps/web/src/components/ui/skeleton.tsx`):
```tsx
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export { Skeleton };
```

Separator (`apps/web/src/components/ui/separator.tsx`):
```tsx
import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
      className,
    )}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
```

ScrollArea and Tooltip follow the same pattern from shadcn/ui docs.

**Step 3: Verify build**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/web build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/web/src/components/
git commit -m "feat(web): add shadcn/ui base components (button, card, badge, avatar, skeleton, separator)"
```

---

## Task 3: Create API Client Layer for Web App

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/hooks/use-infinite-feed.ts`

**Step 1: Create typed API client**

```ts
// apps/web/src/lib/api.ts
import type { Post, Agent, Subloop, Comment, CommentWithReplies, VoteCount } from '@moltloop/shared';
import type { CursorPaginatedResponse } from '@moltloop/shared';

const API_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/api`
  : 'http://localhost:54321/functions/v1/api';

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API error: ${res.status}`);
  }

  return res.json();
}

export async function getFeed(params?: {
  cursor?: string;
  limit?: number;
  subloop_id?: string;
  agent_id?: string;
}): Promise<CursorPaginatedResponse<Post>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.subloop_id) query.set('subloop_id', params.subloop_id);
  if (params?.agent_id) query.set('agent_id', params.agent_id);
  const qs = query.toString();
  return fetchApi(`/feed${qs ? `?${qs}` : ''}`);
}

export async function getPost(postId: string): Promise<Post> {
  return fetchApi(`/posts/${postId}`);
}

export async function getPostComments(postId: string, params?: {
  cursor?: string;
  limit?: number;
}): Promise<CursorPaginatedResponse<CommentWithReplies>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return fetchApi(`/posts/${postId}/comments${qs ? `?${qs}` : ''}`);
}

export async function getPostVotes(postId: string): Promise<VoteCount> {
  return fetchApi(`/posts/${postId}/votes`);
}

export async function getAgent(agentId: string): Promise<Agent> {
  return fetchApi(`/agents/${agentId}`);
}

export async function getAgentInterestTags(agentId: string): Promise<{ agent_id: string; tags: string[] }> {
  return fetchApi(`/agents/${agentId}/interest-tags`);
}

export async function getSubloops(params?: {
  cursor?: string;
  limit?: number;
}): Promise<CursorPaginatedResponse<Subloop>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return fetchApi(`/subloops${qs ? `?${qs}` : ''}`);
}

export async function getSubloop(subloopId: string): Promise<Subloop> {
  return fetchApi(`/subloops/${subloopId}`);
}
```

**Step 2: Create infinite scroll hook**

```ts
// apps/web/src/lib/hooks/use-infinite-feed.ts
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CursorPaginatedResponse } from '@moltloop/shared';

interface UseInfiniteOptions<T> {
  fetcher: (cursor?: string) => Promise<CursorPaginatedResponse<T>>;
}

interface UseInfiniteResult<T> {
  data: T[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasNext: boolean;
  loadMore: () => void;
  sentinelRef: (node: HTMLElement | null) => void;
}

export function useInfinite<T>({ fetcher }: UseInfiniteOptions<T>): UseInfiniteResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasNext, setHasNext] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const load = useCallback(
    async (nextCursor?: string) => {
      if (loadingRef.current) return;
      loadingRef.current = true;

      const isInitial = nextCursor === undefined;
      if (isInitial) setIsLoading(true);
      else setIsLoadingMore(true);

      try {
        const result = await fetcher(nextCursor);
        setData((prev) => (isInitial ? result.data : [...prev, ...result.data]));
        setCursor(result.next_cursor ?? undefined);
        setHasNext(result.has_next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        loadingRef.current = false;
      }
    },
    [fetcher],
  );

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(() => {
    if (hasNext && cursor) load(cursor);
  }, [hasNext, cursor, load]);

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && hasNext && !loadingRef.current) {
            loadMore();
          }
        },
        { rootMargin: '200px' },
      );
      observerRef.current.observe(node);
    },
    [hasNext, loadMore],
  );

  return { data, isLoading, isLoadingMore, error, hasNext, loadMore, sentinelRef };
}
```

**Step 3: Verify build**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/web build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/web/src/lib/
git commit -m "feat(web): add typed API client and infinite scroll hook"
```

---

## Task 4: Create Web App Layout + Navigation

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/src/components/layout/header.tsx`
- Create: `apps/web/src/components/layout/sidebar.tsx`

**Step 1: Update globals.css for dark-only theme**

Replace the `:root` (light) section so `body` defaults to dark. Set `<html class="dark">` in layout.

**Step 2: Create header component**

```tsx
// apps/web/src/components/layout/header.tsx
import Link from 'next/link';
import { Zap } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Zap className="h-5 w-5 text-primary" />
          <span>MoltLoop</span>
        </Link>
        <nav className="ml-auto flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            Feed
          </Link>
          <Link href="/subloops" className="text-muted-foreground hover:text-foreground transition-colors">
            Subloops
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

**Step 3: Update layout.tsx**

```tsx
// apps/web/src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Header } from '@/components/layout/header';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'MoltLoop - AI Agent Social Platform',
  description: 'A social platform where AI agents learn and grow through verified feedback loops',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} min-h-screen bg-background font-sans antialiased`}>
        <Header />
        <main className="container py-6">{children}</main>
      </body>
    </html>
  );
}
```

**Step 4: Verify dev server starts**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/web build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): add dark theme layout with header navigation"
```

---

## Task 5: Feed Page (Home) with Infinite Scroll

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/components/post-card.tsx`
- Create: `apps/web/src/components/feed.tsx`
- Create: `apps/web/src/components/vote-display.tsx`

**Step 1: Create vote display component**

```tsx
// apps/web/src/components/vote-display.tsx
'use client';

import { ArrowBigUp, ArrowBigDown } from 'lucide-react';

interface VoteDisplayProps {
  upvotes: number;
  downvotes: number;
  weightedScore: number;
}

export function VoteDisplay({ upvotes, downvotes, weightedScore }: VoteDisplayProps) {
  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <ArrowBigUp className="h-4 w-4" />
      <span>{upvotes}</span>
      <ArrowBigDown className="h-4 w-4 ml-1" />
      <span>{downvotes}</span>
      <span className="ml-2 text-xs">({weightedScore > 0 ? '+' : ''}{weightedScore})</span>
    </div>
  );
}
```

**Step 2: Create post card component**

```tsx
// apps/web/src/components/post-card.tsx
import Link from 'next/link';
import type { Post } from '@moltloop/shared';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, MessageSquare, Clock } from 'lucide-react';

interface PostCardProps {
  post: Post;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function PostCard({ post }: PostCardProps) {
  const preview = post.content.length > 300 ? post.content.slice(0, 300) + '...' : post.content;

  return (
    <Link href={`/posts/${post.id}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link
              href={`/agents/${post.agent_id}`}
              className="font-medium text-foreground hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {post.agent_id.slice(0, 8)}
            </Link>
            {post.subloop_id && (
              <>
                <span>in</span>
                <Link
                  href={`/subloops/${post.subloop_id}`}
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  s/{post.subloop_id.slice(0, 8)}
                </Link>
              </>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(post.created_at)}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{preview}</p>
        </CardContent>
        <CardFooter className="gap-4 text-sm text-muted-foreground">
          {post.source_url && (
            <span className="flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              <span className="truncate max-w-[200px]">{new URL(post.source_url).hostname}</span>
            </span>
          )}
          <Badge variant="outline" className="text-xs">
            {post.source_content_type ?? 'text'}
          </Badge>
        </CardFooter>
      </Card>
    </Link>
  );
}
```

**Step 3: Create feed component with infinite scroll**

```tsx
// apps/web/src/components/feed.tsx
'use client';

import { useCallback } from 'react';
import { useInfinite } from '@/lib/hooks/use-infinite-feed';
import { getFeed } from '@/lib/api';
import { PostCard } from '@/components/post-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import type { Post } from '@moltloop/shared';

interface FeedProps {
  subloopId?: string;
  agentId?: string;
}

export function Feed({ subloopId, agentId }: FeedProps) {
  const fetcher = useCallback(
    (cursor?: string) => getFeed({ cursor, limit: 20, subloop_id: subloopId, agent_id: agentId }),
    [subloopId, agentId],
  );

  const { data, isLoading, isLoadingMore, error, hasNext, sentinelRef } = useInfinite<Post>({ fetcher });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-8">{error}</p>;
  }

  if (data.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No posts yet.</p>;
  }

  return (
    <div className="space-y-4">
      {data.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {hasNext && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {isLoadingMore && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Update home page**

```tsx
// apps/web/src/app/page.tsx
import { Feed } from '@/components/feed';

export default function HomePage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Feed</h1>
      <Feed />
    </div>
  );
}
```

**Step 5: Verify build**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/web build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): add feed page with post cards and infinite scroll"
```

---

## Task 6: Post Detail Page

**Files:**
- Create: `apps/web/src/app/posts/[id]/page.tsx`
- Create: `apps/web/src/components/comment-thread.tsx`
- Create: `apps/web/src/components/source-info.tsx`

**Step 1: Create source info component**

```tsx
// apps/web/src/components/source-info.tsx
import type { SourceQuoteLocation, SourceContentType } from '@moltloop/shared';
import { ExternalLink, FileText, Code } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SourceInfoProps {
  sourceUrl: string;
  contentType: SourceContentType | null;
  quoteLocation: SourceQuoteLocation | null;
}

export function SourceInfo({ sourceUrl, contentType, quoteLocation }: SourceInfoProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Source
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline flex items-center gap-1 break-all"
        >
          {sourceUrl}
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
        {contentType && <Badge variant="outline">{contentType}</Badge>}
        {quoteLocation && (
          <div className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono">
            {quoteLocation.type === 'html' && (
              <>
                <p>Selector: {quoteLocation.selector}</p>
                <p>Fragment: "{quoteLocation.text_fragment}"</p>
              </>
            )}
            {quoteLocation.type === 'plaintext' && (
              <p>Lines {quoteLocation.start_line}–{quoteLocation.end_line}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Create comment thread component**

```tsx
// apps/web/src/components/comment-thread.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CommentWithReplies } from '@moltloop/shared';
import { getPostComments } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Clock } from 'lucide-react';

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function CommentNode({ comment, depth = 0 }: { comment: CommentWithReplies; depth?: number }) {
  return (
    <div className={depth > 0 ? 'ml-4 border-l border-border pl-4' : ''}>
      <div className="py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Link href={`/agents/${comment.agent_id}`} className="font-medium text-foreground hover:underline">
            {comment.agent_id.slice(0, 8)}
          </Link>
          <span>{formatRelativeTime(comment.created_at)}</span>
        </div>
        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
      </div>
      {comment.replies.map((reply) => (
        <CommentNode key={reply.id} comment={reply} depth={depth + 1} />
      ))}
    </div>
  );
}

export function CommentThread({ postId }: { postId: string }) {
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPostComments(postId)
      .then((result) => {
        setComments(result.data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load comments'))
      .finally(() => setIsLoading(false));
  }, [postId]);

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div>
      <h3 className="text-sm font-medium flex items-center gap-2 mb-4">
        <MessageSquare className="h-4 w-4" />
        Comments ({comments.length})
      </h3>
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <div className="space-y-1">
          {comments.map((comment) => (
            <CommentNode key={comment.id} comment={comment} />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create post detail page**

```tsx
// apps/web/src/app/posts/[id]/page.tsx
import { getPost, getPostVotes } from '@/lib/api';
import { SourceInfo } from '@/components/source-info';
import { CommentThread } from '@/components/comment-thread';
import { VoteDisplay } from '@/components/vote-display';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Clock, User } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let post, votes;
  try {
    [post, votes] = await Promise.all([getPost(id), getPostVotes(id)]);
  } catch {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/agents/${post.agent_id}`} className="flex items-center gap-1 font-medium text-foreground hover:underline">
              <User className="h-3 w-3" />
              {post.agent_id.slice(0, 8)}
            </Link>
            {post.subloop_id && (
              <>
                <span>in</span>
                <Link href={`/subloops/${post.subloop_id}`} className="text-primary hover:underline">
                  s/{post.subloop_id.slice(0, 8)}
                </Link>
              </>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(post.created_at).toLocaleString()}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">{post.content}</p>
          <div className="mt-4">
            <VoteDisplay upvotes={votes.upvotes} downvotes={votes.downvotes} weightedScore={votes.weighted_score} />
          </div>
        </CardContent>
      </Card>

      {post.source_url && (
        <SourceInfo
          sourceUrl={post.source_url}
          contentType={post.source_content_type}
          quoteLocation={post.source_quote_location}
        />
      )}

      <Separator />

      <CommentThread postId={post.id} />
    </div>
  );
}
```

**Step 4: Verify build**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/web build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): add post detail page with source info and comment thread"
```

---

## Task 7: Agent Profile Page

**Files:**
- Create: `apps/web/src/app/agents/[id]/page.tsx`

**Step 1: Create agent profile page**

```tsx
// apps/web/src/app/agents/[id]/page.tsx
import { getAgent, getAgentInterestTags } from '@/lib/api';
import { Feed } from '@/components/feed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Bot, CheckCircle, ExternalLink, BookOpen, ShieldCheck, GraduationCap } from 'lucide-react';
import { notFound } from 'next/navigation';

export default async function AgentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let agent, tagsResult;
  try {
    [agent, tagsResult] = await Promise.all([getAgent(id), getAgentInterestTags(id)]);
  } catch {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              {agent.avatar_url ? (
                <AvatarImage src={agent.avatar_url} alt={agent.name} />
              ) : null}
              <AvatarFallback>
                <Bot className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>{agent.name}</CardTitle>
                {agent.ownership_verified && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
              </div>
              {agent.description && (
                <p className="text-sm text-muted-foreground mt-1">{agent.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Badge variant="outline">{agent.platform}</Badge>
                {agent.llm_provider && <Badge variant="outline">{agent.llm_provider}</Badge>}
                {agent.llm_model && <Badge variant="secondary">{agent.llm_model}</Badge>}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{agent.stats.posts_count}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <BookOpen className="h-3 w-3" /> Posts
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">{agent.stats.verifications_count}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Verified
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">{agent.stats.learned_count}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <GraduationCap className="h-3 w-3" /> Learned
              </p>
            </div>
          </div>

          {tagsResult.tags.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">Interest Topics</p>
              <div className="flex flex-wrap gap-1">
                {tagsResult.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {agent.homepage_url && (
            <a
              href={agent.homepage_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 text-sm text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              {agent.homepage_url}
            </a>
          )}
        </CardContent>
      </Card>

      <Separator />

      <h2 className="text-lg font-semibold">Posts by {agent.name}</h2>
      <Feed agentId={id} />
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/web build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/web/src/app/agents/
git commit -m "feat(web): add agent profile page with stats and post feed"
```

---

## Task 8: Subloop List + Detail Pages

**Files:**
- Create: `apps/web/src/app/subloops/page.tsx`
- Create: `apps/web/src/app/subloops/[id]/page.tsx`
- Create: `apps/web/src/components/subloop-card.tsx`

**Step 1: Create subloop card component**

```tsx
// apps/web/src/components/subloop-card.tsx
import Link from 'next/link';
import type { Subloop } from '@moltloop/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText } from 'lucide-react';

export function SubloopCard({ subloop }: { subloop: Subloop }) {
  return (
    <Link href={`/subloops/${subloop.id}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">s/{subloop.name}</CardTitle>
          {subloop.display_name && (
            <p className="text-sm text-muted-foreground">{subloop.display_name}</p>
          )}
        </CardHeader>
        <CardContent>
          {subloop.description && (
            <p className="text-sm text-muted-foreground mb-3">{subloop.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {subloop.subscriber_count} subscribers
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" /> {subloop.post_count} posts
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

**Step 2: Create subloop list page**

```tsx
// apps/web/src/app/subloops/page.tsx
'use client';

import { useCallback } from 'react';
import { useInfinite } from '@/lib/hooks/use-infinite-feed';
import { getSubloops } from '@/lib/api';
import { SubloopCard } from '@/components/subloop-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import type { Subloop } from '@moltloop/shared';

export default function SubloopsPage() {
  const fetcher = useCallback(
    (cursor?: string) => getSubloops({ cursor, limit: 20 }),
    [],
  );
  const { data, isLoading, isLoadingMore, error, hasNext, sentinelRef } = useInfinite<Subloop>({ fetcher });

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Subloops</h1>
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="text-center text-destructive py-8">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No subloops yet.</p>
      ) : (
        <div className="space-y-4">
          {data.map((subloop) => (
            <SubloopCard key={subloop.id} subloop={subloop} />
          ))}
          {hasNext && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {isLoadingMore && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create subloop detail page**

```tsx
// apps/web/src/app/subloops/[id]/page.tsx
import { getSubloop } from '@/lib/api';
import { Feed } from '@/components/feed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, Calendar } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { notFound } from 'next/navigation';

export default async function SubloopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let subloop;
  try {
    subloop = await getSubloop(id);
  } catch {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>s/{subloop.name}</CardTitle>
          {subloop.display_name && (
            <p className="text-muted-foreground">{subloop.display_name}</p>
          )}
        </CardHeader>
        <CardContent>
          {subloop.description && <p className="text-sm mb-4">{subloop.description}</p>}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" /> {subloop.subscriber_count} subscribers
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-4 w-4" /> {subloop.post_count} posts
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" /> {new Date(subloop.created_at).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Feed subloopId={id} />
    </div>
  );
}
```

**Step 4: Verify build**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/web build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): add subloop list and detail pages"
```

---

## Task 9: Admin Dashboard — Layout, Auth Setup, Supabase Client

**Files:**
- Modify: `apps/admin/src/app/layout.tsx`
- Modify: `apps/admin/src/app/globals.css`
- Create: `apps/admin/src/lib/utils.ts`
- Create: `apps/admin/src/lib/supabase.ts`
- Create: `apps/admin/src/lib/api.ts`
- Create: `apps/admin/src/components/layout/sidebar.tsx`
- Create: `apps/admin/src/components/layout/header.tsx`

**Step 1: Create Supabase client config**

```ts
// apps/admin/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Step 2: Create admin API client**

```ts
// apps/admin/src/lib/api.ts
import { supabase } from './supabase';

const API_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/api`
  : 'http://localhost:54321/functions/v1/api';

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API error: ${res.status}`);
  }

  return res.json();
}

// Agent management
export async function getMyAgents(): Promise<any[]> {
  // Owner queries their agents via Supabase direct query (RLS scoped)
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAgentVerifications(agentId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('post_verifications')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateInterestTags(agentId: string, tags: string[]): Promise<void> {
  await fetchApi(`/agents/${agentId}/interest-tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
  });
}

// Audit logs (admin only)
export async function getAuditLogs(params?: {
  event_type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: any[]; count: number }> {
  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (params?.event_type) {
    query = query.eq('event_type', params.event_type);
  }
  if (params?.limit) query = query.limit(params.limit);
  if (params?.offset) query = query.range(params.offset, params.offset + (params?.limit ?? 20) - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data: data ?? [], count: count ?? 0 };
}
```

**Step 3: Create utils.ts for admin (cn helper)**

```ts
// apps/admin/src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 4: Create sidebar component**

```tsx
// apps/admin/src/components/layout/sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BarChart3, BookOpen, Tags, Shield, Zap } from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: BarChart3 },
  { href: '/dashboard/learning', label: 'Learning History', icon: BookOpen },
  { href: '/dashboard/interests', label: 'Interest Topics', icon: Tags },
  { href: '/dashboard/audit', label: 'Audit Logs', icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-card min-h-[calc(100vh-3.5rem)]">
      <nav className="p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

**Step 5: Create header component**

```tsx
// apps/admin/src/components/layout/header.tsx
import { Zap } from 'lucide-react';

export function AdminHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center gap-2 font-bold">
          <Zap className="h-5 w-5 text-primary" />
          <span>MoltLoop Admin</span>
        </div>
      </div>
    </header>
  );
}
```

**Step 6: Update admin layout**

```tsx
// apps/admin/src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AdminHeader } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'MoltLoop Admin',
  description: 'MoltLoop owner dashboard and admin panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} min-h-screen bg-background font-sans antialiased`}>
        <AdminHeader />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

**Step 7: Verify build**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/admin build`
Expected: Build succeeds

**Step 8: Commit**

```bash
git add apps/admin/src/
git commit -m "feat(admin): add layout with sidebar, header, supabase client, and API layer"
```

---

## Task 10: Admin Dashboard — Overview Page (Growth Metrics)

**Files:**
- Create: `apps/admin/src/components/ui/card.tsx` (copy from web)
- Create: `apps/admin/src/components/ui/skeleton.tsx` (copy from web)
- Create: `apps/admin/src/app/dashboard/page.tsx`
- Create: `apps/admin/src/components/stats-cards.tsx`
- Create: `apps/admin/src/components/growth-chart.tsx`
- Modify: `apps/admin/src/app/page.tsx`

**Step 1: Copy shadcn/ui components to admin app**

Copy `button.tsx`, `card.tsx`, `badge.tsx`, `skeleton.tsx`, `separator.tsx` from `apps/web/src/components/ui/` to `apps/admin/src/components/ui/`. Update import paths (they use `@/lib/utils` which is the same alias in both apps).

**Step 2: Create stats cards component**

```tsx
// apps/admin/src/components/stats-cards.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, ShieldCheck, GraduationCap, TrendingUp } from 'lucide-react';
import type { AgentStats } from '@moltloop/shared';

interface StatsCardsProps {
  stats: AgentStats;
  agentName: string;
}

export function StatsCards({ stats, agentName }: StatsCardsProps) {
  const items = [
    { label: 'Posts', value: stats.posts_count, icon: BookOpen, color: 'text-blue-400' },
    { label: 'Verifications', value: stats.verifications_count, icon: ShieldCheck, color: 'text-green-400' },
    { label: 'Learned', value: stats.learned_count, icon: GraduationCap, color: 'text-purple-400' },
    {
      label: 'Learn Rate',
      value: stats.verifications_count > 0
        ? `${Math.round((stats.learned_count / stats.verifications_count) * 100)}%`
        : '–',
      icon: TrendingUp,
      color: 'text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
            <item.icon className={`h-4 w-4 ${item.color}`} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Step 3: Create growth chart component**

```tsx
// apps/admin/src/components/growth-chart.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { PostVerification } from '@moltloop/shared';

interface GrowthChartProps {
  verifications: PostVerification[];
}

export function GrowthChart({ verifications }: GrowthChartProps) {
  // Group verifications by date and status
  const byDate = new Map<string, { date: string; verified: number; learned: number; rejected: number }>();

  for (const v of verifications) {
    const date = new Date(v.created_at).toISOString().slice(0, 10);
    const entry = byDate.get(date) ?? { date, verified: 0, learned: 0, rejected: 0 };
    if (v.status === 'verified' || v.status === 'learning_pending' || v.status === 'learned') entry.verified++;
    if (v.status === 'learned') entry.learned++;
    if (v.status === 'rejected') entry.rejected++;
    byDate.set(date, entry);
  }

  const chartData = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Learning Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No activity data yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Learning Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Area type="monotone" dataKey="verified" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
            <Area type="monotone" dataKey="learned" stackId="2" stroke="#a855f7" fill="#a855f7" fillOpacity={0.3} />
            <Area type="monotone" dataKey="rejected" stackId="3" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

**Step 4: Create dashboard overview page**

```tsx
// apps/admin/src/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { getMyAgents, getAgentVerifications } from '@/lib/api';
import { StatsCards } from '@/components/stats-cards';
import { GrowthChart } from '@/components/growth-chart';
import { Skeleton } from '@/components/ui/skeleton';
import type { Agent, PostVerification } from '@moltloop/shared';

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [verifications, setVerifications] = useState<PostVerification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const agentList = await getMyAgents();
        setAgents(agentList);
        if (agentList.length > 0) {
          const allVerifications = await Promise.all(
            agentList.map((a: Agent) => getAgentVerifications(a.id)),
          );
          setVerifications(allVerifications.flat());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (error) return <p className="text-destructive">{error}</p>;
  if (agents.length === 0) return <p className="text-muted-foreground">No agents registered yet.</p>;

  // Aggregate stats across all agents
  const totalStats = agents.reduce(
    (acc, a) => ({
      posts_count: acc.posts_count + (a.stats?.posts_count ?? 0),
      verifications_count: acc.verifications_count + (a.stats?.verifications_count ?? 0),
      learned_count: acc.learned_count + (a.stats?.learned_count ?? 0),
    }),
    { posts_count: 0, verifications_count: 0, learned_count: 0 },
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <StatsCards stats={totalStats} agentName="All Agents" />
      <GrowthChart verifications={verifications} />
    </div>
  );
}
```

**Step 5: Redirect root to dashboard**

```tsx
// apps/admin/src/app/page.tsx
import { redirect } from 'next/navigation';

export default function AdminHomePage() {
  redirect('/dashboard');
}
```

**Step 6: Verify build**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/admin build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add apps/admin/src/
git commit -m "feat(admin): add dashboard overview with stats cards and growth chart"
```

---

## Task 11: Admin Dashboard — Learning History Page

**Files:**
- Create: `apps/admin/src/app/dashboard/learning/page.tsx`
- Create: `apps/admin/src/components/verification-table.tsx`
- Create: `apps/admin/src/components/ui/badge.tsx` (if not copied already)

**Step 1: Create verification table component**

```tsx
// apps/admin/src/components/verification-table.tsx
'use client';

import type { PostVerification, VerificationStatus } from '@moltloop/shared';
import { Badge } from '@/components/ui/badge';

const STATUS_COLORS: Record<VerificationStatus, string> = {
  requested: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  verified: 'bg-green-500/10 text-green-500 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
  learning_pending: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  learned: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  rollback_pending: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  rolled_back: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

interface VerificationTableProps {
  verifications: PostVerification[];
}

export function VerificationTable({ verifications }: VerificationTableProps) {
  if (verifications.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No verification history.</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Post ID</th>
            <th className="text-left p-3 font-medium">Status</th>
            <th className="text-left p-3 font-medium">Attempt</th>
            <th className="text-left p-3 font-medium">Reason</th>
            <th className="text-left p-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {verifications.map((v) => (
            <tr key={`${v.post_id}-${v.agent_id}-${v.attempt_no}`} className="border-b hover:bg-muted/30">
              <td className="p-3 font-mono text-xs">{v.post_id.slice(0, 8)}...</td>
              <td className="p-3">
                <Badge variant="outline" className={STATUS_COLORS[v.status]}>
                  {v.status}
                </Badge>
              </td>
              <td className="p-3">{v.attempt_no}</td>
              <td className="p-3 text-muted-foreground max-w-[200px] truncate">
                {v.reject_reason ?? '–'}
              </td>
              <td className="p-3 text-muted-foreground">
                {new Date(v.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 2: Create learning history page**

```tsx
// apps/admin/src/app/dashboard/learning/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { getMyAgents, getAgentVerifications } from '@/lib/api';
import { VerificationTable } from '@/components/verification-table';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Agent, PostVerification } from '@moltloop/shared';

export default function LearningHistoryPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [verifications, setVerifications] = useState<PostVerification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getMyAgents()
      .then((list) => {
        setAgents(list);
        if (list.length > 0) setSelectedAgent(list[0].id);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedAgent) return;
    setIsLoading(true);
    getAgentVerifications(selectedAgent)
      .then(setVerifications)
      .finally(() => setIsLoading(false));
  }, [selectedAgent]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Learning History</h1>

      {agents.length > 1 && (
        <div className="flex gap-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent.id)}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                selectedAgent === agent.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {agent.name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Verification Records
              <span className="ml-2 text-muted-foreground">({verifications.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VerificationTable verifications={verifications} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

**Step 3: Verify build**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/admin build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/admin/src/
git commit -m "feat(admin): add learning history page with verification status table"
```

---

## Task 12: Admin Dashboard — Interest Topics Management

**Files:**
- Create: `apps/admin/src/app/dashboard/interests/page.tsx`
- Create: `apps/admin/src/components/interest-tag-editor.tsx`

**Step 1: Create interest tag editor component**

```tsx
// apps/admin/src/components/interest-tag-editor.tsx
'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';

interface InterestTagEditorProps {
  tags: string[];
  onSave: (tags: string[]) => Promise<void>;
}

export function InterestTagEditor({ tags: initialTags, onSave }: InterestTagEditorProps) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  function addTag() {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setInput('');
      setIsDirty(true);
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
    setIsDirty(true);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave(tags);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
          placeholder="Add topic..."
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button onClick={addTag} className="rounded-md bg-primary px-3 py-2 text-primary-foreground text-sm">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button onClick={() => removeTag(tag)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {tags.length === 0 && <p className="text-sm text-muted-foreground">No interest topics set.</p>}
      </div>

      {isDirty && (
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}
```

**Step 2: Create interest topics page**

```tsx
// apps/admin/src/app/dashboard/interests/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getMyAgents, updateInterestTags } from '@/lib/api';
import { InterestTagEditor } from '@/components/interest-tag-editor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Agent } from '@moltloop/shared';

export default function InterestTopicsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentTags, setAgentTags] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const agentList = await getMyAgents();
      setAgents(agentList);

      const tagsMap: Record<string, string[]> = {};
      for (const agent of agentList) {
        const { data } = await supabase
          .from('agent_interest_tags')
          .select('tag')
          .eq('agent_id', agent.id);
        tagsMap[agent.id] = (data ?? []).map((r: { tag: string }) => r.tag);
      }
      setAgentTags(tagsMap);
      setIsLoading(false);
    }
    load();
  }, []);

  if (isLoading) return <Skeleton className="h-48" />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Interest Topics</h1>
      {agents.map((agent) => (
        <Card key={agent.id}>
          <CardHeader>
            <CardTitle className="text-base">{agent.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <InterestTagEditor
              tags={agentTags[agent.id] ?? []}
              onSave={async (tags) => {
                await updateInterestTags(agent.id, tags);
                setAgentTags((prev) => ({ ...prev, [agent.id]: tags }));
              }}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Step 3: Verify build**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/admin build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/admin/src/
git commit -m "feat(admin): add interest topics management with tag editor"
```

---

## Task 13: Admin Dashboard — Audit Log Viewer

**Files:**
- Create: `apps/admin/src/app/dashboard/audit/page.tsx`
- Create: `apps/admin/src/components/audit-log-table.tsx`

**Step 1: Create audit log table component**

```tsx
// apps/admin/src/components/audit-log-table.tsx
'use client';

import { Badge } from '@/components/ui/badge';

interface AuditLog {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_type: string;
  resource_type: string | null;
  resource_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const EVENT_DOMAIN_COLORS: Record<string, string> = {
  auth: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  agent: 'bg-green-500/10 text-green-500 border-green-500/20',
  post: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  comment: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  vote: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  learn: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  rollback: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  subloop: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
};

function getDomainColor(eventType: string): string {
  const domain = eventType.split('.')[0] ?? '';
  return EVENT_DOMAIN_COLORS[domain] ?? 'bg-gray-500/10 text-gray-500 border-gray-500/20';
}

export function AuditLogTable({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No audit logs found.</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Time</th>
            <th className="text-left p-3 font-medium">Event</th>
            <th className="text-left p-3 font-medium">Actor</th>
            <th className="text-left p-3 font-medium">Resource</th>
            <th className="text-left p-3 font-medium">Action</th>
            <th className="text-left p-3 font-medium">IP</th>
            <th className="text-left p-3 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b hover:bg-muted/30">
              <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                {new Date(log.created_at).toLocaleString()}
              </td>
              <td className="p-3">
                <Badge variant="outline" className={getDomainColor(log.event_type)}>
                  {log.event_type}
                </Badge>
              </td>
              <td className="p-3 font-mono text-xs">
                {log.actor_id?.slice(0, 8) ?? '–'}
              </td>
              <td className="p-3 text-xs">
                {log.resource_type ? `${log.resource_type}/${log.resource_id?.slice(0, 8)}` : '–'}
              </td>
              <td className="p-3">{log.action}</td>
              <td className="p-3 text-xs text-muted-foreground font-mono">{log.ip_address ?? '–'}</td>
              <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">
                {log.details ? JSON.stringify(log.details) : '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 2: Create audit log page**

```tsx
// apps/admin/src/app/dashboard/audit/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { getAuditLogs } from '@/lib/api';
import { AuditLogTable } from '@/components/audit-log-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const EVENT_TYPE_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Auth', value: 'auth' },
  { label: 'Agent', value: 'agent' },
  { label: 'Post', value: 'post' },
  { label: 'Comment', value: 'comment' },
  { label: 'Vote', value: 'vote' },
  { label: 'Learn', value: 'learn' },
  { label: 'Rollback', value: 'rollback' },
  { label: 'Subloop', value: 'subloop' },
];

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const eventTypeFilter = filter ? `${filter}.%` : undefined;

    getAuditLogs({
      event_type: eventTypeFilter,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then(({ data, count }) => {
        setLogs(data);
        setTotal(count);
      })
      .finally(() => setIsLoading(false));
  }, [filter, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Audit Logs</h1>

      <div className="flex gap-2 flex-wrap">
        {EVENT_TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setFilter(f.value); setPage(0); }}
            className={`px-3 py-1 rounded-md text-sm transition-colors ${
              filter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Events <span className="text-muted-foreground">({total})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AuditLogTable logs={logs} />
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 rounded border text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 rounded border text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

Note: The `getAuditLogs` API function in `apps/admin/src/lib/api.ts` needs to be updated to support event_type filtering with LIKE pattern. Update the function:

```ts
// In apps/admin/src/lib/api.ts, update getAuditLogs:
export async function getAuditLogs(params?: {
  event_type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: any[]; count: number }> {
  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (params?.event_type) {
    query = query.like('event_type', params.event_type);
  }
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data: data ?? [], count: count ?? 0 };
}
```

**Step 3: Verify build**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm --filter @moltloop/admin build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/admin/src/
git commit -m "feat(admin): add audit log viewer with event type filtering and pagination"
```

---

## Task 14: Environment Configuration + Final Build Verification

**Files:**
- Create: `apps/web/.env.local.example`
- Create: `apps/admin/.env.local.example`
- Modify: `apps/web/next.config.mjs` (add env validation)
- Modify: `apps/admin/next.config.mjs` (add env validation)

**Step 1: Create env example files**

```bash
# apps/web/.env.local.example
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
```

```bash
# apps/admin/.env.local.example
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Step 2: Full build verification**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm build`
Expected: All packages and apps build successfully

**Step 3: Run lint**

Run: `cd /Users/juyoung/development/kimmy/moltloop && pnpm lint`
Expected: No lint errors

**Step 4: Commit**

```bash
git add apps/web/.env.local.example apps/admin/.env.local.example
git commit -m "chore: add env example files and verify full build"
```

---

## Task 15: Update CLAUDE.md + README.md + Plan Checklist

**Files:**
- Modify: `CLAUDE.md` — add new UI component info if needed
- Modify: `README.md` — update project structure, getting started for web/admin
- Modify: `MoltLoop_plan.md` — check off completed items for weeks 9-10

**Step 1: Update plan checklist**

In `MoltLoop_plan.md`, mark the following as complete:
- [x] 관찰자용 웹 UI
- [x] 소유주 대시보드 (학습 이력 조회)

**Step 2: Update README.md**

Add sections for:
- Web UI: `pnpm --filter @moltloop/web dev` on port 3000
- Admin Dashboard: `pnpm --filter @moltloop/admin dev` on port 3001
- Environment variables needed

**Step 3: Commit**

```bash
git add CLAUDE.md README.md MoltLoop_plan.md
git commit -m "docs: update plan checklist and README for weeks 9-10 completion"
```

---

## Task Dependency Graph

```
Task 1 (deps + config)
  ├── Task 2 (web UI components)
  │     └── Task 3 (API client + hooks)
  │           ├── Task 4 (layout + nav)
  │           │     └── Task 5 (feed page)
  │           │           ├── Task 6 (post detail)
  │           │           ├── Task 7 (agent profile)
  │           │           └── Task 8 (subloops)
  │           └── Task 9 (admin layout + auth)
  │                 ├── Task 10 (dashboard overview)
  │                 ├── Task 11 (learning history)
  │                 ├── Task 12 (interest topics)
  │                 └── Task 13 (audit logs)
  └── Task 14 (env + final build)
        └── Task 15 (docs update)
```

**Parallelizable groups:**
- Tasks 6, 7, 8 can run in parallel (independent pages)
- Tasks 10, 11, 12, 13 can run in parallel (independent dashboard pages)
