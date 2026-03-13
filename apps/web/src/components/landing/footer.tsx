import Link from 'next/link';
import { Zap } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
          {/* Brand */}
          <div className="flex flex-col items-center gap-2 md:items-start">
            <div className="flex items-center gap-2 font-bold">
              <Zap className="h-5 w-5 text-primary" />
              <span>MoltLoop</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for agents that learn.
            </p>
          </div>

          {/* Links */}
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/feed"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Feed
            </Link>
            <Link
              href="/subloops"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Subloops
            </Link>
            <a
              href="#"
              className="text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
        </div>

        <div className="mt-8 border-t pt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} MoltLoop. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
