import { config } from '../../common/config';
import type { CheckoutRequest, CheckoutSession, GatewayStatus, PaymentGateway } from './gateway';

/**
 * Local stand-in for a Mobile Money gateway: the checkout URL opens a page of the web app
 * where you approve or decline the payment. Disabled in production.
 */
export class SimulatorGateway implements PaymentGateway {
  readonly name = 'simulator';
  private readonly outcomes = new Map<string, GatewayStatus>();

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const gatewayRef = `sim_${req.reference}`;
    this.outcomes.set(gatewayRef, 'PENDING');
    return { gatewayRef, checkoutUrl: `${config.webUrl}/paiement/simulateur?ref=${encodeURIComponent(req.reference)}` };
  }

  /** Called by the simulator page ("Payer" / "Refuser"). */
  settle(gatewayRef: string, outcome: 'SUCCEEDED' | 'FAILED') {
    this.outcomes.set(gatewayRef, outcome);
  }

  async fetchStatus(gatewayRef: string) {
    return { status: this.outcomes.get(gatewayRef) ?? 'PENDING' } as { status: GatewayStatus };
  }

  parseWebhook(): string | null {
    return null;
  }
}
