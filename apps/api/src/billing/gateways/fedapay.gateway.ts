import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CheckoutRequest, CheckoutSession, GatewayStatus, PaymentGateway } from './gateway';

interface FedaPayConfig {
  secretKey: string;
  webhookSecret: string;
  env: 'sandbox' | 'live';
}

/**
 * FedaPay (Bénin, Côte d'Ivoire, Togo, Sénégal, Niger, Burkina, Mali, Guinée…): MTN, Moov,
 * Orange, Wave, cards. Docs: https://docs.fedapay.com — transaction, then hosted payment page.
 */
export class FedaPayGateway implements PaymentGateway {
  readonly name = 'fedapay';
  constructor(
    private readonly cfg: FedaPayConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  private get base() {
    return this.cfg.env === 'live' ? 'https://api.fedapay.com/v1' : 'https://sandbox-api.fedapay.com/v1';
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.cfg.secretKey) throw new Error('FEDAPAY_SECRET_KEY manquant');
    const res = await this.http(`${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.cfg.secretKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) throw new Error(`FedaPay ${res.status}: ${json.message ?? 'erreur'}`);
    return json;
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const [firstname, ...rest] = req.customer.name.split(' ');
    const created = await this.call<{ 'v1/transaction': { id: number } }>('POST', '/transactions', {
      description: req.description,
      amount: req.amount,
      currency: { iso: req.currency },
      callback_url: req.returnUrl,
      merchant_reference: req.reference,
      custom_metadata: { reference: req.reference },
      customer: {
        firstname: firstname || 'Marchand',
        lastname: rest.join(' ') || 'Myabéshop',
        email: req.customer.email ?? undefined,
        phone_number: { number: req.customer.phone.replace(/^\+\d{3}/, ''), country: req.customer.country.toLowerCase() },
      },
    });
    const id = created['v1/transaction'].id;
    const token = await this.call<{ token: string; url: string }>('POST', `/transactions/${id}/token`);
    return { gatewayRef: String(id), checkoutUrl: token.url };
  }

  async fetchStatus(gatewayRef: string): Promise<{ status: GatewayStatus; reason?: string }> {
    const res = await this.call<{ 'v1/transaction': { status: string; last_error_code?: string } }>('GET', `/transactions/${gatewayRef}`);
    const t = res['v1/transaction'];
    if (t.status === 'approved' || t.status === 'transferred') return { status: 'SUCCEEDED' };
    if (['declined', 'canceled', 'refunded', 'expired'].includes(t.status)) return { status: 'FAILED', reason: t.last_error_code ?? t.status };
    return { status: 'PENDING' };
  }

  /** Header `X-FEDAPAY-SIGNATURE: t=<timestamp>,s=<hmac-sha256(t.payload)>`. */
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): string | null {
    const header = headers['x-fedapay-signature'];
    const sig = Array.isArray(header) ? header[0] : header;
    if (!sig || !this.cfg.webhookSecret) return null;
    const parts = Object.fromEntries(sig.split(',').map((kv) => kv.split('=') as [string, string]));
    if (!parts.t || !parts.s) return null;
    if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return null;
    const expected = createHmac('sha256', this.cfg.webhookSecret).update(`${parts.t}.${rawBody}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(parts.s);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const event = JSON.parse(rawBody) as { entity?: { id?: number } };
      return event.entity?.id != null ? String(event.entity.id) : null;
    } catch {
      return null;
    }
  }
}
