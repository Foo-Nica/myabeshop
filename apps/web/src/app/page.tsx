const FEATURES = [
  { icon: '⚡', title: 'Boutique prête en 10 minutes', text: 'Depuis votre téléphone : nom, logo, premier produit, zones de livraison. Votre adresse est réservée tout de suite.' },
  { icon: '🔗', title: 'Liens produits à partager', text: 'Un lien court par produit, une page pensée pour la pub Facebook et TikTok, un aperçu propre dans WhatsApp.' },
  { icon: '🛒', title: 'Commande en 30 secondes', text: 'Le client remplit nom, téléphone, quartier et repère. Pas de compte, pas de carte bancaire.' },
  { icon: '📞', title: 'Confirmation en un clic', text: 'Appelez ou écrivez sur WhatsApp avec un message pré-rempli, puis confirmez la commande.' },
  { icon: '🛵', title: 'Vos livreurs dans l’appli', text: 'Assignez les colis, suivez les livraisons, les refus et les reports.' },
  { icon: '💰', title: 'Le cash suivi jusqu’au bout', text: 'Ce que chaque livreur a encaissé, ce qu’il vous a versé, et l’écart.' },
];

export default function Home() {
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <a href="/" className="flex items-center gap-2 text-lg font-extrabold text-brand-900">
          <img src="/icon.svg" alt="" width={32} height={32} /> Myabéshop
        </a>
        <a href="/login" className="tap inline-flex items-center rounded-xl px-4 font-semibold text-brand-700 hover:bg-brand-50">
          Se connecter
        </a>
      </header>
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-14 text-center sm:pt-16">
        <p className="mx-auto mb-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Paiement à la livraison</p>
        <h1 className="mx-auto max-w-3xl text-4xl leading-tight font-extrabold tracking-tight text-ink sm:text-5xl">
          Votre boutique en ligne, de la commande jusqu’à l’argent encaissé.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
          Myabéshop est fait pour les vendeurs qui vendent sur WhatsApp, Facebook et TikTok et qui encaissent à la livraison : commandes, confirmations, livreurs et cash, au même endroit.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="/login?signup=1" className="tap inline-flex w-full items-center justify-center rounded-xl bg-brand-700 px-6 py-3 text-lg font-bold text-white hover:bg-brand-900 sm:w-auto">
            Créer ma boutique gratuitement
          </a>
          <a href="/p/demo123" className="tap inline-flex w-full items-center justify-center rounded-xl border border-line px-6 py-3 font-semibold sm:w-auto">
            Voir une page produit
          </a>
        </div>
        <p className="mt-3 text-sm text-muted">14 jours du plan Pro offerts, sans carte bancaire.</p>
      </section>
      <section className="bg-canvas py-14">
        <div className="mx-auto grid max-w-5xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl bg-white p-5">
              <div className="text-2xl">{f.icon}</div>
              <h2 className="mt-2 font-bold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="px-4 py-8 text-center text-sm text-muted">© {new Date().getFullYear()} Myabéshop</footer>
    </div>
  );
}
