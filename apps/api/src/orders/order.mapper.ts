import type { Courier, Customer, DeliveryZone, Order, OrderEvent, OrderItem } from '@prisma/client';
import {
  orderRecapMessage,
  whatsappLink,
  type OrderDetailDto,
  type OrderSummaryDto,
  type OrderStatus,
} from '@myabeshop/shared';
import { trackingUrl } from '../common/config';

export const orderSummaryInclude = {
  items: { select: { title: true, variantTitle: true, quantity: true } },
  courier: { select: { id: true, name: true } },
} as const;

export const orderDetailInclude = {
  items: true,
  events: { orderBy: { createdAt: 'asc' as const } },
  courier: true,
  zone: true,
  customer: true,
} as const;

type SummaryOrder = Order & {
  items: Pick<OrderItem, 'title' | 'variantTitle' | 'quantity'>[];
  courier: Pick<Courier, 'id' | 'name'> | null;
};

type DetailOrder = Order & {
  items: OrderItem[];
  events: OrderEvent[];
  courier: Courier | null;
  zone: DeliveryZone | null;
  customer: Customer;
};

export function customerScore(c: Pick<Customer, 'deliveredCount' | 'refusedCount'>): number | null {
  const total = c.deliveredCount + c.refusedCount;
  return total === 0 ? null : Math.round((c.deliveredCount / total) * 100);
}

export function toOrderSummary(o: SummaryOrder): OrderSummaryDto {
  return {
    id: o.id,
    number: o.number,
    status: o.status as OrderStatus,
    currency: o.currency,
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    total: o.total,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    city: o.city,
    source: o.source,
    flags: o.flags,
    callAttempts: o.callAttempts,
    courierId: o.courierId,
    courierName: o.courier?.name ?? null,
    agentId: o.agentId,
    itemsSummary: o.items.map((i) => `${i.quantity} × ${i.title}${i.variantTitle ? ` (${i.variantTitle})` : ''}`).join(', '),
    createdAt: o.createdAt.toISOString(),
  };
}

export function toOrderDetail(o: DetailOrder, store: { name: string; locale: string }): OrderDetailDto {
  const recap = orderRecapMessage({
    storeName: store.name,
    orderNumber: o.number,
    customerName: o.customerName,
    items: o.items,
    total: o.total,
    currency: o.currency,
    city: o.city,
    address: o.address,
    locale: store.locale === 'en' ? 'en' : 'fr',
  });
  return {
    ...toOrderSummary(o),
    trackingToken: o.trackingToken,
    zoneId: o.zoneId,
    zoneName: o.zone?.name ?? null,
    address: o.address,
    gps: o.gpsLat != null && o.gpsLng != null ? { lat: o.gpsLat, lng: o.gpsLng } : null,
    note: o.note,
    utm: (o.utm as Record<string, string> | null) ?? null,
    postponedTo: o.postponedTo?.toISOString() ?? null,
    refusalReason: o.refusalReason,
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      title: i.title,
      variantTitle: i.variantTitle,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.total,
    })),
    events: o.events.map((e) => ({
      id: e.id,
      type: e.type,
      fromStatus: e.fromStatus as OrderStatus | null,
      toStatus: e.toStatus as OrderStatus | null,
      userName: e.userName,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
    customer: {
      id: o.customer.id,
      deliveredCount: o.customer.deliveredCount,
      refusedCount: o.customer.refusedCount,
      blacklisted: o.customer.blacklisted,
      score: customerScore(o.customer),
    },
    whatsappUrl: whatsappLink(o.customerPhone, recap),
    callUrl: `tel:${o.customerPhone}`,
    trackingUrl: trackingUrl(o.trackingToken),
  };
}
