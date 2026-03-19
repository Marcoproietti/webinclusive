// ─────────────────────────────────────────────────────────
// src/services/mfa.service.ts
// TOTP MFA (RFC 6238) — Google Authenticator compatible
// ─────────────────────────────────────────────────────────

import { authenticator } from 'otplib'
import QRCode             from 'qrcode'
import { prisma }         from '../db/prisma.js'
import { redis, RedisKeys } from '../db/redis.js'
import { env }            from '../config/env.js'

authenticator.options = {
  window: 1, // ±1 step di tolleranza (30s * 1 = 30s prima/dopo)
  step:   30,
}

export interface MfaSetupResult {
  secret:      string
  otpauthUrl:  string
  qrCodeDataUrl: string
}

export class MfaService {

  // ── Genera segreto per setup ──────────────────────────

  async setupMfa(userId: string): Promise<MfaSetupResult> {
    const user = await prisma.user.findUniqueOrThrow({
      where:  { id: userId },
      select: { email: true },
    })

    const secret     = authenticator.generateSecret(32)
    const otpauthUrl = authenticator.keyuri(user.email, env.MFA_ISSUER, secret)
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl)

    // Salva secret temporaneo in Redis (valido 10 min per completare setup)
    await redis.setex(
      `mfa_setup:${userId}`,
      600,
      secret
    )

    return { secret, otpauthUrl, qrCodeDataUrl }
  }

  // ── Conferma setup (verifica primo codice) ────────────

  async confirmMfaSetup(userId: string, totpCode: string): Promise<void> {
    const tempSecret = await redis.get(`mfa_setup:${userId}`)
    if (!tempSecret) throw new Error('MFA_SETUP_EXPIRED')

    const isValid = authenticator.verify({
      token:  totpCode,
      secret: tempSecret,
    })
    if (!isValid) throw new Error('MFA_INVALID_CODE')

    // Salva definitivamente nel DB e attiva MFA
    await prisma.user.update({
      where: { id: userId },
      data:  { mfaSecret: tempSecret, mfaEnabled: true },
    })

    await redis.del(`mfa_setup:${userId}`)
  }

  // ── Verifica TOTP durante login ───────────────────────

  async verifyTotp(userId: string, totpCode: string): Promise<boolean> {
    const user = await prisma.user.findUniqueOrThrow({
      where:  { id: userId },
      select: { mfaSecret: true, mfaEnabled: true },
    })

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new Error('MFA_NOT_ENABLED')
    }

    return authenticator.verify({
      token:  totpCode,
      secret: user.mfaSecret,
    })
  }

  // ── Verifica pendente post-login (MFA in 2 step) ──────
  // Dopo login OK ma prima di emettere token, se MFA attiva
  // salva stato intermedio in Redis

  async setPendingMfa(userId: string): Promise<void> {
    await redis.setex(RedisKeys.mfaPending(userId), 300, '1') // 5 min
  }

  async isPendingMfa(userId: string): Promise<boolean> {
    return (await redis.exists(RedisKeys.mfaPending(userId))) === 1
  }

  async clearPendingMfa(userId: string): Promise<void> {
    await redis.del(RedisKeys.mfaPending(userId))
  }

  // ── Disabilita MFA (richiede codice corrente) ─────────

  async disableMfa(userId: string, totpCode: string): Promise<void> {
    const valid = await this.verifyTotp(userId, totpCode)
    if (!valid) throw new Error('MFA_INVALID_CODE')

    await prisma.user.update({
      where: { id: userId },
      data:  { mfaSecret: null, mfaEnabled: false },
    })
  }
}
