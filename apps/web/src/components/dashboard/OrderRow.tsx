import { formatMoney, type OrderSummaryDto } from '@myabeshop/shared/client';
import { FLAG_LABEL, SOURCE_LABEL, STATUS_LABEL, STATUS_TONE, timeAgo } from '@/lib/labels';
import { Badge } from '@/components/ui';

export function StatusBadge({ status }: { status: OrderSummaryDto['status'] }) {
  return <Badge className={STATUS_TONE[status]}>{STATUS_LABEL[status].fr}</Badge>;
}

export function OrderRow({ order, selected, onSelect }: { order: OrderSummaryDto; selected?: boolean; onSelect?: (v: boolean) => void }) {
  return (
    <li className="flex items-stretch gap-2 border-b border-line last:border-0">
      {onSelect && (
        <label className="flex w-10 shrink-0 items-center justify-center">
          <input type="checkbox" className="size-5" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Sélectionner la commande ${order.number}`} />
        </label>
      )}
      <a href={`/dashboard/orders/${order.id}`} className="block min-w-0 flex-1 py-3 pr-3 hover:bg-canvas/60">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-semibold">
            #{order.number} · {order.customerName}
          </p>
          <p className="shrink-0 font-bold">{formatMoney(order.total, order.currency)}</p>
        </div>
        <p className="truncate text-sm text-muted">{order.itemsSummary}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <StatusBadge status={order.status} />
          <span>{order.city}</span>
          <span>· {timeAgo(order.createdAt)}</span>
          {order.source && order.source !== 'direct' && <span>· {SOURCE_LABEL[order.source] ?? order.source}</span>}
          {order.courierName && <span>· 🛵 {order.courierName}</span>}
          {order.flags.map((f) => (
            <Badge key={f} className="bg-red-50 text-red-700">
              ⚠ {FLAG_LABEL[f] ?? f}
            </Badge>
          ))}
        </div>
      </a>
    </li>
  );
}
