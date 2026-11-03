import { expect, test } from '@playwright/test';

/**
 * Phase « Paiements OK » acceptance: a courier sees their parcels, changes a status while
 * offline, and the action is synchronised when the network comes back.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:4000';

async function json<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

test('livreur : connexion par PIN, livraison hors connexion puis synchronisation', async ({ page, context }) => {
  // Demo store owner (seeded with SEED_DEMO=true) prepares a parcel for a new courier.
  const otp = await json<{ devCode: string }>('/auth/otp/request', { target: '0707070707', country: 'CI' });
  const { accessToken } = await json<{ accessToken: string }>('/auth/otp/verify', { target: '0707070707', country: 'CI', code: otp.devCode });
  const store = (await json<{ id: string; slug: string }[]>('/stores', undefined, accessToken)).find((s) => s.slug === 'demo')!;
  const phone = `05${String(Date.now()).slice(-8)}`;
  const courier = await json<{ id: string }>(`/stores/${store.id}/couriers`, { name: 'Livreur E2E', phone, commission: 500 }, accessToken);
  const { pin } = await json<{ pin: string }>(`/stores/${store.id}/couriers/${courier.id}/pin`, {}, accessToken);
  const pub = await json<{ store: { zones: { id: string }[] }; product: { id: string } }>('/public/p/demo123');
  const order = await json<{ orderId: string; number: number }>(`/public/stores/demo/orders`, {
    productId: pub.product.id, quantity: 1, customerName: 'Cliente E2E', customerPhone: `07${String(Date.now()).slice(-8)}`, zoneId: pub.store.zones[0]!.id, address: 'Rue E2E',
  });
  await json(`/stores/${store.id}/orders/${order.orderId}/status`, { status: 'CONFIRMED' }, accessToken);
  await json(`/stores/${store.id}/orders/${order.orderId}/assign`, { courierId: courier.id }, accessToken);

  await page.goto('/livreur/connexion');
  await page.getByLabel('Numéro de téléphone').fill(phone);
  await page.getByLabel('Code PIN').fill(pin);
  await page.getByRole('button', { name: 'Voir mes colis' }).click();
  const card = page.locator('article', { hasText: `n°${order.number}` });
  await expect(card).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await card.getByRole('button', { name: /Livrée/ }).click();
  await expect(page.getByText('Hors ligne')).toBeVisible();
  await expect(page.getByText(/action\(s\) en attente d’envoi/)).toBeVisible();
  await expect(card).toHaveCount(0);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText(/action\(s\) envoyée\(s\)/)).toBeVisible({ timeout: 15_000 });

  const detail = await json<{ status: string; events: { note: string | null; toStatus: string | null }[] }>(`/stores/${store.id}/orders/${order.orderId}`, undefined, accessToken);
  expect(detail.status).toBe('DELIVERED');
});
