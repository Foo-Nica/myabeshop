import { formatMoney, type PlanDto } from '@myabeshop/shared/client';
import { publicApi } from '@/lib/server-api';

export const revalidate = 300;

const STEPS = [
  { n: '1', title: 'Créez votre boutique', text: 'Depuis votre téléphone, en 10 minutes : nom, logo, zones de livraison et premier produit. Votre adresse est réservée tout de suite.' },
  { n: '2', title: 'Partagez vos liens', text: 'Un lien court par produit pour WhatsApp, Facebook et TikTok. Le client commande en 30 secondes, sans compte ni carte.' },
  { n: '3', title: 'Confirmez, livrez, encaissez', text: 'Appel ou WhatsApp en un clic, colis assignés aux livreurs, et le cash suivi jusqu’au dernier franc.' },
];

const FEATURES = [
  { icon: '🔔', title: 'Commandes en direct', text: 'Son et notification à chaque commande, filtres par statut, zone, livreur et source.' },
  { icon: '📞', title: 'Confirmation en un clic', text: 'Message WhatsApp pré-rempli avec le récapitulatif, compteur d’appels, historique complet.' },
  { icon: '🛵', title: 'Appli livreur hors connexion', text: 'Code PIN, colis triés par quartier, itinéraire. Les livraisons se valident même sans réseau.' },
  { icon: '💰', title: 'Cash sous contrôle', text: 'Ce que chaque livreur a encaissé, ce qu’il a versé, l’écart et sa commission, jour par jour.' },
  { icon: '🛡️', title: 'Anti-fausses commandes', text: 'Doublons, score client, liste noire, limite par numéro et par jour.' },
  { icon: '📊', title: 'Vos vrais chiffres', text: 'Taux de confirmation et de livraison, bénéfice estimé après pub, par produit, ville et source.' },
  { icon: '📣', title: 'Marketing intégré', text: 'Codes promo, pixels Facebook et TikTok, envoi automatique vers Google Sheets.' },
  { icon: '📱', title: 'Payé par Mobile Money', text: 'Abonnement réglé par MTN, Moov, Orange ou Wave. Pas besoin de carte bancaire.' },
];

const FAQ = [
  { q: 'Mes clients doivent-ils créer un compte ?', a: 'Non. Ils donnent leur nom, leur numéro, leur quartier et un repère. Ils paient en espèces à la livraison.' },
  { q: 'Comment je paie mon abonnement ?', a: 'Par Mobile Money (MTN, Moov, Orange, Wave selon votre pays) depuis votre tableau de bord. Le plan s’active dès la confirmation et vous recevez une facture.' },
  { q: 'Que se passe-t-il si je ne renouvelle pas ?', a: 'Vous gardez vos fonctionnalités 7 jours, puis la boutique passe au plan Gratuit. Aucune donnée n’est supprimée.' },
  { q: 'Mes livreurs ont-ils besoin d’un smartphone récent ?', a: 'Non : l’appli livreur est légère, s’installe depuis le navigateur et continue de fonctionner quand le réseau coupe.' },
];

const FALLBACK_PLANS: PlanDto[] = [
  { id: 'free', code: 'free', name: 'Gratuit', price: 0, currency: 'XOF', active: true, limits: { ordersPerMonth: 50, products: 10, members: 1, customDomain: false, couriers: false, pixels: false, promoCodes: false, agents: false, sheets: false, showPlatformBadge: true } },
  { id: 'starter', code: 'starter', name: 'Starter', price: 5000, currency: 'XOF', active: true, limits: { ordersPerMonth: 500, products: 100, members: 3, customDomain: false, couriers: true, pixels: true, promoCodes: true, agents: false, sheets: false, showPlatformBadge: false } },
  { id: 'pro', code: 'pro', name: 'Pro', price: 15000, currency: 'XOF', active: true, limits: { ordersPerMonth: 3000, products: null, members: 10, customDomain: true, couriers: true, pixels: true, promoCodes: true, agents: true, sheets: true, showPlatformBadge: false } },
  { id: 'business', code: 'business', name: 'Business', price: 35000, currency: 'XOF', active: true, limits: { ordersPerMonth: null, products: null, members: null, customDomain: true, couriers: true, pixels: true, promoCodes: true, agents: true, sheets: true, showPlatformBadge: false } },
];

function planLines(p: PlanDto) {
  const l = p.limits;
  const n = (v: number | null, u: string) => (v == null ? `${u} illimités` : `${new Intl.NumberFormat('fr-FR').format(v)} ${u}`);
  return [
    `${n(l.ordersPerMonth, 'commandes')} / mois`,
    n(l.products, 'produits'),
    l.members == null ? 'Équipe illimitée' : `${l.members} membre${l.members > 1 ? 's' : ''}`,
    l.couriers ? 'Livreurs, cash, pixels, promo' : 'Sous-domaine offert',
    ...(l.agents ? ['Agents de confirmation, Google Sheets'] : []),
    ...(l.customDomain ? ['Domaine personnalisé'] : []),
    ...(p.code === 'business' ? ['Plusieurs boutiques, API, support prioritaire'] : []),
  ];
}

function PhoneMock() {
  return (
    <div className="relative mx-auto w-[260px] rounded-[2.2rem] border-[10px] border-ink bg-white shadow-2xl" aria-hidden>
      <div className="bg-brand-700 px-3 py-2 text-center text-[11px] font-semibold text-white">🚚 Paiement à la livraison · Boutique Awa</div>
      <div className="flex h-36 items-center justify-center bg-[#f4e9d8]">
        <div className="relative h-20 w-16 rounded-b-xl rounded-t-md bg-[#e9c46a]">
          <div className="absolute -top-3 -left-1 h-5 w-[72px] rounded-md bg-[#8a5a2b]" />
          <div className="absolute top-6 left-2 h-7 w-12 rounded bg-white/90" />
        </div>
      </div>
      <div className="space-y-2 p-3">
        <p className="text-sm font-bold">Beurre de karité pur 250 g</p>
        <p className="text-sm">
          <span className="font-extrabold text-brand-700">5 000 F</span> <span className="text-xs text-muted line-through">7 500 F</span>
        </p>
        <div className="rounded-lg border-2 border-brand-700 p-2 text-[11px]">
          <p className="font-semibold">Commandez en 30 secondes</p>
          <div className="mt-1.5 h-5 rounded bg-canvas" />
          <div className="mt-1 h-5 rounded bg-canvas" />
          <div className="mt-1.5 rounded bg-brand-700 py-1.5 text-center font-bold text-white">Commander · 6 000 F</div>
        </div>
      </div>
      <div className="absolute -right-24 top-24 hidden w-44 rounded-2xl bg-brand-900 p-3 text-white shadow-xl sm:block">
        <p className="text-xs font-bold">🔔 Nouvelle commande n°128</p>
        <p className="text-[11px] text-white/80">Aya · Cocody · 6 000 F</p>
      </div>
      <div className="absolute -left-24 bottom-16 hidden w-40 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-line sm:block">
        <p className="text-[11px] text-muted">Cash chez Koffi</p>
        <p className="text-sm font-extrabold text-amber-700">42 500 F</p>
      </div>
    </div>
  );
}

export default async function Home() {
  const plans = ((await publicApi.plans()) ?? FALLBACK_PLANS).filter((p) => p.active);
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <a href="/" className="flex items-center gap-2 text-lg font-extrabold text-brand-900">
          <img src="/icon.svg" alt="" width={32} height={32} /> Myabéshop
        </a>
        <nav className="flex items-center gap-1">
          <a href="#tarifs" className="tap hidden items-center rounded-xl px-3 font-semibold text-muted hover:text-ink sm:inline-flex">
            Tarifs
          </a>
          <a href="/login" className="tap inline-flex items-center rounded-xl px-4 font-semibold text-brand-700 hover:bg-brand-50">
            Se connecter
          </a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-6 pb-16 lg:grid-cols-[1.1fr_1fr] lg:pt-14">
        <div className="text-center lg:text-left">
          <p className="mb-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Pour les vendeurs qui encaissent à la livraison</p>
          <h1 className="text-4xl leading-[1.08] font-extrabold tracking-tight text-ink sm:text-5xl lg:text-6xl">
            De la commande WhatsApp <span className="text-brand-700">à l’argent encaissé.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted lg:mx-0 mx-auto">
            Boutique en ligne, confirmations, livreurs et cash au même endroit. Pensé pour Cotonou, Abidjan, Dakar, Lomé et Douala, et pour les téléphones en 3G.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start sm:justify-center">
            <a href="/login?signup=1" className="tap inline-flex w-full items-center justify-center rounded-xl bg-brand-700 px-6 py-3 text-lg font-bold text-white hover:bg-brand-900 sm:w-auto">
              Créer ma boutique gratuitement
            </a>
            <a href="/p/demo123" className="tap inline-flex w-full items-center justify-center rounded-xl border border-line px-6 py-3 font-semibold sm:w-auto">
              Voir une page produit
            </a>
          </div>
          <p className="mt-3 text-sm text-muted">14 jours du plan Pro offerts · sans carte bancaire</p>
        </div>
        <PhoneMock />
      </section>

      <section className="border-y border-line bg-canvas py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">Comment ça marche</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl bg-white p-6">
                <span className="flex size-9 items-center justify-center rounded-full bg-brand-700 font-bold text-white">{s.n}</span>
                <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">Tout ce qu’il faut pour vendre en COD</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line p-5">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-2 font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="tarifs" className="scroll-mt-4 bg-brand-900 py-16 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">Des prix en FCFA, payables par Mobile Money</h2>
          <p className="mt-2 text-center text-white/75">Annuel : 2 mois offerts. Sans engagement, changez de plan quand vous voulez.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <div key={p.id} className={`flex flex-col rounded-2xl p-6 ${p.code === 'pro' ? 'bg-white text-ink ring-4 ring-amber-300' : 'bg-white/10'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  {p.code === 'pro' && <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-bold text-amber-950">Populaire</span>}
                </div>
                <p className="mt-3">
                  <span className="text-3xl font-extrabold">{p.price === 0 ? '0 F' : formatMoney(p.price, p.currency)}</span>
                  <span className={p.code === 'pro' ? 'text-muted' : 'text-white/70'}> / mois</span>
                </p>
                <ul className={`mt-4 flex-1 space-y-1.5 text-sm ${p.code === 'pro' ? '' : 'text-white/85'}`}>
                  {planLines(p).map((l) => (
                    <li key={l}>✓ {l}</li>
                  ))}
                </ul>
                <a href="/login?signup=1" className={`tap mt-6 inline-flex items-center justify-center rounded-xl font-bold ${p.code === 'pro' ? 'bg-brand-700 text-white' : 'bg-white text-brand-900'}`}>
                  {p.price === 0 ? 'Commencer' : 'Essayer 14 jours'}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">Questions fréquentes</h2>
        <div className="mt-8 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-line p-5">
              <summary className="cursor-pointer list-none font-semibold">
                {f.q} <span className="float-right text-muted group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 text-center">
          <a href="/login?signup=1" className="tap inline-flex items-center justify-center rounded-xl bg-brand-700 px-6 py-3 text-lg font-bold text-white hover:bg-brand-900">
            Lancer ma boutique
          </a>
        </div>
      </section>

      <footer className="border-t border-line px-4 py-8 text-center text-sm text-muted">
        <p>
          © {new Date().getFullYear()} Myabéshop · <a className="underline" href="/conditions">Conditions d’utilisation</a> · <a className="underline" href="/confidentialite">Confidentialité</a> ·{' '}
          <a className="underline" href="/livreur/connexion">Espace livreur</a>
        </p>
      </footer>
    </div>
  );
}
