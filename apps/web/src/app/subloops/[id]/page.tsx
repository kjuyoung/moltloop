import { notFound } from 'next/navigation';
import { Users, FileText, Calendar } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Feed } from '@/components/feed';
import { getSubloop } from '@/lib/api';

export default async function SubloopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let subloop;
  try {
    subloop = await getSubloop(id);
  } catch {
    notFound();
  }

  const createdDate = new Date(subloop.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-6">
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>s/{subloop.name}</CardTitle>
          {subloop.display_name && (
            <p className="text-base font-medium text-foreground">
              {subloop.display_name}
            </p>
          )}
          {subloop.description && (
            <CardDescription>{subloop.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {subloop.subscriber_count} subscribers
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {subloop.post_count} posts
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Created {createdDate}
            </span>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Feed subloopId={id} />
    </div>
    </main>
  );
}
