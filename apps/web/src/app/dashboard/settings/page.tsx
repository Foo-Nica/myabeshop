'use client';

import { useEffect, useState } from 'react';
import type { StoreWithRole, UpdateStoreInput } from '@myabeshop/shared/client';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import { ShareLinks } from '@/components/dashboard/ShareLinks';

type Member = { id: string; role: string; user: { name: string; phone: string | null; email: string | null } };
const ROLE_LABEL: Record<string, string> = { OWNER: 'Propriétaire', MANAGER: 'Gestionnaire', AGENT: 'Agent de confirmation', COURIER: 'Livreur' };

export default function SettingsPage() {
  const { store, can, reload } = useSession();
  const [form, setForm] = useState<UpdateStoreInput>({});
  const [logo, setLogo] = useState<string[]>([]);
  const [banner, setBanner] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invite, setInvite] = useState({ name: '', target: '', role: 'AGENT' });

  useEffect(() => {
    if (!store) return;
    setForm({
      name: store.name, description: store.description, primaryColor: store.primaryColor, phone: store.phone, whatsappPhone: store.whatsappPhone,
      address: store.address, openingHours: store.openingHours, deliveryPolicy: store.deliveryPolicy, returnPolicy: store.returnPolicy,
      locale: store.locale as 'fr' | 'en', closed: store.status === 'CLOSED', closedMessage: store.closedMessage, maxOrdersPerPhonePerDay: store.maxOrdersPerPhonePerDay,
    });
    setLogo(store.logoUrl ? [store.logoUrl] : []);
    setBanner(store.bannerUrl ? [store.bannerUrl] : []);
    if (can('team.manage')) void api.get<Member[]>(`/stores/${store.id}/members`).then(setMembers);
  }, [store, can]);

  if (!store) return null;
  const set = <K extends keyof UpdateStoreInput>(k: K, v: UpdateStoreInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Ma boutique</h1>
      <Card>
        <p className="mb-2 font-semibold">Lien de la boutique</p>
        <ShareLinks url={store.url} title={store.name} />
      </Card>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            await api.patch<StoreWithRole>(`/stores/${store.id}`, { ...form, logoUrl: logo[0] ?? null, bannerUrl: banner[0] ?? null });
            await reload();
            setMsg({ tone: 'success', text: 'Modifications enregistrées.' });
          } catch (err) {
            setMsg({ tone: 'error', text: err instanceof ApiError ? err.message : 'Erreur' });
          }
        }}
      >
        <Card className="space-y-4">
          <Field label="Nom" htmlFor="sn"><Input id="sn" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Description" htmlFor="sd"><Textarea id="sd" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Logo"><ImageUploader storeId={store.id} value={logo} onChange={setLogo} max={1} label="Logo" /></Field>
            <Field label="Bannière"><ImageUploader storeId={store.id} value={banner} onChange={setBanner} max={1} label="Bannière" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Couleur principale" htmlFor="sc"><Input id="sc" type="color" value={form.primaryColor ?? '#0f766e'} onChange={(e) => set('primaryColor', e.target.value)} className="h-11 p-1" /></Field>
            <Field label="Langue de la boutique" htmlFor="sl">
              <Select id="sl" value={form.locale} onChange={(e) => set('locale', e.target.value as 'fr' | 'en')}><option value="fr">Français</option><option value="en">English</option></Select>
            </Field>
          </div>
        </Card>
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp" htmlFor="sw"><Input id="sw" type="tel" value={form.whatsappPhone ?? ''} onChange={(e) => set('whatsappPhone', e.target.value)} /></Field>
          <Field label="Téléphone" htmlFor="sp"><Input id="sp" type="tel" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Adresse" htmlFor="sa"><Input id="sa" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Horaires" htmlFor="sh"><Input id="sh" value={form.openingHours ?? ''} onChange={(e) => set('openingHours', e.target.value)} /></Field>
          <Field label="Politique de livraison" htmlFor="sdp"><Textarea id="sdp" value={form.deliveryPolicy ?? ''} onChange={(e) => set('deliveryPolicy', e.target.value)} /></Field>
          <Field label="Politique de retour" htmlFor="srp"><Textarea id="srp" value={form.returnPolicy ?? ''} onChange={(e) => set('returnPolicy', e.target.value)} /></Field>
        </Card>
        <Card className="space-y-3">
          <p className="font-semibold">Anti-fraude</p>
          <Field label="Commandes maximum par numéro et par jour" htmlFor="smax">
            <Input id="smax" type="number" min={1} max={100} value={form.maxOrdersPerPhonePerDay ?? 5} onChange={(e) => set('maxOrdersPerPhonePerDay', Number(e.target.value))} />
          </Field>
          <label className="flex items-center gap-3">
            <input type="checkbox" className="size-5" checked={!!form.closed} onChange={(e) => set('closed', e.target.checked)} />
            <span className="font-semibold">Boutique temporairement fermée</span>
          </label>
          {form.closed && <Field label="Message affiché" htmlFor="scm"><Input id="scm" value={form.closedMessage ?? ''} onChange={(e) => set('closedMessage', e.target.value)} placeholder="De retour lundi !" /></Field>}
        </Card>
        <Button type="submit">Enregistrer</Button>
      </form>

      {can('team.manage') && (
        <Card className="space-y-3">
          <p className="font-semibold">Équipe</p>
          <ul className="divide-y divide-line text-sm">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                <span>{m.user.name} <span className="text-muted">· {m.user.phone ?? m.user.email}</span></span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">{ROLE_LABEL[m.role]}</span>
                  {m.role !== 'OWNER' && (
                    <button className="text-red-600 underline" onClick={async () => { await api.delete(`/stores/${store.id}/members/${m.id}`); setMembers((ms) => ms.filter((x) => x.id !== m.id)); }}>Retirer</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <form
            className="grid gap-2 sm:grid-cols-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.post(`/stores/${store.id}/members`, invite);
                setMembers(await api.get<Member[]>(`/stores/${store.id}/members`));
                setInvite({ name: '', target: '', role: 'AGENT' });
              } catch (err) {
                setMsg({ tone: 'error', text: err instanceof ApiError ? err.message : 'Erreur' });
              }
            }}
          >
            <Input aria-label="Nom" placeholder="Nom" required value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            <Input aria-label="Téléphone ou e-mail" placeholder="Téléphone ou e-mail" required value={invite.target} onChange={(e) => setInvite({ ...invite, target: e.target.value })} />
            <Select aria-label="Rôle" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              <option value="MANAGER">Gestionnaire</option>
              <option value="AGENT">Agent de confirmation</option>
            </Select>
            <Button type="submit" variant="secondary">Ajouter</Button>
          </form>
          <p className="text-xs text-muted">Le membre se connecte avec ce numéro (code par SMS) ou cet e-mail.</p>
        </Card>
      )}
    </div>
  );
}
