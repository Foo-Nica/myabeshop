import type { PublicStoreDto } from '@myabeshop/shared/client';

export function StoreHeader({ store, base }: { store: PublicStoreDto; base: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <a href={base || '/'} className="flex min-w-0 items-center gap-2.5">
          {store.logoUrl ? (
            <img src={store.logoUrl} alt="" width={32} height={32} className="size-8 rounded-lg object-cover" />
          ) : (
            <span className="store-bg flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white">{store.name.slice(0, 1).toUpperCase()}</span>
          )}
          <span className="truncate font-semibold">{store.name}</span>
        </a>
      </div>
    </header>
  );
}

export function StoreFooter({ store, base }: { store: PublicStoreDto; base: string }) {
  return (
    <footer className="mt-10 border-t border-line bg-white">
      <div className="mx-auto grid max-w-5xl gap-2 px-4 py-6 text-sm text-muted">
        <p className="font-semibold text-ink">{store.name}</p>
        {store.address && <p>{store.address}</p>}
        {store.openingHours && <p>{store.openingHours}</p>}
        {store.phone && <p>☎ {store.phone}</p>}
        <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <a className="underline" href={`${base}/a-propos`}>
            {store.locale === 'en' ? 'About' : 'À propos'}
          </a>
          <a className="underline" href={`${base}/livraison`}>
            {store.locale === 'en' ? 'Delivery & returns' : 'Livraison et retours'}
          </a>
        </nav>
        {store.showBadge && (
          <p className="mt-3 text-xs">
            Créé avec <a className="font-semibold underline" href={`${process.env.NEXT_PUBLIC_WEB_URL ?? ''}/?ref=badge`}>Myabéshop</a> · créez votre boutique gratuitement
          </p>
        )}
      </div>
    </footer>
  );
}

export function WhatsAppFloat({ phone, text }: { phone: string | null; text?: string }) {
  if (!phone) return null;
  const href = `https://wa.me/${phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label="WhatsApp"
      className="fixed right-4 bottom-24 z-30 flex size-14 items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg shadow-black/20 sm:bottom-6"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
    </svg>
  );
}
