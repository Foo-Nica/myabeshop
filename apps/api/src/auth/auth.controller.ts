import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  registerSchema,
  type LoginInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  type RegisterInput,
} from '@myabeshop/shared';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from '../common/decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import type { AuthUser } from '../common/request';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(200)
  @ApiZodBody(otpRequestSchema)
  requestOtp(@Body(new ZodPipe(otpRequestSchema)) body: OtpRequestInput) {
    return this.auth.requestOtp(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  @HttpCode(200)
  @ApiZodBody(otpVerifySchema)
  verifyOtp(@Body(new ZodPipe(otpVerifySchema)) body: OtpVerifyInput, @Ip() ip: string) {
    return this.auth.verifyOtp(body, ip);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiZodBody(registerSchema)
  register(@Body(new ZodPipe(registerSchema)) body: RegisterInput, @Ip() ip: string) {
    return this.auth.register(body, ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  login(@Body(new ZodPipe(loginSchema)) body: LoginInput) {
    return this.auth.login(body);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiZodBody(refreshSchema)
  refresh(@Body(new ZodPipe(refreshSchema)) body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(refreshSchema)) body: { refreshToken: string }) {
    await this.auth.logout(body.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
