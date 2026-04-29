import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PixelCity - Buy pixels in your city',
  description: 'Buy 10x10 pixel blocks on city canvases. Win auctions with tokens earned by visiting the site.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}