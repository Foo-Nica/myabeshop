'use client';

import { useEffect, useState } from 'react';
import { formatMoney, type ZoneDto } from '@myabeshop/shared/client';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Alert, Button, Card, Field, Input, MoneyInput } from '@/components/ui';

const EMPTY = { name: '', city: '', fee: 1000 as number | null, freeAbove: null as number | null, delay: '24 h' };

/** Delivery zones and fees (§6.4). */
export default function ZonesPage() {
  const { store } = useSession();
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => store && api.get<ZoneDto[]>(`/stores/${store.id}/zones`).then(setZones);
  useEffect(() => void load(), [store]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!store) return null;
  const fmt = (n: number) => formatMoney(n, store.currency);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = { name: form.name, city: form.city, fee: form.fee ?? 0, freeAbove: form.freeAbove, delay: form.delay || null };
    try {
      if (editing) await api.patch(`/stores/${store!.id}/zones/${editing}`, body);
      else await api.post(`/stores/${store!.id}/zones`, { ...body, position: zones.length });
      setForm(EMPTY);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Zones de livraison</h1>
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {zones.map((z) => (
            <li key={z.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${z.active ? '' : 'text-muted line-through'}`}>
                  {z.name} <span className="font-normal text-muted">· {z.city}</span>
                </p>
                <p className="text-sm text-muted">
                  {fmt(z.fee)}
                  {z.freeAbove ? ` · gratuite dès ${fmt(z.freeAbove)}` : ''}
                  {z.delay ? ` · ${z.delay}` : ''}
                </p>
              </div>
              <Button variant="ghost" onClick={() => { setEditing(z.id); setForm({ name: z.name, city: z.city, fee: z.fee, freeAbove: z.freeAbove, delay: z.delay ?? '' }); }}>
                Modifier
              </Button>
              <Button variant="ghost" onClick={async () => { await api.patch(`/stores/${store.id}/zones/${z.id}`, { active: !z.active }); await load(); }}>
                {z.active ? 'Désactiver' : 'Activer'}
              </Button>
            </li>
          ))}
          {zones.length === 0 && <li className="p-4 text-center text-muted">Aucune zone. Sans zone, les clients ne peuvent pas commander.</li>}
        </ul>
      </Card>

      <Card>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <p className="font-semibold sm:col-span-2">{editing ? 'Modifier la zone' : 'Ajouter une zone'}</p>
          {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
          <Field label="Zone / quartier" htmlFor="zn"><Input id="zn" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Ville" htmlFor="zc"><Input id="zc" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          <Field label="Frais de livraison" htmlFor="zf"><MoneyInput id="zf" value={form.fee} currency={store.currency} onChange={(v) => setForm({ ...form, fee: v })} /></Field>
          <Field label="Gratuite à partir de" htmlFor="zfa" hint="Facultatif"><MoneyInput id="zfa" value={form.freeAbove} currency={store.currency} onChange={(v) => setForm({ ...form, freeAbove: v })} /></Field>
          <Field label="Délai estimé" htmlFor="zd"><Input id="zd" value={form.delay} onChange={(e) => setForm({ ...form, delay: e.target.value })} placeholder="24 h" /></Field>
          <div className="flex items-end gap-2">
            <Button type="submit">{editing ? 'Enregistrer' : 'Ajouter'}</Button>
            {editing && <Button type="button" variant="ghost" onClick={() => { setEditing(null); setForm(EMPTY); }}>Annuler</Button>}
          </div>
        </form>
      </Card>

      <Card className="text-sm">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-5"
            checked={!store.blockUnservedZones}
            onChange={async (e) => { await api.patch(`/stores/${store.id}`, { blockUnservedZones: !e.target.checked }); window.location.reload(); }}
          />
          Accepter les commandes hors zones (marquées « à expédier par transporteur »)
        </label>
      </Card>
    </div>
  );
}
