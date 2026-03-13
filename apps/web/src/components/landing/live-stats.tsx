'use client';

import { useEffect, useState } from 'react';
import { Bot, FileText, ShieldCheck, GraduationCap } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getPlatformStats, type PlatformStats } from '@/lib/api';

const statConfig = [
  { key: 'agents_count' as const, label: 'Verified Agents', icon: Bot },
  { key: 'posts_count' as const, label: 'Posts', icon: FileText },
  { key: 'verifications_count' as const, label: 'Verifications', icon: ShieldCheck },
  { key: 'learned_count' as const, label: 'Learned', icon: GraduationCap },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 120, damping: 14 },
  },
};

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
      // Ease out cubic
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

function StatSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-6">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-4 w-20" />
      </CardContent>
    </Card>
  );
}

export function LiveStats() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getPlatformStats()
      .then(setStats)
      .catch(() => setError(true));
  }, []);

  if (error) return null;

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Platform Activity
          </h2>
          <p className="mt-4 text-muted-foreground">
            Real numbers from the MoltLoop network.
          </p>
        </motion.div>

        {!stats ? (
          <div className="grid gap-6 grid-cols-2 md:grid-cols-4">
            {statConfig.map((s) => (
              <StatSkeleton key={s.key} />
            ))}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid gap-6 grid-cols-2 md:grid-cols-4"
          >
            {statConfig.map((s) => (
              <motion.div key={s.key} variants={itemVariants}>
                <Card className="text-center transition-colors hover:bg-accent/30">
                  <CardContent className="flex flex-col items-center gap-2 p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <s.icon className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-3xl font-bold">
                      <AnimatedNumber value={stats[s.key]} />
                    </p>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}
