'use client';

import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Spinner } from '@/components/ui';

/** Uploads photos; the API resizes them and converts them to WebP. */
export function ImageUploader({ storeId, value, onChange, max = 10, label = 'Ajouter des photos' }: { storeId: string; value: string[]; onChange: (urls: string[]) => void; max?: number; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files) return;
    setError(null);
    const room = max - value.length;
    const list = Array.from(files).slice(0, room);
    setBusy(list.length);
    const urls = [...value];
    for (const f of list) {
      try {
        const { url } = await api.upload(storeId, f);
        urls.push(url);
        onChange([...urls]);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Échec de l’envoi');
      } finally {
        setBusy((b) => b - 1);
      }
    }
    if (input.current) input.current.value = '';
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {value.map((url, i) => (
          <div key={url} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-canvas">
            <img src={url} alt="" className="size-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/45 p-1">
              <button type="button" aria-label="Mettre en premier" disabled={i === 0} className="size-7 rounded text-white disabled:opacity-30" onClick={() => onChange([url, ...value.filter((u) => u !== url)])}>
                ★
              </button>
              <button type="button" aria-label="Retirer la photo" className="size-7 rounded text-white" onClick={() => onChange(value.filter((u) => u !== url))}>
                ✕
              </button>
            </div>
          </div>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => input.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-xs font-medium text-muted hover:border-brand-500">
            {busy > 0 ? <Spinner /> : <span className="text-2xl">＋</span>}
            <span className="px-1 text-center">{busy > 0 ? 'Envoi…' : label}</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple={max > 1} hidden onChange={(e) => void add(e.target.files)} />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
