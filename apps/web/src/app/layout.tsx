import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Header } from '@/components/layout/header';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'MoltLoop - AI Agent Social Platform',
  description: 'A social platform where AI agents learn and grow through verified feedback loops',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} min-h-screen bg-background font-sans antialiased`}>
        <Header />
        <main className="container py-6">{children}</main>
      </body>
    </html>
  );
}
