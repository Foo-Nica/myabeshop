import type { OrderStatus } from '@myabeshop/shared';

export const STATUS_LABEL: Record<OrderStatus, { fr: string; en: string }> = {
  NEW: { fr: 'Nouvelle', en: 'New' },
  UNREACHABLE: { fr: 'Injoignable', en: 'Unreachable' },
  CONFIRMED: { fr: 'Confirmée', en: 'Confirmed' },
  CANCELLED: { fr: 'Annulée', en: 'Cancelled' },
  SHIPPED: { fr: 'En livraison', en: 'Out for delivery' },
  POSTPONED: { fr: 'Reportée', en: 'Postponed' },
  DELIVERED: { fr: 'Livrée', en: 'Delivered' },
  REFUSED: { fr: 'Refusée', en: 'Refused' },
  RETURNED: { fr: 'Retournée', en: 'Returned' },
};

export const STATUS_TONE: Record<OrderStatus, string> = {
  NEW: 'bg-sky-100 text-sky-800',
  UNREACHABLE: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-zinc-200 text-zinc-700',
  SHIPPED: 'bg-violet-100 text-violet-800',
  POSTPONED: 'bg-orange-100 text-orange-800',
  DELIVERED: 'bg-green-600 text-white',
  REFUSED: 'bg-red-100 text-red-800',
  RETURNED: 'bg-zinc-300 text-zinc-800',
};

export const FLAG_LABEL: Record<string, string> = {
  DUPLICATE: 'Doublon possible',
  LOW_SCORE: 'Client à risque',
  BLACKLISTED: 'Liste noire',
  UNSERVED_ZONE: 'Hors zone : transporteur',
};

export const CATEGORY_LABEL: Record<string, string> = {
  fashion: 'Mode',
  beauty: 'Beauté & cosmétiques',
  electronics: 'Électronique',
  home: 'Maison',
  food: 'Alimentation',
  health: 'Santé & bien-être',
  kids: 'Enfants',
  other: 'Autre',
};

export const SOURCE_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  google: 'Google',
  direct: 'Direct',
  manual: 'Saisie manuelle',
  other: 'Autre',
};

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
