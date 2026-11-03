/** A Mobile Money / card payment provider (FedaPay, CinetPay, PayDunya…). */
export interface CheckoutRequest {
  reference: string;
  amount: number;
  currency: string;
  description: string;
  customer: { name: string; phone: string; country: string; email?: string | null };
  operator?: string;
  returnUrl: string;
  callbackUrl: string;
}

export interface CheckoutSession {
  gatewayRef: string;
  checkoutUrl: string;
}

export type GatewayStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export interface PaymentGateway {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Asks the provider for the real status: webhooks are only a hint, never trusted alone. */
  fetchStatus(gatewayRef: string): Promise<{ status: GatewayStatus; reason?: string }>;
  /** Checks a webhook signature; returns the gateway reference it is about, or null. */
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): string | null;
}
