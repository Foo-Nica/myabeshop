function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  get port() {
    return Number(process.env.PORT ?? 4000);
  },
  get jwtSecret() {
    const s = required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-change-me-dev-secret-change-me');
    if (process.env.NODE_ENV === 'production' && s.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
    return s;
  },
  get webUrl() {
    return (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  },
  get apiUrl() {
    return (process.env.API_URL ?? `http://localhost:${this.port}`).replace(/\/$/, '');
  },
  get rootDomain() {
    return process.env.ROOT_DOMAIN ?? 'localhost:3000';
  },
  get corsOrigins() {
    return (process.env.CORS_ORIGINS ?? this.webUrl).split(',').map((s) => s.trim());
  },
  get otpDevEcho() {
    return process.env.NODE_ENV !== 'production' && process.env.OTP_DEV_ECHO === 'true';
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR ?? 'uploads';
  },
  /** "simulator" (default outside production), "fedapay" or "cinetpay"-ready slot. */
  get paymentGateway() {
    return process.env.PAYMENT_GATEWAY ?? (process.env.NODE_ENV === 'production' ? 'fedapay' : 'simulator');
  },
  get fedapay() {
    return {
      secretKey: process.env.FEDAPAY_SECRET_KEY ?? '',
      webhookSecret: process.env.FEDAPAY_WEBHOOK_SECRET ?? '',
      env: (process.env.FEDAPAY_ENV ?? 'sandbox') as 'sandbox' | 'live',
    };
  },
  get redisUrl() {
    return process.env.REDIS_URL || null;
  },
  /** Background jobs (lifecycle of subscriptions) — off in tests, which call them explicitly. */
  get schedulerEnabled() {
    return process.env.NODE_ENV !== 'test' && process.env.SCHEDULER !== 'off';
  },
  get seller() {
    return {
      name: process.env.BILLING_SELLER_NAME ?? 'Nicanor KSH Solutions (NKS) — Myabéshop',
      address: process.env.BILLING_SELLER_ADDRESS ?? 'Calavi-Zogbadjè, Cotonou, Bénin',
      email: process.env.BILLING_SELLER_EMAIL ?? 'facturation@myabeshop.com',
    };
  },
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlDays: 30,
};

/** Public storefront URL of a store: subdomain in production, /s/<slug> path in local dev. */
export function storeUrl(slug: string): string {
  const root = config.rootDomain;
  if (root.startsWith('localhost') || process.env.STORE_URL_MODE === 'path') return `${config.webUrl}/s/${slug}`;
  return `https://${slug}.${root}`;
}

export function productShortUrl(code: string): string {
  return `${config.webUrl}/p/${code}`;
}

export function trackingUrl(token: string): string {
  return `${config.webUrl}/t/${token}`;
}
