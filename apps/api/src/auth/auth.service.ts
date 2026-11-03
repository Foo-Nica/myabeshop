import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import {
  normalizePhone,
  type AuthResponse,
  type CourierLoginInput,
  type LoginInput,
  type MeResponse,
  type OtpRequestInput,
  type OtpVerifyInput,
  type RegisterInput,
  type StoreRole,
} from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import { config } from '../common/config';
import { MessagingService } from '../notifications/messaging.service';
import type { AccessTokenPayload } from '../common/auth.guard';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly messaging: MessagingService,
  ) {}

  /** Phone numbers are stored in E.164, e-mails lower-cased. */
  normalizeTarget(target: string, country?: string): { kind: 'phone' | 'email'; value: string } {
    if (target.includes('@')) {
      const email = target.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('INVALID_EMAIL', 'Adresse e-mail invalide');
      return { kind: 'email', value: email };
    }
    const phone = normalizePhone(target, country ?? 'CI');
    if (!phone) throw new AppError('INVALID_PHONE', 'Numéro de téléphone invalide pour ce pays');
    return { kind: 'phone', value: phone.e164 };
  }

  private hashCode(target: string, code: string) {
    return createHmac('sha256', config.jwtSecret).update(`${target}:${code}`).digest('hex');
  }

  async requestOtp(input: OtpRequestInput): Promise<{ sent: true; devCode?: string }> {
    const { kind, value } = this.normalizeTarget(input.target, input.country);
    const recent = await this.prisma.otpCode.count({
      where: { target: value, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent >= OTP_MAX_PER_HOUR) {
      throw new AppError('OTP_RATE_LIMITED', 'Trop de codes demandés, réessayez plus tard', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.otpCode.create({
      data: { target: value, codeHash: this.hashCode(value, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    const channel = kind === 'email' ? 'email' : input.channel === 'whatsapp' ? 'whatsapp' : 'sms';
    await this.messaging.send({ channel, to: value, text: `Votre code Myabéshop : ${code}. Il expire dans 10 minutes.` });
    return config.otpDevEcho ? { sent: true, devCode: code } : { sent: true };
  }

  async verifyOtp(input: OtpVerifyInput, ip?: string): Promise<AuthResponse> {
    const { kind, value } = this.normalizeTarget(input.target, input.country);
    const otp = await this.prisma.otpCode.findFirst({
      where: { target: value, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw new AppError('OTP_INVALID', 'Code invalide ou expiré');
    if (otp.codeHash !== this.hashCode(value, input.code)) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new AppError('OTP_INVALID', 'Code invalide ou expiré');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const where = kind === 'email' ? { email: value } : { phone: value };
    let user = await this.prisma.user.findUnique({ where });
    if (!user) {
      user = await this.prisma.user.create({ data: { ...where, name: input.name ?? 'Marchand' } });
      await this.audit(user.id, 'user.signup', kind, ip);
    } else if (input.name && user.name === 'Marchand') {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { name: input.name } });
    }
    return this.issue(user.id);
  }

  async register(input: RegisterInput, ip?: string): Promise<AuthResponse> {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new AppError('EMAIL_TAKEN', 'Un compte existe déjà avec cet e-mail', HttpStatus.CONFLICT);
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({ data: { name: input.name, email: input.email, passwordHash } });
    await this.audit(user.id, 'user.signup', 'email', ip);
    return this.issue(user.id);
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const ok = user?.passwordHash ? await argon2.verify(user.passwordHash, input.password) : false;
    if (!user || !ok) throw new AppError('BAD_CREDENTIALS', 'E-mail ou mot de passe incorrect', HttpStatus.UNAUTHORIZED);
    return this.issue(user.id);
  }

  /**
   * Courier app sign-in with phone + PIN (§8.1). 5 wrong PINs lock the courier for 15 minutes.
   * A phone can deliver for several stores: any store whose PIN matches signs them in.
   */
  async courierLogin(input: CourierLoginInput, ip?: string): Promise<AuthResponse> {
    const phone = normalizePhone(input.phone, input.country);
    const fail = () => new AppError('BAD_CREDENTIALS', 'Numéro ou code PIN incorrect', HttpStatus.UNAUTHORIZED);
    if (!phone) throw fail();
    const couriers = await this.prisma.courier.findMany({ where: { phone: phone.e164, active: true, pinHash: { not: null }, userId: { not: null } } });
    if (couriers.length === 0) throw fail();
    const now = new Date();
    const open = couriers.filter((c) => !c.pinLockedUntil || c.pinLockedUntil < now);
    if (open.length === 0) throw new AppError('PIN_LOCKED', 'Trop d’essais. Réessayez dans 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    for (const c of open) {
      if (await argon2.verify(c.pinHash!, input.pin)) {
        await this.prisma.courier.updateMany({ where: { phone: phone.e164 }, data: { pinAttempts: 0, pinLockedUntil: null } });
        await this.audit(c.userId!, 'courier.login', c.id, ip);
        return this.issue(c.userId!);
      }
    }
    for (const c of open) {
      const attempts = c.pinAttempts + 1;
      await this.prisma.courier.update({
        where: { id: c.id },
        data: { pinAttempts: attempts, pinLockedUntil: attempts >= 5 ? new Date(now.getTime() + 15 * 60_000) : null },
      });
    }
    throw fail();
  }

  /** Short-lived session opened by a super-admin "as" a merchant, for support (always audited). */
  async impersonate(adminId: string, userId: string, _ip?: string): Promise<AuthResponse> {
    const me = await this.me(userId);
    const payload: AccessTokenPayload = { sub: me.id, name: me.name, imp: adminId };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: 30 * 60 });
    // No refresh token: the support session ends after 30 minutes.
    return { accessToken, refreshToken: '', expiresIn: 30 * 60, user: me };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new AppError('REFRESH_INVALID', 'Session expirée', HttpStatus.UNAUTHORIZED);
    }
    // Rotation: a refresh token can be used only once.
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return this.issue(stored.userId);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          include: { store: { select: { id: true, name: true, slug: true, logoUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      locale: user.locale,
      isSuperAdmin: user.isSuperAdmin,
      memberships: user.memberships.map((m) => ({ storeId: m.storeId, role: m.role as StoreRole, store: m.store })),
    };
  }

  private async issue(userId: string): Promise<AuthResponse> {
    const me = await this.me(userId);
    const payload: AccessTokenPayload = { sub: me.id, name: me.name, sa: me.isSuperAdmin || undefined };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: config.accessTokenTtlSeconds });
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
        expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000),
      },
    });
    return { accessToken, refreshToken, expiresIn: config.accessTokenTtlSeconds, user: me };
  }

  private async audit(actorId: string, action: string, target: string, ip?: string) {
    await this.prisma.auditLog.create({ data: { actorId, action, target, ip } });
  }
}
