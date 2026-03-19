// ─────────────────────────────────────────────────────────
// src/routes/shift.routes.ts
// ─────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { z }                    from 'zod'
import { prisma }               from '../db/prisma.js'
import { requireRole }          from '../middleware/jwt-auth.js'

const createShiftSchema = z.object({
  operator_id:   z.string().uuid(),
  shift_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:    z.string().regex(/^\d{2}:\d{2}$/),
  end_time:      z.string().regex(/^\d{2}:\d{2}$/),
  shift_type:    z.enum(['mattina', 'pomeriggio', 'notte', 'festivo', 'reperibilita']),
  territory_zone:z.string().optional(),
  notes:         z.string().optional(),
})

const bulkShiftSchema = z.object({
  shifts: z.array(createShiftSchema).min(1).max(100),
})

export async function shiftRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /shifts/mine — turni operatore autenticato (APP MOBILE)
  fastify.get('/mine', async (req, reply) => {
    const caller = req.user as { sub: string }
    const q = req.query as { from?: string; to?: string }

    const where: any = { operatorId: caller.sub }
    if (q.from || q.to) {
      where.shiftDate = {
        ...(q.from && { gte: new Date(q.from) }),
        ...(q.to   && { lte: new Date(q.to)   }),
      }
    }

    const shifts = await prisma.shift.findMany({
      where,
      orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
    })

    // Aggiungi conteggio appuntamenti per ogni turno
    const enriched = await Promise.all(shifts.map(async (s) => {
      const count = await prisma.appointment.count({
        where: {
          operatorId: s.operatorId,
          scheduledStart: {
            gte: new Date(`${s.shiftDate.toISOString().split('T')[0]}T${s.startTime}:00Z`),
            lte: new Date(`${s.shiftDate.toISOString().split('T')[0]}T${s.endTime}:00Z`),
          },
          status: { notIn: ['cancelled', 'missed'] },
        },
      })
      return { ...s, appointments_count: count }
    }))

    return reply.send({ shifts: enriched })
  })

  // GET /shifts — tutti i turni (coordinatore)
  fastify.get('/', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const q = req.query as {
      operator_id?: string; date?: string; zone?: string
      week?: string; page?: string; limit?: string
    }
    const page  = Math.max(1, Number(q.page ?? 1))
    const limit = Math.min(200, Number(q.limit ?? 50))
    const where: any = {}

    if (q.operator_id) where.operatorId    = q.operator_id
    if (q.zone)        where.territoryZone = q.zone
    if (q.date)        where.shiftDate     = new Date(q.date)
    if (q.week) {
      const [year, week] = q.week.split('-W').map(Number)
      const jan4     = new Date(year, 0, 4)
      const weekStart = new Date(jan4)
      weekStart.setDate(jan4.getDate() - jan4.getDay() + 1 + (week - 1) * 7)
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7)
      where.shiftDate = { gte: weekStart, lt: weekEnd }
    }

    const [shifts, total] = await prisma.$transaction([
      prisma.shift.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.shift.count({ where }),
    ])
    return reply.send({ data: shifts, pagination: { page, limit, total } })
  })

  // POST / — Crea turno singolo
  fastify.post('/', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const body = createShiftSchema.parse(req.body)
    const shift = await prisma.shift.create({
      data: {
        operatorId:    body.operator_id,
        shiftDate:     new Date(body.shift_date),
        startTime:     body.start_time,
        endTime:       body.end_time,
        shiftType:     body.shift_type,
        territoryZone: body.territory_zone,
        notes:         body.notes,
      },
    })
    return reply.code(201).send(shift)
  })

  // POST /bulk — Crea turni in blocco
  fastify.post('/bulk', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const { shifts } = bulkShiftSchema.parse(req.body)
    const created = await prisma.shift.createMany({
      data: shifts.map((s) => ({
        operatorId:    s.operator_id,
        shiftDate:     new Date(s.shift_date),
        startTime:     s.start_time,
        endTime:       s.end_time,
        shiftType:     s.shift_type,
        territoryZone: s.territory_zone,
        notes:         s.notes,
      })),
      skipDuplicates: true,
    })
    return reply.code(201).send({ created: created.count })
  })

  // DELETE /:id
  fastify.delete<{ Params: { id: string } }>('/:id', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    await prisma.shift.delete({ where: { id: req.params.id } })
    return reply.send({ message: 'Turno eliminato.' })
  })
}
