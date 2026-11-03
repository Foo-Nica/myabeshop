'use client';

import { useEffect, useState } from 'react';
import type { AuditEntry } from '@myabeshop/shared/client';
import { api } from '@/lib/api';
import { Card, Select } from '@/components/ui';

const FILTERS = [
  { value: '', label: 'Toutes les actions' },
  { value: 'admin.', label: 'Back-office' },
  { value: 'billing.', label: 'Facturation' },
  { value: 'store.', label: 'Boutiques' },
  { value: 'member.', label: 'Équipes' },
  { value: 'courier.', label: 'Livreurs' },
  { value: 'customer.', label: 'Clients (liste noire)' },
  { value: 'user.', label: 'Inscriptions' },
];

export default function AdminAudit() {
  const [action, setAction] = useState('');
  const [rows, setRows] = useState<AuditEntry[]>([]);
  useEffect(() => void api.get<AuditEntry[]>(`/admin/audit?limit=200${action ? `&action=${action}` : ''}`).then(setRows), [action]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Journal d’audit</h1>
        <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filtrer" className="w-56">
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>
      <Card className="!p-0">
        <ul className="divide-y divide-line text-sm">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span>
                <span className="font-mono text-xs font-semibold">{a.action}</span>
                {a.target && <span className="ml-2 font-mono text-xs text-muted">{a.target}</span>}
                {a.storeId && (
                  <a href={`/admin/stores/${a.storeId}`} className="ml-2 text-xs text-brand-700 underline">
                    boutique
                  </a>
                )}
              </span>
              <span className="text-xs text-muted">
                {a.actorName ?? 'système'}
                {a.ip ? ` · ${a.ip}` : ''} · {new Date(a.createdAt).toLocaleString('fr-FR')}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
