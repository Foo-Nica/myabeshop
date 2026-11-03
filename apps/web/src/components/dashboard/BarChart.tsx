'use client';

import { useState } from 'react';

/**
 * Single-series daily bar chart: thin bars with rounded tops anchored to the baseline,
 * recessive grid, hover tooltip with a hit area larger than the bar.
 */
export function BarChart({
  data,
  format,
  label,
  color = '#0f8a6f',
  height = 160,
  integer = false,
}: {
  data: { day: string; value: number }[];
  format: (n: number) => string;
  label: string;
  color?: string;
  height?: number;
  /** Whole-number data (counts): ticks stay integers. */
  integer?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  // Two equal steps on round numbers (1, 2, 2.5, 5 × 10^k); whole steps for counts.
  const nice = (() => {
    const raw = max / 2;
    const mag = 10 ** Math.floor(Math.log10(raw));
    let step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
    if (integer) step = Math.max(1, Math.ceil(step));
    return step * 2;
  })();
  const w = 100 / Math.max(data.length, 1);
  const short = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const ticks = [0, nice / 2, nice];

  return (
    <figure className="relative" aria-label={label}>
      <div className="flex">
        <div className="relative mr-2 w-14 shrink-0 text-right text-[11px] text-muted" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / nice) * 100}%` }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-line" style={{ top: `${(1 - t / nice) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <button
                key={d.day}
                type="button"
                className="relative flex h-full items-end justify-center focus:outline-none"
                style={{ width: `${w}%` }}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => setHover(i)}
                aria-label={`${short(d.day)} : ${format(d.value)}`}
              >
                <span
                  className="block rounded-t-[4px] transition-opacity"
                  style={{ height: `${(d.value / nice) * 100}%`, width: 'max(3px, 62%)', background: color, opacity: hover == null || hover === i ? 1 : 0.45, minHeight: d.value > 0 ? 2 : 0 }}
                />
              </button>
            ))}
          </div>
          {hover != null && data[hover] && (
            <div
              role="status"
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
              style={{ left: `${(hover + 0.5) * w}%` }}
            >
              <span className="text-white/70">{short(data[hover].day)}</span> · <strong>{format(data[hover].value)}</strong>
            </div>
          )}
        </div>
      </div>
      <div className="mt-1 ml-16 flex justify-between text-[11px] text-muted">
        <span>{data[0] && short(data[0].day)}</span>
        <span>{data.length > 2 && short(data[Math.floor(data.length / 2)]!.day)}</span>
        <span>{data.at(-1) && short(data.at(-1)!.day)}</span>
      </div>
    </figure>
  );
}
