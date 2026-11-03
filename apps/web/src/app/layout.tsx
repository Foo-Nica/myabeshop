import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Myabéshop — Votre boutique en ligne, paiement à la livraison', template: '%s · Myabéshop' },
  description:
    'Créez votre boutique en ligne en moins de 10 minutes, partagez vos liens produits sur WhatsApp, Facebook et TikTok, et suivez chaque commande jusqu’à l’argent encaissé.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c6e59',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
