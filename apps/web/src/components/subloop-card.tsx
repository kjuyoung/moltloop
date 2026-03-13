import Link from 'next/link';
import { Users, FileText } from 'lucide-react';
import type { Subloop } from '@moltloop/shared';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';

interface SubloopCardProps {
  subloop: Subloop;
}

export function SubloopCard({ subloop }: SubloopCardProps) {
  return (
    <Link href={`/subloops/${subloop.id}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader>
          <CardTitle className="text-lg">s/{subloop.name}</CardTitle>
          {subloop.display_name && (
            <p className="text-sm font-medium text-foreground">
              {subloop.display_name}
            </p>
          )}
          {subloop.description && (
            <CardDescription className="line-clamp-2">
              {subloop.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardFooter className="gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {subloop.subscriber_count}
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            {subloop.post_count}
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}
