// ─────────────────────────────────────────────────────────
// src/services/proof-of-presence.service.ts
// Verifica firma HMAC-SHA256 del device per ogni presenza
// Garantisce che il check-in sia avvenuto dal dispositivo
// registrato dell'operatore, non modificabile lato client
// ─────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'crypto'
import { prisma }                       from '../db/clients.js'
import { redis, CacheKeys }             from '../db/clients.js'

export interface ProofPayload {
  appointmentId: string
  operatorId:    string
  lat:           number
  lng:           number
  timestamp:     string  // ISO 8601 UTC
  type:          'checkin' | 'checkout'
}

export interface VerificationResult {
  valid:       boolean
  reason?:     string
  deviceId?:   string
}

export class ProofOfPresenceService {

  // ── Verifica firma HMAC dal device ────────────────────

  async verify(
    payload:   ProofPayload,
    signature: string,       // HMAC-SHA256 hex ricevuto dal device
    deviceId:  string
  ): Promise<VerificationResult> {

    // 1. Recupera device secret (cache Redis → DB)
    const secret = await this._getDeviceSecret(payload.operatorId, deviceId)
    if (!secret) {
      return { valid: false, reason: 'DEVICE_NOT_REGISTERED' }
    }

    // 2. Ricrea il payload canonico (stesso ordine del client Flutter)
    const canonicalPayload = [
      payload.appointmentId,
      payload.operatorId,
      payload.lat.toFixed(6),
      payload.lng.toFixed(6),
      payload.timestamp,
      payload.type,
    ].join('|')

    // 3. Calcola HMAC atteso
    const expectedSig = createHmac('sha256', secret)
      .update(canonicalPayload)
      .digest('hex')

    // 4. Confronto timing-safe (previene timing attacks)
    let signaturesMatch = false
    try {
      signaturesMatch = timingSafeEqual(
        Buffer.from(signature,   'hex'),
        Buffer.from(expectedSig, 'hex')
      )
    } catch {
      // Buffer lunghezze diverse → firma non valida
      return { valid: false, reason: 'SIGNATURE_FORMAT_INVALID' }
    }

    if (!signaturesMatch) {
      return { valid: false, reason: 'SIGNATURE_MISMATCH' }
    }

    // 5. Verifica timestamp non troppo vecchio (replay attack prevention)
    const requestTime = new Date(payload.timestamp).getTime()
    const now         = Date.now()
    const maxAgeMs    = 5 * 60 * 1000  // 5 minuti di tolleranza

    if (isNaN(requestTime)) {
      return { valid: false, reason: 'INVALID_TIMESTAMP' }
    }

    if (Math.abs(now - requestTime) > maxAgeMs) {
      return { valid: false, reason: 'TIMESTAMP_TOO_OLD_OR_FUTURE' }
    }

    // 6. Aggiorna lastUsedAt del device
    await prisma.deviceRegistry.updateMany({
      where: { operatorId: payload.operatorId, deviceId },
      data:  { lastUsedAt: new Date() },
    })

    return { valid: true, deviceId }
  }

  // ── Registra nuovo device per operatore ───────────────

  async registerDevice(params: {
    operatorId:   string
    deviceId:     string
    deviceSecret: string
    deviceName?:  string
    platform?:    string
  }): Promise<void> {
    await prisma.deviceRegistry.upsert({
      where: {
        operatorId_deviceId: {
          operatorId: params.operatorId,
          deviceId:   params.deviceId,
        },
      },
      update: {
        deviceSecret: params.deviceSecret,
        deviceName:   params.deviceName,
        platform:     params.platform,
        isActive:     true,
      },
      create: {
        operatorId:   params.operatorId,
        deviceId:     params.deviceId,
        deviceSecret: params.deviceSecret,
        deviceName:   params.deviceName,
        platform:     params.platform,
      },
    })

    // Invalida cache vecchia
    await redis.del(CacheKeys.deviceSecret(params.operatorId, params.deviceId))
  }

  // ── Revoca device (es. smarrimento) ───────────────────

  async revokeDevice(operatorId: string, deviceId: string): Promise<void> {
    await prisma.deviceRegistry.updateMany({
      where: { operatorId, deviceId },
      data:  { isActive: false },
    })
    await redis.del(CacheKeys.deviceSecret(operatorId, deviceId))
  }

  // ── Private: recupera secret (cache-first) ────────────

  private async _getDeviceSecret(
    operatorId: string,
    deviceId:   string
  ): Promise<string | null> {
    const cacheKey = CacheKeys.deviceSecret(operatorId, deviceId)

    // 1. Prova Redis (TTL 1 ora)
    const cached = await redis.get(cacheKey)
    if (cached) return cached

    // 2. Query DB
    const device = await prisma.deviceRegistry.findUnique({
      where: {
        operatorId_deviceId: { operatorId, deviceId },
      },
      select: { deviceSecret: true, isActive: true },
    })

    if (!device || !device.isActive) return null

    // 3. Metti in cache
    await redis.setex(cacheKey, 3600, device.deviceSecret)
    return device.deviceSecret
  }
}

export const proofService = new ProofOfPresenceService()
