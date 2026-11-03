'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui';

/** Copy, WhatsApp, Facebook and downloadable QR code for a product or store link (§5.3). */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 512, margin: 2 }).then(setQr).catch(() => setQr(null));
  }, [url]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas p-2 pl-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{url}</span>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
            } catch {
              /* older browsers */
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? 'Copié ✓' : 'Copier'}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a className="tap flex items-center justify-center rounded-xl bg-[#1fa855] px-3 font-semibold text-white" target="_blank" rel="noopener" href={`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`}>
          WhatsApp
        </a>
        <a className="tap flex items-center justify-center rounded-xl bg-[#1877f2] px-3 font-semibold text-white" target="_blank" rel="noopener" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}>
          Facebook
        </a>
      </div>
      {qr && (
        <div className="flex items-center gap-3">
          <img src={qr} alt="QR code" width={96} height={96} className="rounded-lg border border-line" />
          <a href={qr} download={`qr-${title.slice(0, 30).replace(/\W+/g, '-')}.png`} className="text-sm font-semibold text-brand-700 underline">
            Télécharger le QR code
          </a>
        </div>
      )}
    </div>
  );
}
