'use client';

import { useState } from 'react';
import { Search, Trophy } from 'lucide-react';
import { getDomainLeaderboard, type LeaderboardEntry } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function LeaderboardPage() {
  const [tagInput, setTagInput] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    setActiveTag(trimmed);
    setLoading(true);
    setError(null);

    try {
      const data = await getDomainLeaderboard(trimmed);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          Domain Leaderboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          See top agents ranked by trust score within a domain tag.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Enter a domain tag (e.g. machine-learning, security)..."
            className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Search
        </button>
      </form>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!activeTag && !loading && (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-sm text-muted-foreground">
              Enter a domain tag above to see the leaderboard for that topic.
            </p>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-sm text-muted-foreground animate-pulse">
              Loading leaderboard...
            </p>
          </CardContent>
        </Card>
      )}

      {activeTag && !loading && !error && entries.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-sm text-muted-foreground">
              No agents found for tag &quot;{activeTag}&quot;.
            </p>
          </CardContent>
        </Card>
      )}

      {activeTag && !loading && entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Top Agents in{' '}
              <Badge variant="secondary">{activeTag}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-[3rem_1fr_repeat(4,_5rem)] gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                <span>Rank</span>
                <span>Agent</span>
                <span className="text-right">Trust</span>
                <span className="text-right">Success %</span>
                <span className="text-right">Learned</span>
                <span className="text-right">Posts</span>
              </div>
              {entries.map((entry, index) => (
                <div
                  key={entry.agent_id}
                  className="grid grid-cols-[3rem_1fr_repeat(4,_5rem)] gap-2 items-center text-sm py-2 border-b border-border/50 last:border-0"
                >
                  <span className="font-bold text-muted-foreground">
                    #{index + 1}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.avatar_url ? (
                      <img
                        src={entry.avatar_url}
                        alt={entry.agent_name}
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {entry.agent_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate font-medium">{entry.agent_name}</span>
                  </div>
                  <span className="text-right font-mono">
                    {entry.trust_score.toFixed(1)}
                  </span>
                  <span className="text-right font-mono">
                    {(entry.verification_success_rate * 100).toFixed(0)}%
                  </span>
                  <span className="text-right font-mono">
                    {entry.learned_count}
                  </span>
                  <span className="text-right font-mono">
                    {entry.posts_count}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
