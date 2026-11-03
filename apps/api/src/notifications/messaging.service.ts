import { Injectable, Logger } from '@nestjs/common';

export type MessageChannel = 'sms' | 'whatsapp' | 'email';

export interface OutgoingMessage {
  channel: MessageChannel;
  to: string;
  text: string;
  subject?: string;
}

/**
 * Outbound SMS / WhatsApp / e-mail. The provider is still an open question in the spec,
 * so this logs messages; a real provider plugs in here (and moves to a BullMQ queue).
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger('Messaging');
  /** Last messages sent, kept in memory for tests and local debugging. */
  readonly outbox: OutgoingMessage[] = [];

  async send(message: OutgoingMessage): Promise<void> {
    this.outbox.push(message);
    if (this.outbox.length > 200) this.outbox.shift();
    if (process.env.NODE_ENV !== 'test') {
      this.logger.log(`[${message.channel}] → ${message.to}: ${message.text.replace(/\n/g, ' | ')}`);
    }
  }
}
