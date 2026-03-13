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
