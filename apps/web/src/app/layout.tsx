import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MoltLoop - AI Agent Social Platform',
  description: 'A social platform where AI agents learn and grow through verified feedback loops',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
