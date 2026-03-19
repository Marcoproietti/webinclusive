// ─────────────────────────────────────────────────────────
// src/services/attendance.service.ts
// Logica check-in / check-out con verifica HMAC + geofence
// Gestione stato appuntamento nel scheduling-service
// ─────────────────────────────────────────────────────────

import { prisma }                   from '../db/clients.js'
import { redis, CacheKeys, QueueNames } from '../db/clients.js'
import { proofService }             from './proof-of-presence.service.js'
import { geofenceService }          from './geofence.service.js'
import { encryptField, decryptField } from '../utils/crypto.js'
import { env }                      from '../config/env.js'
import { Queue }                    from 'bullmq'

export interface CheckInRequest {
  appointmentId:   string
  operatorId:      string
  lat:             number
  lng:             number
  deviceSignature: string
  clientTimestamp: string  // ISO UTC dal device
  deviceId:        string
}

export interface CheckInResult {
  attendanceId:   string
  checkInAt:      Date
  isVerified:     boolean
  geofenceOk:     boolean
  distanceMeters: number | null
  offline:        boolean
}

export interface CheckOutRequest {
  attendanceId:    string
  operatorId:      string
  lat:             number
  lng:             number
  deviceSignature: string
  clientTimestamp: string
  deviceId:        string
}

export interface CheckOutResult {
  attendanceId:  string
  checkOutAt:    Date
  durationMin:   number
  isVerified:    boolean
}

export class AttendanceService {

  // ── CHECK-IN ──────────────────────────────────────────

  async checkIn(req: CheckInRequest): Promise<CheckInResult> {

    // 1. Verifica non esista già un check-in per questo appuntamento
    const existing = await prisma.attendanceRecord.findUnique({
      where: { appointmentId: req.appointmentId },
    })
    if (existing) {
      if (existing.status === 'checked_in' && !existing.checkOutAt) {
        throw Object.assign(new Error('ALREADY_CHECKED_IN'), {
          attendanceId: existing.id,
        })
      }
    }

    // 2. Verifica HMAC firma device
    const proofResult = await proofService.verify(
      {
        appointmentId: req.appointmentId,
        operatorId:    req.operatorId,
        lat:           req.lat,
        lng:           req.lng,
        timestamp:     req.clientTimestamp,
        type:          'checkin',
      },
      req.deviceSignature,
      req.deviceId
    )

    const isVerified = proofResult.valid
    if (!isVerified) {
      // Log tentativo non verificato ma non bloccare (operatore sul campo)
      console.warn(`[CheckIn] Firma non valida per operatore ${req.operatorId}:`, proofResult.reason)
    }

    // 3. Geofence — recupera coordinate beneficiario
    let geofenceOk     = false
    let distanceMeters: number | null = null

    const beneficiaryCoords = await this._getBeneficiaryCoords(req.appointmentId)
    if (beneficiaryCoords) {
      const gfResult = geofenceService.check(
        { lat: req.lat, lng: req.lng },
        beneficiaryCoords
      )
      geofenceOk     = gfResult.ok
      distanceMeters = gfResult.distanceMeters

      if (!geofenceOk) {
        console.warn(
          `[CheckIn] Geofence fallito: operatore ${req.operatorId}, ` +
          `distanza ${gfResult.distanceMeters}m (max ${gfResult.radiusMeters}m)`
        )
      }
    }

    // 4. Salva record
    const now    = new Date()
    const record = await prisma.attendanceRecord.create({
      data: {
        appointmentId:  req.appointmentId,
        operatorId:     req.operatorId,
        checkInAt:      new Date(req.clientTimestamp),
        checkInLat:     req.lat,
        checkInLng:     req.lng,
        checkInSig:     req.deviceSignature,
        isVerified,
        geofenceOk,
        distanceMeters: distanceMeters ?? undefined,
        status:         'checked_in',
      },
    })

    // 5. Aggiorna stato appuntamento → in_progress (fire-and-forget)
    this._updateAppointmentStatus(req.appointmentId, 'in_progress').catch(console.error)

    // 6. Salva stato in Redis per query rapida (es. monitor CO)
    await redis.setex(
      CacheKeys.checkinState(req.appointmentId),
      4 * 3600, // 4 ore
      JSON.stringify({
        attendanceId: record.id,
        operatorId:   req.operatorId,
        checkInAt:    record.checkInAt.toISOString(),
        isVerified,
        geofenceOk,
      })
    )

    return {
      attendanceId:   record.id,
      checkInAt:      record.checkInAt,
      isVerified,
      geofenceOk,
      distanceMeters,
      offline:        false,
    }
  }

  // ── CHECK-OUT ─────────────────────────────────────────

  async checkOut(req: CheckOutRequest): Promise<CheckOutResult> {

    // 1. Recupera record check-in
    const record = await prisma.attendanceRecord.findUnique({
      where: { id: req.attendanceId },
    })
    if (!record) throw new Error('ATTENDANCE_NOT_FOUND')
    if (record.operatorId !== req.operatorId) throw new Error('FORBIDDEN')
    if (record.status !== 'checked_in') throw new Error('NOT_CHECKED_IN')

    // 2. Verifica firma HMAC checkout
    const proofResult = await proofService.verify(
      {
        appointmentId: record.appointmentId,
        operatorId:    req.operatorId,
        lat:           req.lat,
        lng:           req.lng,
        timestamp:     req.clientTimestamp,
        type:          'checkout',
      },
      req.deviceSignature,
      req.deviceId
    )

    const isVerified = proofResult.valid

    // 3. Calcola durata effettiva
    const checkOutAt = new Date(req.clientTimestamp)
    const durationMin = Math.round(
      (checkOutAt.getTime() - record.checkInAt.getTime()) / 60000
    )

    // 4. Aggiorna record
    await prisma.attendanceRecord.update({
      where: { id: req.attendanceId },
      data: {
        checkOutAt:   checkOutAt,
        checkOutLat:  req.lat,
        checkOutLng:  req.lng,
        checkOutSig:  req.deviceSignature,
        isVerified:   record.isVerified && isVerified,
        durationMin,
        status:       'checked_out',
      },
    })

    // 5. Azioni post-checkout via BullMQ (async)
    const queue = new Queue(QueueNames.POST_CHECKOUT, { connection: redis })
    await queue.add('post-checkout', {
      attendanceId:  req.attendanceId,
      appointmentId: record.appointmentId,
      operatorId:    req.operatorId,
      durationMin,
      checkOutAt:    checkOutAt.toISOString(),
    })

    // 6. Invalida cache stato
    await redis.del(CacheKeys.checkinState(record.appointmentId))

    return {
      attendanceId: req.attendanceId,
      checkOutAt,
      durationMin,
      isVerified,
    }
  }

  // ── SYNC OFFLINE BATCH ────────────────────────────────

  async syncBatch(
    operatorId: string,
    records:    Array<{
      type:            'checkin' | 'checkout'
      appointmentId?:  string
      attendanceId?:   string
      lat:             number
      lng:             number
      deviceSignature: string
      clientTimestamp: string
      deviceId:        string
    }>
  ): Promise<{ processed: number; errors: Array<{ index: number; reason: string }> }> {

    // Verifica timestamp non troppo vecchi
    const maxAgeMs  = env.OFFLINE_SYNC_MAX_HOURS * 3600 * 1000
    const errors:   Array<{ index: number; reason: string }> = []
    let   processed = 0

    for (let i = 0; i < records.length; i++) {
      const r = records[i]

      // Verifica età record offline
      const recordTime = new Date(r.clientTimestamp).getTime()
      if (Date.now() - recordTime > maxAgeMs) {
        errors.push({ index: i, reason: 'RECORD_TOO_OLD' })
        continue
      }

      try {
        if (r.type === 'checkin' && r.appointmentId) {
          await this.checkIn({
            appointmentId:   r.appointmentId,
            operatorId,
            lat:             r.lat,
            lng:             r.lng,
            deviceSignature: r.deviceSignature,
            clientTimestamp: r.clientTimestamp,
            deviceId:        r.deviceId,
          })
        } else if (r.type === 'checkout' && r.attendanceId) {
          await this.checkOut({
            attendanceId:    r.attendanceId,
            operatorId,
            lat:             r.lat,
            lng:             r.lng,
            deviceSignature: r.deviceSignature,
            clientTimestamp: r.clientTimestamp,
            deviceId:        r.deviceId,
          })
        } else {
          errors.push({ index: i, reason: 'MISSING_REQUIRED_FIELD' })
          continue
        }
        processed++
      } catch (err: any) {
        errors.push({ index: i, reason: err.message ?? 'UNKNOWN_ERROR' })
      }
    }

    return { processed, errors }
  }

  // ── Report presenze per periodo ───────────────────────

  async getReport(params: {
    from:        Date
    to:          Date
    operatorId?: string
    format:      'json' | 'csv'
  }) {
    const where: any = {
      checkInAt: { gte: params.from, lte: params.to },
      status:    'checked_out',
    }
    if (params.operatorId) where.operatorId = params.operatorId

    const records = await prisma.attendanceRecord.findMany({
      where,
      include: { note: true },
      orderBy: { checkInAt: 'asc' },
    })

    return records
  }

  // ── Private helpers ───────────────────────────────────

  private async _getBeneficiaryCoords(
    appointmentId: string
  ): Promise<{ lat: number; lng: number } | null> {
    // 1. Prova cache Redis
    const cached = await redis.get(CacheKeys.beneficiaryCoords(appointmentId))
    if (cached) return JSON.parse(cached)

    // 2. Chiamata interna a scheduling-service
    try {
      const res = await fetch(
        `${env.SCHEDULING_SERVICE_URL}/api/v1/appointments/${appointmentId}`,
        { headers: { 'x-internal': 'true' } }
      )
      if (!res.ok) return null
      const appt: any = await res.json()
      const address   = appt?.carePlan?.beneficiary?.address
      if (!address) return null

      // Geocodifica l'indirizzo (decifrato lato scheduling-service)
      const coords = await geofenceService.geocodeAddress(address)
      if (coords) {
        // Cache 24h — l'indirizzo del beneficiario cambia raramente
        await redis.setex(
          CacheKeys.beneficiaryCoords(appointmentId),
          86400,
          JSON.stringify(coords)
        )
      }
      return coords
    } catch {
      return null
    }
  }

  private async _updateAppointmentStatus(
    appointmentId: string,
    status: string
  ): Promise<void> {
    try {
      await fetch(
        `${env.SCHEDULING_SERVICE_URL}/api/v1/appointments/${appointmentId}/status`,
        {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-internal': 'true' },
          body:    JSON.stringify({ status }),
        }
      )
    } catch (err) {
      console.error('[AttendanceService] Aggiornamento stato appuntamento fallito:', err)
    }
  }
}

export const attendanceService = new AttendanceService()
