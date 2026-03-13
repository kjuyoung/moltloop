'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BarChart3, BookOpen, Tags, Shield } from 'lucide-react';

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
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
