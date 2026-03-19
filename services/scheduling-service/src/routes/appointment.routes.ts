// ─────────────────────────────────────────────────────────
// src/routes/appointment.routes.ts
// GET    /api/v1/appointments
// GET    /api/v1/appointments/:id
// POST   /api/v1/appointments            — singolo manuale
// PATCH  /api/v1/appointments/:id        — sposta orario
// POST   /api/v1/appointments/:id/reassign
// POST   /api/v1/appointments/:id/cancel
// POST   /api/v1/appointments/:id/confirm
// POST   /api/v1/appointments/series/:recurrenceId/cancel
// ─────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { z }                    from 'zod'
import { addMinutes }           from 'date-fns'
import { prisma }               from '../db/prisma.js'
import { conflictChecker }      from '../services/conflict-check.service.js'
import { plannerService }       from '../services/planner.service.js'
import { requireRole }          from '../middleware/jwt-auth.js'

// ── Schemi ────────────────────────────────────────────────

const createApptSchema = z.object({
  care_plan_id:    z.string().uuid(),
  operator_id:     z.string().uuid(),
  service_type_id: z.string().uuid(),
  scheduled_start: z.string().datetime(),
  scheduled_end:   z.string().datetime(),
  notes:           z.string().optional(),
})

const moveApptSchema = z.object({
  scheduled_start: z.string().datetime(),
  scheduled_end:   z.string().datetime(),
})

const reassignSchema = z.object({
  new_operator_id: z.string().uuid(),
  reason:          z.string().min(1),
})

const cancelSchema = z.object({
  reason:           z.string().min(1),
  cancel_series:    z.boolean().default(false),
})

// ── Routes ────────────────────────────────────────────────

export async function appointmentRoutes(fastify: FastifyInstance) {

  fastify.addHook('onRequest', fastify.authenticate)

  // ── GET / — Lista/calendario ───────────────────────────

  fastify.get('/', async (req, reply) => {
    const q = req.query as {
      operator_id?: string; care_plan_id?: string
      date?: string; week?: string; month?: string
      status?: string
      page?: string; limit?: string
    }
    const caller = req.user as { sub: string; role: string }
    const page   = Math.max(1, Number(q.page ?? 1))
    const limit  = Math.min(200, Number(q.limit ?? 50))

    const where: any = {}

    // Operatori vedono solo i propri appuntamenti
    if (caller.role === 'operator') {
      where.operatorId = caller.sub
    } else if (q.operator_id) {
      where.operatorId = q.operator_id === 'mine' ? caller.sub : q.operator_id
    }

    if (q.care_plan_id) where.carePlanId = q.care_plan_id
    if (q.status)       where.status     = q.status

    // Filtro per giorno
    if (q.date) {
      const d = new Date(q.date)
      where.scheduledStart = {
        gte: new Date(d.setHours(0, 0, 0, 0)),
        lt:  new Date(d.setHours(23, 59, 59, 999)),
      }
    }
    // Filtro per settimana ISO (es: "2024-W15")
    else if (q.week) {
      const [year, week] = q.week.split('-W').map(Number)
      const jan4 = new Date(year, 0, 4)
      const weekStart = new Date(jan4)
      weekStart.setDate(jan4.getDate() - jan4.getDay() + 1 + (week - 1) * 7)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)
      where.scheduledStart = { gte: weekStart, lt: weekEnd }
    }
    // Filtro per mese (es: "2024-04")
    else if (q.month) {
      const [year, month] = q.month.split('-').map(Number)
      where.scheduledStart = {
        gte: new Date(year, month - 1, 1),
        lt:  new Date(year, month, 1),
      }
    }

    const [appts, total] = await prisma.$transaction([
      prisma.appointment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          carePlan:    { include: { beneficiary: { select: { id: true, firstName: true, lastName: true, address: true } } } },
          serviceType: { select: { id: true, code: true, name: true, category: true } },
        },
        orderBy: { scheduledStart: 'asc' },
      }),
      prisma.appointment.count({ where }),
    ])

    return reply.send({
      data:       appts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  })

  // ── GET /:id ───────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const appt = await prisma.appointment.findUnique({
      where:   { id: req.params.id },
      include: {
        carePlan:    { include: { beneficiary: true } },
        serviceType: true,
      },
    })
    if (!appt) throw new Error('APPOINTMENT_NOT_FOUND')
    return reply.send(appt)
  })

  // ── POST / — Crea singolo appuntamento ─────────────────

  fastify.post('/', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const caller = req.user as { sub: string }
    const body   = createApptSchema.parse(req.body)

    const start = new Date(body.scheduled_start)
    const end   = new Date(body.scheduled_end)

    if (start >= end) throw new Error('INVALID_DATE_RANGE')

    const check = await conflictChecker.fullCheck({
      operatorId:     body.operator_id,
      serviceTypeId:  body.service_type_id,
      scheduledStart: start,
      scheduledEnd:   end,
    })
    if (check.hasConflict) {
      return reply.code(409).send({
        error:   check.conflictType?.toUpperCase(),
        message: check.details,
      })
    }

    const appt = await prisma.appointment.create({
      data: {
        carePlanId:     body.care_plan_id,
        operatorId:     body.operator_id,
        serviceTypeId:  body.service_type_id,
        scheduledStart: start,
        scheduledEnd:   end,
        notes:          body.notes,
        createdBy:      caller.sub,
      },
      include: { serviceType: { select: { name: true } } },
    })

    return reply.code(201).send(appt)
  })

  // ── PATCH /:id — Sposta orario ─────────────────────────

  fastify.patch<{ Params: { id: string } }>('/:id', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const body = moveApptSchema.parse(req.body)
    const start = new Date(body.scheduled_start)
    const end   = new Date(body.scheduled_end)

    await plannerService.moveOccurrence({
      appointmentId:  req.params.id,
      newStart:       start,
      newEnd:         end,
      updatedBy:      (req.user as { sub: string }).sub,
    })

    return reply.send({ message: 'Appuntamento spostato.' })
  })

  // ── POST /:id/confirm ──────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/:id/confirm', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } })
    if (!appt) throw new Error('APPOINTMENT_NOT_FOUND')
    if (appt.status !== 'scheduled') {
      return reply.code(400).send({ error: 'INVALID_STATUS_TRANSITION' })
    }
    await prisma.appointment.update({
      where: { id: req.params.id },
      data:  { status: 'confirmed' },
    })
    return reply.send({ message: 'Appuntamento confermato.' })
  })

  // ── POST /:id/cancel ───────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/:id/cancel', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const body = cancelSchema.parse(req.body)
    const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } })
    if (!appt) throw new Error('APPOINTMENT_NOT_FOUND')

    if (['completed', 'in_progress'].includes(appt.status)) {
      return reply.code(400).send({
        error: 'CANNOT_CANCEL',
        message: 'Non è possibile cancellare un appuntamento completato o in corso.',
      })
    }

    if (body.cancel_series && appt.recurrenceId) {
      // Cancella tutta la serie futura
      const count = await plannerService.cancelRecurringSeries(
        appt.recurrenceId,
        new Date(),
        body.reason
      )
      return reply.send({ message: `Cancellati ${count} appuntamenti della serie.` })
    }

    await prisma.appointment.update({
      where: { id: req.params.id },
      data:  { status: 'cancelled', cancellationReason: body.reason },
    })
    return reply.send({ message: 'Appuntamento cancellato.' })
  })

  // ── POST /:id/reassign — Riassegna operatore ───────────

  fastify.post<{ Params: { id: string } }>('/:id/reassign', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const body = reassignSchema.parse(req.body)
    const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } })
    if (!appt) throw new Error('APPOINTMENT_NOT_FOUND')

    if (['completed', 'in_progress', 'cancelled'].includes(appt.status)) {
      return reply.code(400).send({ error: 'INVALID_STATUS_FOR_REASSIGN' })
    }

    // Verifica nuovo operatore disponibile
    const check = await conflictChecker.fullCheck({
      operatorId:     body.new_operator_id,
      serviceTypeId:  appt.serviceTypeId,
      scheduledStart: appt.scheduledStart,
      scheduledEnd:   appt.scheduledEnd,
    })
    if (check.hasConflict) {
      return reply.code(409).send({
        error:   'OPERATOR_NOT_AVAILABLE',
        message: check.details,
      })
    }

    await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        operatorId:     body.new_operator_id,
        reassignedFrom: appt.operatorId,
        notes:          `Riassegnato: ${body.reason}`,
      },
    })

    return reply.send({ message: 'Appuntamento riassegnato.' })
  })

  // ── POST /series/:recurrenceId/cancel ──────────────────

  fastify.post<{ Params: { recurrenceId: string } }>(
    '/series/:recurrenceId/cancel', {
      onRequest: [requireRole(['admin', 'coordinator'])],
    }, async (req, reply) => {
      const body = z.object({
        reason:    z.string().min(1),
        from_date: z.string().datetime().optional(),
      }).parse(req.body)

      const fromDate = body.from_date ? new Date(body.from_date) : new Date()
      const count    = await plannerService.cancelRecurringSeries(
        req.params.recurrenceId,
        fromDate,
        body.reason
      )
      return reply.send({ cancelled: count, message: `Cancellati ${count} appuntamenti.` })
    }
  )
}
