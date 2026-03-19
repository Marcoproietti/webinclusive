// ─────────────────────────────────────────────────────────
// src/services/planner.service.ts
// Genera appuntamenti da piano di cura usando RRULE (iCal)
// Supporta: daily, weekly Nx/settimana, mensile, ecc.
// ─────────────────────────────────────────────────────────

import { RRule, RRuleSet, rrulestr } from 'rrule'
import { addMinutes, parseISO, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns'
import { toZonedTime, fromZonedTime }  from 'date-fns-tz'
import { prisma }                      from '../db/prisma.js'
import { conflictChecker }             from './conflict-check.service.js'
import { env }                         from '../config/env.js'
import type { CarePlanService }        from '@prisma/client'

export interface GeneratedAppointment {
  carePlanId:     string
  operatorId:     string
  serviceTypeId:  string
  scheduledStart: Date
  scheduledEnd:   Date
  recurrenceRule: string
  recurrenceId:   string   // UUID padre della serie
  createdBy:      string
}

export interface GenerationResult {
  generated:  number
  skipped:    number
  conflicts:  number
  appointments: GeneratedAppointment[]
}

// Mapping frequenza → stringa RRULE
export const FREQUENCY_TO_RRULE: Record<string, (from: Date, to: Date) => string> = {
  daily:    (f, t) => `DTSTART:${toRRuleDT(f)}\nRRULE:FREQ=DAILY;UNTIL=${toRRuleDT(t)}`,
  '2x_week': (f, t) => `DTSTART:${toRRuleDT(f)}\nRRULE:FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=${toRRuleDT(t)}`,
  '3x_week': (f, t) => `DTSTART:${toRRuleDT(f)}\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=${toRRuleDT(t)}`,
  '5x_week': (f, t) => `DTSTART:${toRRuleDT(f)}\nRRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=${toRRuleDT(t)}`,
  weekly:   (f, t) => `DTSTART:${toRRuleDT(f)}\nRRULE:FREQ=WEEKLY;UNTIL=${toRRuleDT(t)}`,
  biweekly: (f, t) => `DTSTART:${toRRuleDT(f)}\nRRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=${toRRuleDT(t)}`,
  monthly:  (f, t) => `DTSTART:${toRRuleDT(f)}\nRRULE:FREQ=MONTHLY;UNTIL=${toRRuleDT(t)}`,
}

function toRRuleDT(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export class PlannerService {

  // ── Genera appuntamenti da piano di cura ──────────────

  async generateFromPlan(params: {
    carePlanId:   string
    operatorId:   string
    from:         Date
    to:           Date
    createdBy:    string
    dryRun?:      boolean  // true → calcola senza persistere
  }): Promise<GenerationResult> {

    const plan = await prisma.carePlan.findUnique({
      where:   { id: params.carePlanId },
      include: { planServices: true },
    })
    if (!plan)                  throw new Error('CARE_PLAN_NOT_FOUND')
    if (plan.status !== 'active') throw new Error('PLAN_NOT_ACTIVE')

    const result: GenerationResult = {
      generated: 0, skipped: 0, conflicts: 0, appointments: [],
    }

    // Genera per ogni tipo di servizio nel piano
    for (const svc of plan.planServices) {
      const svcResult = await this._generateForService({
        carePlanId:    params.carePlanId,
        operatorId:    params.operatorId,
        planService:   svc,
        from:          params.from,
        to:            params.to,
        createdBy:     params.createdBy,
        dryRun:        params.dryRun ?? false,
      })

      result.generated += svcResult.generated
      result.skipped   += svcResult.skipped
      result.conflicts += svcResult.conflicts
      result.appointments.push(...svcResult.appointments)
    }

    return result
  }

  // ── Genera da RRULE custom ────────────────────────────

  async generateFromRRule(params: {
    carePlanId:     string
    operatorId:     string
    serviceTypeId:  string
    rruleString:    string
    durationMin:    number
    createdBy:      string
    dryRun?:        boolean
  }): Promise<GenerationResult> {

    const serviceType = await prisma.serviceType.findUnique({
      where:  { id: params.serviceTypeId },
      select: { defaultDurationMin: true },
    })
    if (!serviceType) throw new Error('SERVICE_TYPE_NOT_FOUND')

    const duration   = params.durationMin || serviceType.defaultDurationMin
    const rule       = rrulestr(params.rruleString)
    const occurrences = rule.all()

    if (occurrences.length > env.MAX_APPT_GENERATE) {
      throw new Error(`Troppe occorrenze: max ${env.MAX_APPT_GENERATE}, richieste ${occurrences.length}`)
    }

    const recurrenceId = crypto.randomUUID()
    const result: GenerationResult = { generated: 0, skipped: 0, conflicts: 0, appointments: [] }
    const toCreate: GeneratedAppointment[] = []

    for (const occ of occurrences) {
      const start = toZonedTime(occ, env.TZ)
      const end   = addMinutes(start, duration)

      const check = await conflictChecker.fullCheck({
        operatorId:     params.operatorId,
        serviceTypeId:  params.serviceTypeId,
        scheduledStart: start,
        scheduledEnd:   end,
      })

      if (check.hasConflict) {
        result.conflicts++
        continue
      }

      const appt: GeneratedAppointment = {
        carePlanId:     params.carePlanId,
        operatorId:     params.operatorId,
        serviceTypeId:  params.serviceTypeId,
        scheduledStart: start,
        scheduledEnd:   end,
        recurrenceRule: params.rruleString,
        recurrenceId,
        createdBy:      params.createdBy,
      }
      toCreate.push(appt)
      result.generated++
    }

    if (!params.dryRun && toCreate.length > 0) {
      // createMany per performance (batch insert)
      await prisma.appointment.createMany({ data: toCreate })
    }

    result.appointments = toCreate
    return result
  }

  // ── Cancella serie ricorrente ─────────────────────────

  async cancelRecurringSeries(
    recurrenceId:       string,
    fromDate:           Date,
    cancellationReason: string
  ): Promise<number> {
    const { count } = await prisma.appointment.updateMany({
      where: {
        recurrenceId,
        scheduledStart:  { gte: fromDate },
        status:          { notIn: ['completed', 'in_progress'] },
      },
      data: {
        status:             'cancelled',
        cancellationReason,
      },
    })
    return count
  }

  // ── Sposta una singola occorrenza ─────────────────────

  async moveOccurrence(params: {
    appointmentId:  string
    newStart:       Date
    newEnd:         Date
    updatedBy:      string
  }): Promise<void> {
    const appt = await prisma.appointment.findUnique({
      where: { id: params.appointmentId },
    })
    if (!appt) throw new Error('APPOINTMENT_NOT_FOUND')
    if (['completed', 'in_progress', 'cancelled'].includes(appt.status)) {
      throw new Error('Cannot move appointment in status: ' + appt.status)
    }

    // Verifica conflitti per nuovo orario
    const check = await conflictChecker.fullCheck({
      operatorId:     appt.operatorId,
      serviceTypeId:  appt.serviceTypeId,
      scheduledStart: params.newStart,
      scheduledEnd:   params.newEnd,
      excludeId:      params.appointmentId,
    })
    if (check.hasConflict) throw new Error('OVERLAPPING_APPOINTMENT')

    await prisma.appointment.update({
      where: { id: params.appointmentId },
      data: {
        scheduledStart: params.newStart,
        scheduledEnd:   params.newEnd,
      },
    })
  }

  // ── Private: genera per singolo servizio del piano ────

  private async _generateForService(params: {
    carePlanId:   string
    operatorId:   string
    planService:  CarePlanService
    from:         Date
    to:           Date
    createdBy:    string
    dryRun:       boolean
  }): Promise<GenerationResult> {
    const { planService } = params

    // Recupera durata dal servizio o usa default
    const serviceType = await prisma.serviceType.findUnique({
      where:  { id: planService.serviceTypeId },
      select: { defaultDurationMin: true },
    })
    const duration = planService.durationMin ?? serviceType?.defaultDurationMin ?? 60

    // Costruisce RRULE dalla frequenza
    const rruleBuilder = FREQUENCY_TO_RRULE[planService.frequency]
    if (!rruleBuilder) {
      console.warn(`Frequenza non riconosciuta: ${planService.frequency}`)
      return { generated: 0, skipped: 1, conflicts: 0, appointments: [] }
    }

    const rruleStr = rruleBuilder(params.from, params.to)

    return this.generateFromRRule({
      carePlanId:     params.carePlanId,
      operatorId:     params.operatorId,
      serviceTypeId:  planService.serviceTypeId,
      rruleString:    rruleStr,
      durationMin:    duration,
      createdBy:      params.createdBy,
      dryRun:         params.dryRun,
    })
  }
}

export const plannerService = new PlannerService()
