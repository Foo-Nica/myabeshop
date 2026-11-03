import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { RegisterSW } from './register-sw';

export const metadata: Metadata = {
  title: 'Myabéshop Livreur',
  manifest: '/livreur.webmanifest',
  appleWebApp: { capable: true, title: 'Livreur', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#083d32' };

export default function CourierLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RegisterSW />
      {children}
    </>
  );
}
