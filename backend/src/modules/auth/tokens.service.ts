import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/app-exception.js';
import type { Env } from '../../config/env.js';
import type { User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { AccessTokenPayload } from '../rbac/jwt-auth.guard.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
/** A just-rotated token presented again within this window is treated as a parallel request, not a replay. */
const REUSE_GRACE_MS = 10_000;
const invalidRefresh = () =>
  new AppException(401, 'INVALID_REFRESH_TOKEN', 'Your session has expired. Sign in again.');

@Injectable()
export class TokensService {
  private readonly refreshTtlMs: number;

  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.refreshTtlMs = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 24 * 60 * 60 * 1000;
  }

  /** Issues a new access + refresh token pair for a user. */
  async issue(user: Pick<User, 'id' | 'role'>): Promise<TokenPair> {
    return this.build(user, await this.createRefreshToken(user.id));
  }

  /**
   * Rotates a refresh token: the presented token is revoked and a new pair is issued.
   * Presenting an already-revoked token long after rotation means it leaked or was replayed,
   * so every session of that user is revoked. Within REUSE_GRACE_MS it is just rejected, since
   * parallel requests from one browser can legitimately present the same token.
   */
  async rotate(presented: string): Promise<{ user: User; tokens: TokenPair }> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(presented) },
      include: { user: true },
    });
    if (!row) throw invalidRefresh();

    if (row.revokedAt) {
      if (Date.now() - row.revokedAt.getTime() > REUSE_GRACE_MS) await this.revokeAll(row.userId);
      throw invalidRefresh();
    }
    if (row.expiresAt <= new Date() || row.user.status !== 'ACTIVE') throw invalidRefresh();

    // Atomic claim: only one concurrent request can revoke this token. The loser is a parallel
    // request, not a replay, so it is rejected without revoking the winner's new session.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) throw invalidRefresh();
    return { user: row.user, tokens: await this.issue(row.user) };
  }

  async revoke(presented: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revokeAll(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + this.refreshTtlMs) },
    });
    return raw;
  }

  private async build(user: Pick<User, 'id' | 'role'>, refreshToken: string): Promise<TokenPair> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);
    const decoded = this.jwt.decode<{ exp: number; iat: number }>(accessToken);
    return { accessToken, refreshToken, expiresIn: decoded.exp - decoded.iat };
  }
}
