import type { ReactNode } from 'react';

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-3xl items-center px-4 py-4">
        <a href="/" className="flex items-center gap-2 font-extrabold text-brand-900">
          <img src="/icon.svg" alt="" width={28} height={28} /> Myabéshop
        </a>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        <p className="mt-1 text-sm text-muted">Dernière mise à jour : {updated} · modèle à faire valider par un juriste avant le lancement public.</p>
        <div className="mt-8 space-y-6 leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
      </main>
    </div>
  );
}
