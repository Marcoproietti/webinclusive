// ─────────────────────────────────────────────────────────
// src/services/availability.service.ts
// Calcola disponibilità reale degli operatori:
// turno pianificato − appuntamenti esistenti
// ─────────────────────────────────────────────────────────

import { startOfDay, endOfDay, parseISO, format } from 'date-fns'
import { prisma } from '../db/prisma.js'
import { redis, CacheKeys } from '../db/redis.js'

export interface AvailableSlot {
  operatorId:    string
  date:          string   // ISO date
  freeFrom:      string   // "HH:MM"
  freeTo:        string
  totalFreeMin:  number
}

export interface OperatorWithAvailability {
  operatorId:    string
  qualification: string
  zone:          string | null
  distanceKm?:   number
  freeSlots:     AvailableSlot[]
}

export class AvailabilityService {

  // ── Operatori disponibili in una fascia oraria ────────

  async getAvailableOperators(params: {
    from:          Date
    to:            Date
    qualification: string
    zone?:         string
  }): Promise<OperatorWithAvailability[]> {

    // 1. Cerca operatori con qualifica e zona corrette
    //    (Il DB degli operatori è in auth schema — query su DB condiviso)
    const operators = await prisma.$queryRaw<Array<{
      operator_id:    string
      qualification:  string
      territory_zone: string | null
    }>>`
      SELECT
        o.id           AS operator_id,
        o.qualification,
        o.territory_zone
      FROM auth.operators o
      JOIN auth.users u ON u.id = o.user_id
      WHERE
        u.is_active     = TRUE
        AND o.is_available = TRUE
        AND o.qualification = ${params.qualification}
        ${params.zone ? prisma.$raw`AND o.territory_zone = ${params.zone}` : prisma.$raw``}
    `

    const results: OperatorWithAvailability[] = []

    for (const op of operators) {
      // 2. Verifica eccezioni disponibilità (ferie/malattia)
      const dateOnly = new Date(params.from.toISOString().split('T')[0])
      const exception = await prisma.operatorAvailability.findUnique({
        where: {
          operatorId_date: { operatorId: op.operator_id, date: dateOnly },
        },
      })
      if (exception && !exception.isAvailable) continue

      // 3. Verifica nessun appuntamento sovrapposto
      const overlap = await prisma.appointment.findFirst({
        where: {
          operatorId: op.operator_id,
          status:     { notIn: ['cancelled', 'missed'] },
          AND: [
            { scheduledStart: { lt: params.to   } },
            { scheduledEnd:   { gt: params.from } },
          ],
        },
      })
      if (overlap) continue

      results.push({
        operatorId:    op.operator_id,
        qualification: op.qualification,
        zone:          op.territory_zone,
        freeSlots:     [{
          operatorId:   op.operator_id,
          date:         format(params.from, 'yyyy-MM-dd'),
          freeFrom:     format(params.from, 'HH:mm'),
          freeTo:       format(params.to, 'HH:mm'),
          totalFreeMin: Math.round((params.to.getTime() - params.from.getTime()) / 60000),
        }],
      })
    }

    return results
  }

  // ── Workload settimanale per operatore ────────────────

  async getWeeklyWorkload(operatorId: string, weekStart: Date): Promise<{
    totalScheduledMin: number
    appointmentsCount: number
    byDay:             Record<string, number>
  }> {
    const cacheKey = CacheKeys.operatorSchedule(
      operatorId,
      format(weekStart, 'yyyy-Www')
    )

    // Prova cache Redis
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const appts = await prisma.appointment.findMany({
      where: {
        operatorId,
        status:         { notIn: ['cancelled', 'missed'] },
        scheduledStart: { gte: weekStart, lt: weekEnd },
      },
      select: { scheduledStart: true, scheduledEnd: true },
    })

    const byDay: Record<string, number> = {}
    let total = 0

    for (const a of appts) {
      const day = format(a.scheduledStart, 'yyyy-MM-dd')
      const min = Math.round((a.scheduledEnd.getTime() - a.scheduledStart.getTime()) / 60000)
      byDay[day] = (byDay[day] ?? 0) + min
      total += min
    }

    const result = {
      totalScheduledMin: total,
      appointmentsCount: appts.length,
      byDay,
    }

    // Cache 5 min
    await redis.setex(cacheKey, 300, JSON.stringify(result))
    return result
  }
}

export const availabilityService = new AvailabilityService()
