'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatMoney, type IntegrationsDto, type PromoCodeDto, type PromoType } from '@myabeshop/shared/client';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Alert, Badge, Button, Card, Field, Input, MoneyInput, Select } from '@/components/ui';

const APPS_SCRIPT = `function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var o = data.order;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Commandes')
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet('Commandes');
  if (sheet.getLastRow() === 0) sheet.appendRow(['N°', 'Date', 'Statut', 'Client', 'Téléphone', 'Ville', 'Adresse', 'Articles', 'Total', 'Source', 'Livreur']);
  var rows = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues();
  var row = [o.number, o.date, o.status, o.customerName, o.customerPhone, o.city, o.address, o.items, o.total, o.source, o.courier];
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === o.number) { sheet.getRange(i + 1, 1, 1, row.length).setValues([row]); return ContentService.createTextOutput('ok'); }
  }
  sheet.appendRow(row);
  return ContentService.createTextOutput('ok');
}`;

function promoLabel(p: PromoCodeDto, currency: string) {
  if (p.type === 'PERCENT') return `−${p.value} %`;
  if (p.type === 'FIXED') return `−${formatMoney(p.value, currency)}`;
  return 'Livraison offerte';
}

function Locked({ feature }: { feature: string }) {
  return (
    <Alert tone="info">
      {feature} n’est pas inclus dans votre plan.{' '}
      <a href="/dashboard/billing" className="font-semibold underline">
        Voir les plans
      </a>
    </Alert>
  );
}

export default function MarketingPage() {
  const { store } = useSession();
  const [promos, setPromos] = useState<PromoCodeDto[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationsDto | null>(null);
  const [form, setForm] = useState<{ code: string; type: PromoType; value: number | null; minSubtotal: number | null; usageLimit: string; endsAt: string }>({
    code: '', type: 'PERCENT', value: 10, minSubtotal: null, usageLimit: '', endsAt: '',
  });
  const [pixels, setPixels] = useState({ metaPixelId: '', tiktokPixelId: '' });
  const [sheetUrl, setSheetUrl] = useState('');
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string; where: string } | null>(null);
  const [showScript, setShowScript] = useState(false);

  const load = useCallback(async () => {
    if (!store) return;
    const [p, i] = await Promise.all([api.get<PromoCodeDto[]>(`/stores/${store.id}/promo-codes`), api.get<IntegrationsDto>(`/stores/${store.id}/integrations`)]);
    setPromos(p);
    setIntegrations(i);
    setPixels({ metaPixelId: i.pixels.metaPixelId ?? '', tiktokPixelId: i.pixels.tiktokPixelId ?? '' });
    setSheetUrl(i.sheets.webhookUrl ?? '');
  }, [store]);
  useEffect(() => void load(), [load]);

  if (!store || !integrations) return null;
  const fmt = (n: number) => formatMoney(n, store.currency);
  const run = async (where: string, fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      await load();
      setMsg({ tone: 'success', text: ok, where });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Erreur', where });
    }
  };
  const Msg = ({ where }: { where: string }) => (msg?.where === where ? <Alert tone={msg.tone}>{msg.text}</Alert> : null);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Marketing</h1>

      <Card className="space-y-4">
        <div>
          <h2 className="font-bold">Codes promo</h2>
          <p className="text-sm text-muted">Le client saisit le code sur la page produit ; la remise s’affiche avant de commander.</p>
        </div>
        {!integrations.allowed.promoCodes ? (
          <Locked feature="Les codes promo" />
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                'promo',
                () =>
                  api.post(`/stores/${store.id}/promo-codes`, {
                    code: form.code,
                    type: form.type,
                    value: form.type === 'FREE_SHIPPING' ? 0 : (form.value ?? 0),
                    minSubtotal: form.minSubtotal,
                    usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
                    endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
                  }),
                `Code ${form.code.toUpperCase()} créé`,
              ).then(() => setForm((f) => ({ ...f, code: '' })));
            }}
          >
            <Field label="Code" htmlFor="pc-code">
              <Input id="pc-code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="TABASKI15" />
            </Field>
            <Field label="Type" htmlFor="pc-type">
              <Select id="pc-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PromoType })}>
                <option value="PERCENT">Pourcentage</option>
                <option value="FIXED">Montant fixe</option>
                <option value="FREE_SHIPPING">Livraison offerte</option>
              </Select>
            </Field>
            {form.type === 'PERCENT' && (
              <Field label="Réduction (%)" htmlFor="pc-val">
                <Input id="pc-val" inputMode="numeric" value={form.value ?? ''} onChange={(e) => setForm({ ...form, value: Number(e.target.value.replace(/\D/g, '')) || null })} />
              </Field>
            )}
            {form.type === 'FIXED' && (
              <Field label="Réduction" htmlFor="pc-val">
                <MoneyInput id="pc-val" value={form.value} currency={store.currency} onChange={(v) => setForm({ ...form, value: v })} />
              </Field>
            )}
            {form.type === 'FREE_SHIPPING' && <div />}
            <Field label="Panier minimum" htmlFor="pc-min" hint="facultatif">
              <MoneyInput id="pc-min" value={form.minSubtotal} currency={store.currency} onChange={(v) => setForm({ ...form, minSubtotal: v })} />
            </Field>
            <Field label="Nombre d’utilisations max" htmlFor="pc-lim" hint="facultatif">
              <Input id="pc-lim" inputMode="numeric" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <Field label="Expire le" htmlFor="pc-end" hint="facultatif">
              <Input id="pc-end" type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={form.code.length < 3}>
                Créer le code
              </Button>
            </div>
          </form>
        )}
        <Msg where="promo" />
        {promos.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {promos.map((p) => {
              const expired = p.endsAt && new Date(p.endsAt) < new Date();
              const exhausted = p.usageLimit != null && p.usedCount >= p.usageLimit;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                  <div>
                    <p className="font-mono font-bold">{p.code}</p>
                    <p className="text-sm text-muted">
                      {promoLabel(p, store.currency)}
                      {p.minSubtotal ? ` · dès ${fmt(p.minSubtotal)}` : ''} · {p.usedCount}
                      {p.usageLimit ? ` / ${p.usageLimit}` : ''} utilisation(s)
                      {p.endsAt ? ` · jusqu’au ${new Date(p.endsAt).toLocaleDateString('fr-FR')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={!p.active || expired || exhausted ? 'bg-gray-100 text-gray-700' : 'bg-emerald-100 text-emerald-900'}>
                      {!p.active ? 'Désactivé' : expired ? 'Expiré' : exhausted ? 'Épuisé' : 'Actif'}
                    </Badge>
                    <Button variant="ghost" onClick={() => void run('promo', () => api.patch(`/stores/${store.id}/promo-codes/${p.id}`, { active: !p.active }), p.active ? 'Code désactivé' : 'Code réactivé')}>
                      {p.active ? 'Désactiver' : 'Activer'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-bold">Pixels publicitaires</h2>
          <p className="text-sm text-muted">Suivez vos ventes dans le Gestionnaire de publicités : vue du produit, début de commande et achat (avec le montant).</p>
        </div>
        {!integrations.allowed.pixels ? (
          <Locked feature="Les pixels" />
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run('pixels', () => api.put(`/stores/${store.id}/integrations/pixels`, { metaPixelId: pixels.metaPixelId || null, tiktokPixelId: pixels.tiktokPixelId || null }), 'Pixels enregistrés');
            }}
          >
            <Field label="Pixel Meta (Facebook / Instagram)" htmlFor="px-meta" hint="ID à 15-16 chiffres">
              <Input id="px-meta" inputMode="numeric" value={pixels.metaPixelId} onChange={(e) => setPixels({ ...pixels, metaPixelId: e.target.value.trim() })} placeholder="123456789012345" />
            </Field>
            <Field label="Pixel TikTok" htmlFor="px-tt">
              <Input id="px-tt" value={pixels.tiktokPixelId} onChange={(e) => setPixels({ ...pixels, tiktokPixelId: e.target.value.trim().toUpperCase() })} placeholder="C1ABCDEFGH2IJKLMNOP3" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        )}
        <Msg where="pixels" />
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-bold">Google Sheets</h2>
          <p className="text-sm text-muted">Chaque nouvelle commande et chaque changement de statut s’ajoutent à votre feuille Google, en temps réel.</p>
        </div>
        {!integrations.allowed.sheets ? (
          <Locked feature="Google Sheets" />
        ) : (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Ouvrez votre feuille Google › Extensions › Apps Script.</li>
              <li>
                Collez{' '}
                <button type="button" className="font-semibold text-brand-700 underline" onClick={() => setShowScript((v) => !v)}>
                  ce script
                </button>
                , puis Déployer › Nouveau déploiement › Application Web (accès : tout le monde).
              </li>
              <li>Copiez l’URL de l’application ci-dessous.</li>
            </ol>
            {showScript && <pre className="max-h-64 overflow-auto rounded-xl bg-ink p-3 text-xs text-white">{APPS_SCRIPT}</pre>}
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                void run('sheets', () => api.put(`/stores/${store.id}/integrations/sheets`, { webhookUrl: sheetUrl, active: true }), 'Google Sheets connecté');
              }}
            >
              <Input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" aria-label="URL Apps Script" />
              <Button type="submit" disabled={!sheetUrl}>
                Connecter
              </Button>
              {integrations.sheets.webhookUrl && (
                <Button type="button" variant="secondary" onClick={() => void run('sheets', () => api.post(`/stores/${store.id}/integrations/sheets/test`), 'Ligne de test envoyée')}>
                  Tester
                </Button>
              )}
            </form>
            {integrations.sheets.lastSyncAt && (
              <p className={`text-sm ${integrations.sheets.lastError ? 'text-red-700' : 'text-muted'}`}>
                Dernier envoi : {new Date(integrations.sheets.lastSyncAt).toLocaleString('fr-FR')} {integrations.sheets.lastError ? `· erreur ${integrations.sheets.lastError}` : '· OK'}
              </p>
            )}
          </>
        )}
        <Msg where="sheets" />
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Parrainage</h2>
          <p className="text-sm text-muted">Un mois offert pour chaque vendeur invité qui s’abonne.</p>
        </div>
        <a href="/dashboard/billing" className="font-semibold text-brand-700">
          Mon lien de parrainage →
        </a>
      </Card>
    </div>
  );
}

