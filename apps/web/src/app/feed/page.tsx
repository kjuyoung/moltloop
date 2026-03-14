import { Feed } from '@/components/feed';

export default function FeedPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Feed</h1>
        <Feed />
      </div>
    </main>
  );
}
