import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { roleHas, type StoreRole } from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import type { AccessTokenPayload } from '../common/auth.guard';
import { config } from '../common/config';

/**
 * Pushes new orders to the merchant's open dashboards in real time.
 * Clients authenticate with their access token, then join the room of a store they belong to.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    // The cors package expects (origin, callback); read the allowed origins at request time.
    origin: (_origin: string | undefined, cb: (err: Error | null, allow?: string[]) => void) => cb(null, config.corsOrigins),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger('Realtime');
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string | undefined) ?? undefined;
    try {
      if (!token) throw new Error('no token');
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      client.data.userId = payload.sub;
    } catch {
      client.emit('error', { code: 'UNAUTHENTICATED' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { storeId?: string }) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !body?.storeId) return { ok: false };
    const m = await this.prisma.storeMember.findUnique({ where: { storeId_userId: { storeId: body.storeId, userId } } });
    if (!m) return { ok: false };
    const role = m.role as StoreRole;
    if (roleHas(role, 'orders.read.all')) await client.join(`store:${body.storeId}`);
    if (roleHas(role, 'orders.read.assigned')) await client.join(`store:${body.storeId}:agent:${userId}`);
    if (role === 'COURIER') await client.join(`store:${body.storeId}:courier-user:${userId}`);
    return { ok: true };
  }

  emitOrderCreated(storeId: string, order: unknown, agentUserId?: string | null) {
    this.server?.to(`store:${storeId}`).emit('order.created', order);
    if (agentUserId) this.server?.to(`store:${storeId}:agent:${agentUserId}`).emit('order.created', order);
  }

  emitOrderUpdated(storeId: string, order: unknown) {
    this.server?.to(`store:${storeId}`).emit('order.updated', order);
  }

  emitToCourierUser(storeId: string, userId: string, event: string, payload: unknown) {
    this.server?.to(`store:${storeId}:courier-user:${userId}`).emit(event, payload);
  }
}
