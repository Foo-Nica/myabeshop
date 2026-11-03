import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, type Payment, type Plan, type Subscription } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import {
  GRACE_DAYS,
  MOBILE_MONEY_OPERATORS,
  OVER_LIMIT_FLAG,
  addMonths,
  formatMoney,
  normalizePhone,
  planCharge,
  type BillingOverview,
  type CheckoutInput,
  type CheckoutResponse,
  type InvoiceDto,
  type PaymentDto,
  type SubscriptionStatus,
} from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import { config } from '../common/config';
import type { AuthUser, StoreContext } from '../common/request';
import { MessagingService } from '../notifications/messaging.service';
import { PlansService, toPlanDto } from './plans.service';
import type { PaymentGateway } from './gateways/gateway';
import { SimulatorGateway } from './gateways/simulator.gateway';
import { FedaPayGateway } from './gateways/fedapay.gateway';

const DAY = 86_400_000;
const LIVE: SubscriptionStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE'];

type PaymentWithPlan = Payment & { plan: Plan };

export function toPaymentDto(p: PaymentWithPlan): PaymentDto {
  return {
    id: p.id,
    planCode: p.plan.code,
    planName: p.plan.name,
    period: p.period,
    months: p.months,
    amount: p.amount,
    currency: p.currency,
    gateway: p.gateway,
    reference: p.reference,
    status: p.status,
    checkoutUrl: p.status === 'PENDING' ? p.checkoutUrl : null,
    invoiceNumber: p.invoiceNumber != null ? formatInvoiceNumber(p.invoiceNumber, p.paidAt ?? p.createdAt) : null,
    paidAt: p.paidAt?.toISOString() ?? null,
    failureReason: p.failureReason,
    createdAt: p.createdAt.toISOString(),
  };
}

export function formatInvoiceNumber(n: number, date: Date) {
  return `MYA-${date.getFullYear()}-${String(n).padStart(5, '0')}`;
}

export function createGateway(name = config.paymentGateway): PaymentGateway {
  if (name === 'fedapay') return new FedaPayGateway(config.fedapay);
  if (process.env.NODE_ENV === 'production') throw new Error(`Passerelle de paiement inconnue en production : ${name}`);
  return new SimulatorGateway();
}

/**
 * Subscriptions paid by Mobile Money (§9.1, phase « Paiements OK »): checkout, activation,
 * renewal, 7-day grace period, automatic fall-back to the free plan, invoices, referrals.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');
  readonly gateway: PaymentGateway = createGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly messaging: MessagingService,
  ) {}

  // ------------------------------------------------------------------ reading

  private async liveSubscription(storeId: string, now = new Date()) {
    return this.prisma.subscription.findFirst({
      where: { storeId, status: { in: LIVE }, startsAt: { lte: now } },
      include: { plan: true },
      orderBy: [{ endsAt: 'desc' }],
    });
  }

  async ensureReferralCode(storeId: string): Promise<string> {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { referralCode: true, slug: true } });
    if (store.referralCode) return store.referralCode;
    for (let i = 0; i < 5; i++) {
      const code = `${store.slug.replace(/-/g, '').slice(0, 6).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
      try {
        await this.prisma.store.update({ where: { id: storeId }, data: { referralCode: code } });
        return code;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new Error('Could not allocate a referral code');
  }

  async overview(ctx: StoreContext): Promise<BillingOverview> {
    const now = new Date();
    const [plan, sub, usage, plans, payments, referralCode, referred, rewarded, lockedOrders] = await Promise.all([
      this.plans.planOf(ctx.storeId),
      this.liveSubscription(ctx.storeId, now),
      this.plans.usage(ctx.storeId),
      this.plans.listActive(),
      this.prisma.payment.findMany({ where: { storeId: ctx.storeId }, include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 24 }),
      this.ensureReferralCode(ctx.storeId),
      this.prisma.store.count({ where: { referredById: ctx.storeId } }),
      this.prisma.subscription.count({ where: { storeId: ctx.storeId, source: 'referral' } }),
      this.prisma.order.count({ where: { storeId: ctx.storeId, flags: { has: OVER_LIMIT_FLAG } } }),
    ]);
    return {
      plan,
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            planCode: sub.plan.code,
            startsAt: sub.startsAt.toISOString(),
            endsAt: sub.endsAt.toISOString(),
            source: sub.source,
            graceEndsAt: sub.status === 'PAST_DUE' ? new Date(sub.endsAt.getTime() + GRACE_DAYS * DAY).toISOString() : null,
          }
        : null,
      daysLeft: sub ? Math.ceil((sub.endsAt.getTime() - now.getTime()) / DAY) : null,
      usage,
      plans,
      payments: payments.map(toPaymentDto),
      gateway: this.gateway.name,
      operators: MOBILE_MONEY_OPERATORS[ctx.country] ?? [],
      referral: { code: referralCode, url: `${config.webUrl}/login?signup=1&ref=${referralCode}`, referred, rewarded },
      lockedOrders,
    };
  }

  // ------------------------------------------------------------------ checkout

  async checkout(ctx: StoreContext, user: AuthUser, input: CheckoutInput): Promise<CheckoutResponse> {
    const plan = await this.prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan || !plan.active || plan.price <= 0) throw new AppError('PLAN_NOT_FOUND', 'Plan indisponible', HttpStatus.NOT_FOUND);
    const phone = normalizePhone(input.phone, ctx.country);
    if (!phone) throw new AppError('INVALID_PHONE', 'Numéro Mobile Money invalide pour ce pays');
    const { amount, months } = planCharge(plan.price, input.period);
    const reference = `PAY-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const owner = await this.prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } });

    const payment = await this.prisma.payment.create({
      data: {
        storeId: ctx.storeId,
        planId: plan.id,
        period: input.period,
        months,
        amount,
        currency: plan.currency,
        gateway: this.gateway.name,
        reference,
        payerPhone: phone.e164,
        createdById: user.id,
      },
      include: { plan: true },
    });
    try {
      const session = await this.gateway.createCheckout({
        reference,
        amount,
        currency: plan.currency,
        description: `Myabéshop ${plan.name} — ${months === 12 ? '12 mois' : '1 mois'} — ${ctx.name}`,
        customer: { name: owner?.name ?? ctx.name, phone: phone.e164, country: ctx.country, email: owner?.email },
        operator: input.operator,
        returnUrl: `${config.webUrl}/dashboard/billing?payment=${payment.id}`,
        callbackUrl: `${config.apiUrl}/billing/webhooks/${this.gateway.name}`,
      });
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { gatewayRef: session.gatewayRef, checkoutUrl: session.checkoutUrl },
        include: { plan: true },
      });
      await this.prisma.auditLog.create({
        data: { storeId: ctx.storeId, actorId: user.id, action: 'billing.checkout', target: payment.id, meta: { plan: plan.code, period: input.period, amount } },
      });
      return { payment: toPaymentDto(updated), checkoutUrl: session.checkoutUrl };
    } catch (e) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: (e as Error).message.slice(0, 200) } });
      this.logger.error(`Checkout failed: ${(e as Error).message}`);
      throw new AppError('GATEWAY_ERROR', 'Le paiement n’a pas pu être lancé, réessayez dans un instant', HttpStatus.BAD_GATEWAY);
    }
  }

  /** Re-reads the status from the gateway (return page, "J'ai payé" button). */
  async refresh(ctx: StoreContext, paymentId: string): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, storeId: ctx.storeId } });
    if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 'Paiement introuvable', HttpStatus.NOT_FOUND);
    await this.syncFromGateway(payment);
    return toPaymentDto(await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { plan: true } }));
  }

  private async syncFromGateway(payment: Payment) {
    if (payment.status !== 'PENDING' || !payment.gatewayRef) return;
    const { status, reason } = await this.gateway.fetchStatus(payment.gatewayRef);
    if (status === 'SUCCEEDED') await this.markPaid(payment.id);
    if (status === 'FAILED') {
      await this.prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED', failureReason: reason ?? 'refusé' } });
    }
  }

  /** Gateway webhook: the signature is checked, then the status is fetched from the gateway. */
  async handleWebhook(gatewayName: string, rawBody: string, headers: Record<string, string | string[] | undefined>) {
    if (gatewayName !== this.gateway.name) throw new AppError('NOT_FOUND', 'Inconnu', HttpStatus.NOT_FOUND);
    const gatewayRef = this.gateway.parseWebhook(rawBody, headers);
    if (!gatewayRef) throw new AppError('BAD_SIGNATURE', 'Signature invalide', HttpStatus.UNAUTHORIZED);
    const payment = await this.prisma.payment.findFirst({ where: { gatewayRef, gateway: gatewayName } });
    if (payment) await this.syncFromGateway(payment);
    return { received: true };
  }

  /** Local simulator only: approve or decline a pending payment. */
  async simulate(reference: string, outcome: 'SUCCEEDED' | 'FAILED') {
    if (!(this.gateway instanceof SimulatorGateway)) throw new AppError('NOT_FOUND', 'Inconnu', HttpStatus.NOT_FOUND);
    const payment = await this.prisma.payment.findUnique({ where: { reference }, include: { plan: true, store: { select: { name: true } } } });
    if (!payment?.gatewayRef) throw new AppError('PAYMENT_NOT_FOUND', 'Paiement introuvable', HttpStatus.NOT_FOUND);
    this.gateway.settle(payment.gatewayRef, outcome);
    await this.syncFromGateway(payment);
    return { status: (await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, returnUrl: `${config.webUrl}/dashboard/billing?payment=${payment.id}` };
  }

  async simulatorInfo(reference: string) {
    if (!(this.gateway instanceof SimulatorGateway)) throw new AppError('NOT_FOUND', 'Inconnu', HttpStatus.NOT_FOUND);
    const p = await this.prisma.payment.findUnique({ where: { reference }, include: { plan: true, store: { select: { name: true } } } });
    if (!p) throw new AppError('PAYMENT_NOT_FOUND', 'Paiement introuvable', HttpStatus.NOT_FOUND);
    return { reference: p.reference, amount: p.amount, currency: p.currency, planName: p.plan.name, months: p.months, storeName: p.store.name, payerPhone: p.payerPhone, status: p.status };
  }

  // ------------------------------------------------------------------ activation

  /** Idempotent: a payment is activated once, whatever the number of webhooks or refreshes. */
  async markPaid(paymentId: string) {
    const now = new Date();
    const activated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.payment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'SUCCEEDED', paidAt: now } });
      if (res.count === 0) return null;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { plan: true } });
      const counter = await tx.counter.upsert({ where: { key: 'invoice' }, create: { key: 'invoice', value: 1 }, update: { value: { increment: 1 } } });

      // Renewal of the same paid plan continues from the current end date; anything else starts now.
      const current = await tx.subscription.findFirst({
        where: { storeId: payment.storeId, status: { in: ['ACTIVE', 'PAST_DUE'] }, source: { in: ['payment', 'admin', 'referral'] } },
        orderBy: { endsAt: 'desc' },
      });
      const continues = current && current.planId === payment.planId && current.endsAt > now;
      const startsAt = continues ? current.endsAt : now;
      const sub = await tx.subscription.create({
        data: { storeId: payment.storeId, planId: payment.planId, status: 'ACTIVE', startsAt, endsAt: addMonths(startsAt, payment.months), source: 'payment' },
      });
      // Switching plan (or leaving the trial) replaces what was running.
      await tx.subscription.updateMany({
        where: { storeId: payment.storeId, id: { not: sub.id }, status: { in: LIVE }, ...(continues ? { planId: { not: payment.planId } } : {}) },
        data: { status: 'CANCELLED' },
      });
      await tx.payment.update({ where: { id: payment.id }, data: { subscriptionId: sub.id, invoiceNumber: counter.value } });
      await tx.auditLog.create({ data: { storeId: payment.storeId, action: 'billing.paid', target: payment.id, meta: { plan: payment.plan.code, amount: payment.amount } } });
      return payment;
    });
    if (!activated) return;
    await this.syncStorePlan(activated.storeId, now);
    await this.rewardReferrer(activated.storeId);
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: activated.storeId } });
    if (activated.payerPhone) {
      await this.messaging.send({
        channel: 'sms',
        to: activated.payerPhone,
        text: `Myabéshop : paiement de ${formatMoney(activated.amount, activated.currency)} reçu. ${store.name} est maintenant sur le plan ${activated.plan.name}. Merci !`,
      });
    }
  }

  /**
   * Recomputes `stores.plan_id` from subscriptions: the best plan currently covered
   * (trial or paid), else the plan in its grace period, else Free. Also unlocks orders
   * that were held back by the previous plan's quota.
   */
  async syncStorePlan(storeId: string, now = new Date()) {
    const subs = await this.prisma.subscription.findMany({ where: { storeId, status: { in: LIVE } }, include: { plan: true } });
    const covering = subs.filter((s) => s.startsAt <= now && s.endsAt > now && s.status !== 'PAST_DUE');
    const grace = subs.filter((s) => s.status === 'PAST_DUE' && s.endsAt.getTime() + GRACE_DAYS * DAY > now.getTime());
    const pick = (list: typeof subs) => list.sort((a, b) => b.plan.price - a.plan.price)[0]?.plan;
    const plan = pick(covering) ?? pick(grace) ?? (await this.prisma.plan.findUnique({ where: { code: 'free' } }));
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { planId: true } });
    if (plan && store.planId !== plan.id) {
      await this.prisma.store.update({ where: { id: storeId }, data: { planId: plan.id } });
      await this.prisma.auditLog.create({ data: { storeId, action: 'billing.plan_changed', target: plan.code } });
    }
    if (plan && !(await this.plans.ordersQuotaReached(storeId))) {
      // Orders flagged over quota become workable again once the plan allows them.
      const locked = await this.prisma.order.findMany({ where: { storeId, flags: { has: OVER_LIMIT_FLAG } }, select: { id: true, flags: true } });
      for (const o of locked) {
        await this.prisma.order.update({ where: { id: o.id }, data: { flags: o.flags.filter((f) => f !== OVER_LIMIT_FLAG) } });
      }
    }
    return plan;
  }

  /** "Un mois offert par filleul abonné" (§9.3): once per referred store, on its first payment. */
  private async rewardReferrer(storeId: string) {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { referredById: true, name: true } });
    if (!store.referredById) return;
    const paidCount = await this.prisma.payment.count({ where: { storeId, status: 'SUCCEEDED' } });
    if (paidCount !== 1) return;
    const already = await this.prisma.auditLog.findFirst({ where: { storeId: store.referredById, action: 'referral.reward', target: storeId } });
    if (already) return;
    const now = new Date();
    const live = await this.prisma.subscription.findFirst({ where: { storeId: store.referredById, status: { in: LIVE } }, include: { plan: true }, orderBy: { endsAt: 'desc' } });
    const paidPlan = live && live.source !== 'trial' ? live.plan : await this.prisma.plan.findUnique({ where: { code: 'starter' } });
    if (!paidPlan) return;
    const startsAt = live && live.endsAt > now && live.status !== 'PAST_DUE' ? live.endsAt : now;
    await this.prisma.subscription.create({
      data: { storeId: store.referredById, planId: paidPlan.id, status: 'ACTIVE', startsAt, endsAt: addMonths(startsAt, 1), source: 'referral' },
    });
    await this.prisma.auditLog.create({ data: { storeId: store.referredById, action: 'referral.reward', target: storeId, meta: { referred: store.name } } });
    await this.syncStorePlan(store.referredById, now);
  }

  /** Manual grant from the back-office (support, partners). */
  async grant(storeId: string, planCode: string, days: number, actorId: string, note?: string) {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new AppError('PLAN_NOT_FOUND', 'Plan inconnu', HttpStatus.NOT_FOUND);
    const now = new Date();
    await this.prisma.subscription.updateMany({ where: { storeId, status: { in: LIVE } }, data: { status: 'CANCELLED' } });
    if (plan.code !== 'free') {
      await this.prisma.subscription.create({ data: { storeId, planId: plan.id, status: 'ACTIVE', startsAt: now, endsAt: new Date(now.getTime() + days * DAY), source: 'admin' } });
    }
    await this.prisma.auditLog.create({ data: { storeId, actorId, action: 'admin.grant_plan', target: storeId, meta: { plan: plan.code, days, note } } });
    return this.syncStorePlan(storeId, now);
  }

  // ------------------------------------------------------------------ lifecycle

  /**
   * Runs hourly: ended periods go into grace (PAST_DUE), grace over → EXPIRED and back to
   * Free. Superseded subscriptions expire directly. No data is ever deleted.
   */
  async runLifecycle(now = new Date()) {
    const ended = await this.prisma.subscription.findMany({
      where: { status: { in: ['TRIALING', 'ACTIVE'] }, endsAt: { lte: now } },
      include: { store: { select: { id: true, name: true, members: { where: { role: 'OWNER' }, include: { user: true } } } }, plan: true },
    });
    const touched = new Set<string>();
    for (const sub of ended) {
      const next = await this.prisma.subscription.findFirst({
        where: { storeId: sub.storeId, id: { not: sub.id }, status: { in: ['TRIALING', 'ACTIVE'] }, startsAt: { lte: now }, endsAt: { gt: now } },
      });
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: next ? 'EXPIRED' : 'PAST_DUE' } });
      touched.add(sub.storeId);
      const owner = sub.store.members[0]?.user;
      if (!next && owner?.phone) {
        await this.messaging.send({
          channel: 'sms',
          to: owner.phone,
          text: `Myabéshop : ${sub.source === 'trial' ? 'votre essai' : 'votre abonnement'} ${sub.plan.name} de ${sub.store.name} est terminé. Vous gardez vos fonctionnalités ${GRACE_DAYS} jours : renouvelez depuis Tableau de bord › Abonnement.`,
        });
      }
    }
    const graceOver = await this.prisma.subscription.findMany({
      where: { status: 'PAST_DUE', endsAt: { lte: new Date(now.getTime() - GRACE_DAYS * DAY) } },
      select: { id: true, storeId: true },
    });
    for (const sub of graceOver) {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
      touched.add(sub.storeId);
    }
    // Future subscriptions (renewals, referral months) that just started.
    const starting = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', startsAt: { lte: now, gt: new Date(now.getTime() - 2 * DAY) } },
      select: { storeId: true },
    });
    starting.forEach((s) => touched.add(s.storeId));
    for (const storeId of touched) await this.syncStorePlan(storeId, now);
    return { ended: ended.length, expired: graceOver.length, stores: touched.size };
  }

  // ------------------------------------------------------------------ invoices

  async invoice(ctx: StoreContext, paymentId: string): Promise<InvoiceDto> {
    const p = await this.prisma.payment.findFirst({
      where: { id: paymentId, storeId: ctx.storeId, status: 'SUCCEEDED' },
      include: { plan: true, subscription: true, store: { include: { members: { where: { role: 'OWNER' }, include: { user: true } } } } },
    });
    if (!p || p.invoiceNumber == null) throw new AppError('INVOICE_NOT_FOUND', 'Facture introuvable', HttpStatus.NOT_FOUND);
    const owner = p.store.members[0]?.user;
    return {
      number: formatInvoiceNumber(p.invoiceNumber, p.paidAt ?? p.createdAt),
      issuedAt: (p.paidAt ?? p.createdAt).toISOString(),
      payment: toPaymentDto(p),
      seller: config.seller,
      buyer: { storeName: p.store.name, ownerName: owner?.name ?? '', phone: owner?.phone ?? p.payerPhone, email: owner?.email ?? null, country: p.store.country },
      periodStart: (p.subscription as Subscription | null)?.startsAt.toISOString() ?? null,
      periodEnd: (p.subscription as Subscription | null)?.endsAt.toISOString() ?? null,
    };
  }

  async publicPlans() {
    return (await this.prisma.plan.findMany({ where: { active: true }, orderBy: { price: 'asc' } })).map(toPlanDto);
  }
}
