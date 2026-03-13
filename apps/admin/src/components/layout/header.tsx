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
