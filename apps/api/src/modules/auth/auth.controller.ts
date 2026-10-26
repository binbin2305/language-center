import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { ALL_ROLES, ChangePasswordInput, LoginInput } from '@lc/shared';
import { AllowPasswordChangeRequired } from '../../common/auth/allow-password-change.decorator';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { loadEnv } from '../../config/env';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService, AuthSession } from './auth.service';
import { TokenService } from './token.service';

export const REFRESH_COOKIE = 'lc_rt';
const secureCookies = loadEnv().NODE_ENV === 'production';

const baseCookie = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  path: '/api/v1/auth',
  secure: secureCookies,
});

@Controller('auth')
@AllowPasswordChangeRequired()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(LoginInput)) body: LoginInput, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.login(body));
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return this.respond(res, await this.auth.refresh(this.cookieOf(req)));
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, baseCookie());
      throw e;
    }
  }

  @Post('logout')
  @Roles(...ALL_ROLES)
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(user.id, this.cookieOf(req));
    res.clearCookie(REFRESH_COOKIE, baseCookie());
  }

  @Get('me')
  @Roles(...ALL_ROLES)
  async me(@CurrentUser() user: AuthUser) {
    return { data: await this.auth.me(user.id) };
  }

  @Post('change-password')
  @Roles(...ALL_ROLES)
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ChangePasswordInput)) body: ChangePasswordInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.changePassword(user.id, body));
  }

  private cookieOf(req: Request): string | undefined {
    const v = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  }

  private respond(res: Response, s: AuthSession) {
    res.cookie(REFRESH_COOKIE, s.refreshToken, { ...baseCookie(), maxAge: this.tokens.refreshTtlMs });
    return { data: s.result };
  }
}
