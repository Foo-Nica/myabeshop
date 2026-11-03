import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC } from './decorators';
import type { AppRequest } from './request';

export interface AccessTokenPayload {
  sub: string;
  name: string;
  sa?: boolean;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
        req.user = { id: payload.sub, name: payload.name, isSuperAdmin: !!payload.sa };
      } catch {
        if (!isPublic) throw new UnauthorizedException({ code: 'TOKEN_INVALID', message: 'Session expirée' });
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Connexion requise' });
    return true;
  }
}
