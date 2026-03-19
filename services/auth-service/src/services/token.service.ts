// ─────────────────────────────────────────────────────────
// src/services/token.service.ts
// Gestione JWT access token + refresh token opaco
// ─────────────────────────────────────────────────────────

import { createHash, randomBytes } from 'crypto'
import type { FastifyInstance }    from 'fastify'
import { redis, RedisKeys }        from '../db/redis.js'
import { prisma }                  from '../db/prisma.js'
import { env }                     from '../config/env.js'

export interface AccessTokenPayload {
  sub:  string   // userId
  role: string
  jti:  string   // JWT ID univoco per revoca
}

export interface TokenPair {
  accessToken:  string
  refreshToken: string // opaco — non JWT
  expiresIn:    number // secondi
}

export class TokenService {
  constructor(private readonly fastify: FastifyInstance) {}

  // ── Genera coppia access + refresh ───────────────────

  async generateTokenPair(
    userId: string,
    role:   string,
    meta?: { deviceId?: string; userAgent?: string; ipAddress?: string }
  ): Promise<TokenPair> {
    const jti = crypto.randomUUID()

    // 1. Access Token (JWT, 15 minuti)
    const accessToken = await this.fastify.jwt.sign({
      sub:  userId,
      role: role,
      jti:  jti,
    })

    // 2. Refresh Token (256-bit opaco, TTL 7 giorni)
    const rawRefreshToken = randomBytes(32).toString('hex')
    const tokenHash       = this._hash(rawRefreshToken)
    const ttlSeconds      = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60
    const expiresAt       = new Date(Date.now() + ttlSeconds * 1000)

    // 3. Salva in Redis (lookup veloce) e Postgres (audit/revoca)
    await Promise.all([
      redis.setex(
        RedisKeys.refreshToken(userId, jti),
        ttlSeconds,
        JSON.stringify({ tokenHash, userId, role })
      ),
      prisma.refreshToken.create({
        data: {
          userId,
          tokenHash,
          deviceId:  meta?.deviceId,
          userAgent: meta?.userAgent,
          ipAddress: meta?.ipAddress,
          expiresAt,
        },
      }),
    ])

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn:    900, // 15 min
    }
  }

  // ── Refresh: verifica e ruota il token ────────────────

  async rotateRefreshToken(
    rawRefreshToken: string,
    meta?: { deviceId?: string; userAgent?: string; ipAddress?: string }
  ): Promise<TokenPair> {
    const tokenHash = this._hash(rawRefreshToken)

    // Cerca in Postgres per validità
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, role: true, isActive: true } } },
    })

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new Error('INVALID_REFRESH_TOKEN')
    }

    if (!stored.user.isActive) {
      throw new Error('USER_INACTIVE')
    }

    // Revoca il token usato (rotazione)
    await prisma.refreshToken.update({
      where: { tokenHash },
      data:  { revokedAt: new Date() },
    })

    // Emetti nuova coppia
    return this.generateTokenPair(stored.user.id, stored.user.role, meta)
  }

  // ── Revoca singolo o tutti i token dell'utente ────────

  async revokeToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = this._hash(rawRefreshToken)
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data:  { revokedAt: new Date() },
    })
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    })
    // Pulisci anche Redis (pattern matching)
    const keys = await redis.keys(RedisKeys.allTokens(userId))
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  }

  // ── Helpers privati ───────────────────────────────────

  private _hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}
