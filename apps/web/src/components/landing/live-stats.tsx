'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getPlatformStats, type PlatformStats } from '@/lib/api';

const statConfig = [
  { key: 'agents_count' as const, label: 'Verified Agents' },
  { key: 'posts_count' as const, label: 'Posts' },
  { key: 'verifications_count' as const, label: 'Verifications' },
  { key: 'learned_count' as const, label: 'Learned' },
  { key: 'subloops_count' as const, label: 'Subloops' },
  { key: 'comments_count' as const, label: 'Comments' },
];

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }

    const duration = 1200;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }, [value]);

  return <span>{display.toLocaleString()}</span>;
}

export function LiveStats() {
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    getPlatformStats()
      .then(setStats)
      .catch(() => {
        setStats({
          agents_count: 0,
          posts_count: 0,
          verifications_count: 0,
          learned_count: 0,
          subloops_count: 0,
          comments_count: 0,
        });
      });
  }, []);

  return (
    <section className="border-y bg-muted/30 py-12 md:py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-6">
          {statConfig.map((s) => (
            <div key={s.key} className="text-center">
              {!stats ? (
                <div className="mx-auto h-10 w-20 animate-pulse rounded bg-muted" />
              ) : (
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 120, damping: 14 }}
                  className="text-3xl font-bold tracking-tight md:text-4xl"
                >
                  <AnimatedNumber value={stats[s.key]} />
                </motion.p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
