/** Starter delivery zones suggested in the onboarding wizard; the merchant edits fees freely. */
export const ZONE_PRESETS: Record<string, { name: string; city: string; fee: number; delay: string }[]> = {
  CI: [
    { name: 'Cocody', city: 'Abidjan', fee: 1000, delay: '24 h' },
    { name: 'Plateau', city: 'Abidjan', fee: 1000, delay: '24 h' },
    { name: 'Marcory', city: 'Abidjan', fee: 1000, delay: '24 h' },
    { name: 'Yopougon', city: 'Abidjan', fee: 1500, delay: '24 h' },
    { name: 'Abobo', city: 'Abidjan', fee: 1500, delay: '24 h' },
    { name: 'Bouaké', city: 'Bouaké', fee: 3000, delay: '48–72 h' },
  ],
  SN: [
    { name: 'Dakar Plateau', city: 'Dakar', fee: 1000, delay: '24 h' },
    { name: 'Almadies', city: 'Dakar', fee: 1500, delay: '24 h' },
    { name: 'Pikine', city: 'Dakar', fee: 1500, delay: '24 h' },
    { name: 'Rufisque', city: 'Dakar', fee: 2000, delay: '24–48 h' },
    { name: 'Thiès', city: 'Thiès', fee: 2500, delay: '48 h' },
  ],
  TG: [
    { name: 'Lomé centre', city: 'Lomé', fee: 500, delay: '24 h' },
    { name: 'Agoè', city: 'Lomé', fee: 1000, delay: '24 h' },
    { name: 'Adidogomé', city: 'Lomé', fee: 1000, delay: '24 h' },
    { name: 'Baguida', city: 'Lomé', fee: 1000, delay: '24 h' },
    { name: 'Kara', city: 'Kara', fee: 2500, delay: '48–72 h' },
  ],
  BJ: [
    { name: 'Cotonou', city: 'Cotonou', fee: 1000, delay: '24 h' },
    { name: 'Abomey-Calavi', city: 'Abomey-Calavi', fee: 1500, delay: '24 h' },
    { name: 'Porto-Novo', city: 'Porto-Novo', fee: 2000, delay: '24–48 h' },
    { name: 'Parakou', city: 'Parakou', fee: 3000, delay: '48–72 h' },
  ],
  CM: [
    { name: 'Douala – Akwa', city: 'Douala', fee: 1000, delay: '24 h' },
    { name: 'Douala – Bonamoussadi', city: 'Douala', fee: 1500, delay: '24 h' },
    { name: 'Yaoundé – Bastos', city: 'Yaoundé', fee: 1000, delay: '24 h' },
    { name: 'Yaoundé – Mvog-Mbi', city: 'Yaoundé', fee: 1500, delay: '24 h' },
  ],
};

export function presetsFor(country: string) {
  return ZONE_PRESETS[country] ?? [{ name: 'Centre-ville', city: 'Capitale', fee: 1000, delay: '24 h' }];
}
