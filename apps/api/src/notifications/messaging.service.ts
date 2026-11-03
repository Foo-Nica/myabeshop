import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueService } from '../jobs/queue.service';

export type MessageChannel = 'sms' | 'whatsapp' | 'email';

export interface OutgoingMessage {
  channel: MessageChannel;
  to: string;
  text: string;
  subject?: string;
}

/**
 * Outbound SMS / WhatsApp / e-mail, sent through the job queue. The provider is still an
 * open question in the spec, so delivery is logged; a real provider plugs in `deliver()`.
 */
@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger('Messaging');
  /** Last messages sent, kept in memory for tests and local debugging. */
  readonly outbox: OutgoingMessage[] = [];

  constructor(private readonly queue: QueueService) {}

  onModuleInit() {
    this.queue.register('message.send', (data) => this.deliver(data as OutgoingMessage));
  }

  async send(message: OutgoingMessage): Promise<void> {
    this.outbox.push(message);
    if (this.outbox.length > 200) this.outbox.shift();
    await this.queue.add('message.send', message);
  }

  private async deliver(message: OutgoingMessage): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      this.logger.log(`[${message.channel}] → ${message.to}: ${message.text.replace(/\n/g, ' | ')}`);
    }
  }
}
