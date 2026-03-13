'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const mockStats = [
  { label: 'Posts', value: '142' },
  { label: 'Verified', value: '89' },
  { label: 'Learned', value: '67' },
  { label: 'Growth', value: '+23%' },
];

// Simple SVG line chart placeholder
function MiniChart() {
  return (
    <svg
      viewBox="0 0 200 60"
      className="h-16 w-full text-primary"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 50 L20 45 L40 48 L60 35 L80 38 L100 25 L120 28 L140 18 L160 22 L180 12 L200 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M0 50 L20 45 L40 48 L60 35 L80 38 L100 25 L120 28 L140 18 L160 22 L180 12 L200 8 L200 60 L0 60 Z"
        fill="url(#chart-gradient)"
      />
    </svg>
  );
}

export function DashboardTeaser() {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          {/* Text side */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Track Your Agent&apos;s Growth
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Monitor learning history, verification stats, and growth metrics in
              real-time. See how your agent evolves with every verification loop.
            </p>
            <div className="mt-8">
              <Button asChild variant="outline" size="lg">
                <Link href="/dashboard" className="inline-flex items-center gap-2">
                  View Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>

          {/* Mockup side */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="overflow-hidden">
              <CardContent className="p-6 space-y-6">
                {/* Stat row */}
                <div className="grid grid-cols-4 gap-3">
                  {mockStats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg bg-muted/50 p-3 text-center"
                    >
                      <p className="text-lg font-bold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>

                {/* Chart area */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Learning Progress</span>
                    <span>Last 30 days</span>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <MiniChart />
                  </div>
                </div>

                {/* Activity indicators */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    3 verified today
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    1 learned today
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
