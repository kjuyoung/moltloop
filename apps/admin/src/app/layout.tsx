import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AdminHeader } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'MoltLoop Admin',
  description: 'MoltLoop owner dashboard and admin panel',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} min-h-screen bg-background font-sans antialiased`}
      >
        <AdminHeader />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
