import { expect, test, type Page } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
const run = Date.now().toString(36);
const phoneFor = (n: number) => `07${String(10_000_000 + ((Date.now() + n * 7919) % 89_999_999)).slice(-8)}`;

async function signIn(page: Page, phone: string, signup = true) {
  await page.goto(signup ? '/login?signup=1' : '/login');
  await page.getByLabel('Numéro de téléphone').fill(phone);
  await page.getByRole('button', { name: 'Recevoir le code par SMS' }).click();
  const hint = page.getByText(/votre code est \d{6}/);
  await expect(hint).toBeVisible();
  const code = (await hint.textContent())!.match(/\d{6}/)![0];
  await page.getByLabel('Code à 6 chiffres').fill(code);
  if (signup) await page.getByLabel('Votre nom').fill('Awa Testeuse');
  await page.getByRole('button', { name: 'Continuer' }).click();
}

test('parcours A, B et C : création de boutique, commande client, traitement marchand', async ({ page, browser }) => {
  // ---------- Parcours A ----------
  const started = Date.now();
  await signIn(page, phoneFor(1));
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Nom de la boutique').fill(`Boutique E2E ${run}`);
  await expect(page.getByText(`boutique-e2e-${run}.`)).toBeVisible();
  await page.getByRole('button', { name: 'Créer ma boutique' }).click();
  await page.getByRole('button', { name: 'Passer cette étape' }).click();
  await page.getByRole('button', { name: 'Enregistrer les zones' }).click();
  await page.getByLabel('Nom du produit').fill('Pagne wax 6 yards');
  await page.getByLabel('Prix', { exact: true }).fill('12000');
  await page.getByLabel('Prix barré').fill('15000');
  await page.getByLabel('Description').fill('Wax 100 % coton, motifs variés.');
  await page.getByRole('button', { name: 'Publier le produit' }).click();
  await expect(page.getByText('Votre boutique est en ligne !')).toBeVisible();
  const productUrl = (await page.locator('span.truncate').first().textContent())!.trim();
  expect(productUrl).toMatch(/\/p\/[a-z0-9]{7}$/);
  console.log(`Parcours A en ${Math.round((Date.now() - started) / 1000)} s`);
  await page.getByRole('button', { name: 'Aller au tableau de bord' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

  // ---------- Parcours B : a customer on another phone, no account ----------
  const customer = await browser.newContext({ ...test.info().project.use });
  const shop = await customer.newPage();
  const path = new URL(productUrl).pathname;
  await shop.goto(`${path}?utm_source=facebook&utm_campaign=e2e`);
  await expect(shop.getByRole('heading', { name: 'Pagne wax 6 yards' })).toBeVisible();
  await expect(shop.getByText('−20 %')).toBeVisible();
  const orderStart = Date.now();
  await shop.getByLabel('Nom complet *').fill('Fatou Client');
  await shop.getByLabel('Téléphone *').fill('05 44 55 66 77');
  await shop.getByLabel('Ville / commune *').selectOption({ label: 'Abidjan – Yopougon · 1 500 F CFA · 24 h' });
  await shop.getByLabel('Adresse / repère *').fill('Derrière la pharmacie Sainte-Rita');
  await expect(shop.getByText('13 500 F CFA').first()).toBeVisible();
  await shop.getByRole('button', { name: /Commander maintenant/ }).click();
  await expect(shop.getByText('Merci, votre commande est enregistrée !')).toBeVisible();
  console.log(`Parcours B en ${Math.round((Date.now() - orderStart) / 1000)} s (saisie automatisée)`);

  // ---------- Parcours C : the merchant sees it live and processes it ----------
  await page.goto('/dashboard/orders');
  const row = page.getByRole('link', { name: /#1 · Fatou Client/ });
  await expect(row).toBeVisible({ timeout: 5000 });
  await expect(row).toContainText('Facebook');
  await row.click();
  await expect(page.getByRole('link', { name: '📞 Appeler' })).toHaveAttribute('href', 'tel:+2250544556677');
  await expect(page.getByRole('link', { name: /WhatsApp/ }).first()).toHaveAttribute('href', /wa\.me\/2250544556677\?text=/);
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByText('Confirmée').first()).toBeVisible();

  // Add a courier, then assign: the order goes out for delivery.
  await page.goto('/dashboard/couriers');
  await page.getByLabel('Nom').fill('Koffi Livreur');
  await page.getByLabel('Téléphone').fill(phoneFor(2));
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByText('Koffi Livreur')).toBeVisible();
  await page.goto('/dashboard/orders?x=1');
  await page.getByRole('button', { name: /Confirmée/ }).click();
  await page.getByRole('link', { name: /#1 · Fatou Client/ }).click();
  await page.getByLabel('Livreur').selectOption({ label: 'Koffi Livreur (0 en cours)' });
  await expect(page.getByText('En livraison').first()).toBeVisible();
  await page.getByRole('button', { name: 'Livrée' }).click();
  await expect(page.getByText('Livrée').first()).toBeVisible();

  // Cash owed by the courier, then remitted.
  await page.goto('/dashboard/couriers');
  await expect(page.getByText('13 500 F CFA').first()).toBeVisible();
  await page.getByRole('button', { name: 'Rapport du jour' }).click();
  await page.getByRole('button', { name: 'Valider le versement' }).click();
  await expect(page.locator('p.text-lg', { hasText: '0 F CFA' })).toBeVisible();

  // Tracking page shows delivered.
  await shop.reload();
  await expect(shop.getByText('Livrée')).toBeVisible();
  await customer.close();
});

test('la page produit reste légère en 3G simulée', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  // Fast 3G profile: 1.6 Mb/s down, 150 ms RTT.
  await client.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  let bytes = 0;
  page.on('response', async (r) => {
    const len = Number(r.headers()['content-length'] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
    bytes += len;
  });
  const t0 = Date.now();
  await page.goto('/p/demo123', { waitUntil: 'load' });
  const loadMs = Date.now() - t0;
  console.log(`Page produit : ${loadMs} ms, ${Math.round(bytes / 1024)} Ko transférés`);
  expect(loadMs).toBeLessThan(2000);
  expect(bytes).toBeLessThan(500 * 1024);
  void API;
});
