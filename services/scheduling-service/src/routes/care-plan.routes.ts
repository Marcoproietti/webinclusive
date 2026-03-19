// ─────────────────────────────────────────────────────────
// src/routes/care-plan.routes.ts
// GET    /api/v1/care-plans
// GET    /api/v1/care-plans/:id
// POST   /api/v1/care-plans
// PATCH  /api/v1/care-plans/:id
// POST   /api/v1/care-plans/:id/generate    — genera appuntamenti
// POST   /api/v1/care-plans/:id/activate
// POST   /api/v1/care-plans/:id/close
// ─────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { z }                    from 'zod'
import { prisma }               from '../db/prisma.js'
import { plannerService }       from '../services/planner.service.js'
import { requireRole }          from '../middleware/jwt-auth.js'

// ── Schemi Zod ────────────────────────────────────────────

const createPlanSchema = z.object({
  beneficiary_id:    z.string().uuid(),
  plan_code:         z.string().min(1).max(30),
  asl_authorization: z.string().max(50).optional(),
  start_date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weekly_hours:      z.number().positive().max(168),
  notes:             z.string().optional(),
  services: z.array(z.object({
    service_type_id: z.string().uuid(),
    frequency:       z.string().min(1),   // daily, 3x_week, weekly, …
    duration_min:    z.number().int().positive().optional(),
    notes:           z.string().optional(),
  })).min(1),
})

const generateSchema = z.object({
  operator_id:  z.string().uuid(),
  from:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dry_run:      z.boolean().default(false),
})

const updatePlanSchema = z.object({
  end_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weekly_hours:     z.number().positive().max(168).optional(),
  asl_authorization:z.string().max(50).optional(),
  notes:            z.string().optional(),
})

// ── Plugin ────────────────────────────────────────────────

export async function carePlanRoutes(fastify: FastifyInstance) {

  fastify.addHook('onRequest', fastify.authenticate)

  // ── GET / ──────────────────────────────────────────────

  fastify.get('/', async (req, reply) => {
    const q = req.query as {
      beneficiary_id?: string; status?: string
      page?: string; limit?: string
    }
    const page  = Math.max(1, Number(q.page  ?? 1))
    const limit = Math.min(100, Number(q.limit ?? 20))

    const where: any = {}
    if (q.beneficiary_id) where.beneficiaryId = q.beneficiary_id
    if (q.status)         where.status        = q.status

    const [plans, total] = await prisma.$transaction([
      prisma.carePlan.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          beneficiary:  { select: { id: true, firstName: true, lastName: true } },
          planServices: { include: { carePlan: false } },
          _count:       { select: { appointments: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.carePlan.count({ where }),
    ])

    return reply.send({
      data:       plans,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  })

  // ── GET /:id ───────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const plan = await prisma.carePlan.findUnique({
      where:   { id: req.params.id },
      include: {
        beneficiary:  true,
        planServices: { include: { carePlan: false } },
        _count:       { select: { appointments: true } },
      },
    })
    if (!plan) throw new Error('CARE_PLAN_NOT_FOUND')
    return reply.send(plan)
  })

  // ── POST / — Crea piano ────────────────────────────────

  fastify.post('/', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const caller = req.user as { sub: string }
    const body   = createPlanSchema.parse(req.body)

    // Verifica beneficiario esista
    const bene = await prisma.beneficiary.findUnique({
      where: { id: body.beneficiary_id },
    })
    if (!bene) throw new Error('BENEFICIARY_NOT_FOUND')

    // Verifica nessun piano attivo sovrapposto per lo stesso beneficiario
    if (body.end_date) {
      const overlap = await prisma.carePlan.findFirst({
        where: {
          beneficiaryId: body.beneficiary_id,
          status:        { in: ['draft', 'active'] },
          AND: [
            { startDate: { lte: new Date(body.end_date)   } },
            {
              OR: [
                { endDate: null },
                { endDate: { gte: new Date(body.start_date) } },
              ],
            },
          ],
        },
      })
      if (overlap) {
        return reply.code(409).send({
          error:   'OVERLAPPING_PLAN',
          message: 'Esiste già un piano attivo sovrapposto per questo beneficiario.',
          existing_plan_id: overlap.id,
        })
      }
    }

    const plan = await prisma.carePlan.create({
      data: {
        beneficiaryId:    body.beneficiary_id,
        planCode:         body.plan_code,
        aslAuthorization: body.asl_authorization,
        startDate:        new Date(body.start_date),
        endDate:          body.end_date ? new Date(body.end_date) : undefined,
        weeklyHours:      body.weekly_hours,
        notes:            body.notes,
        createdBy:        caller.sub,
        planServices: {
          create: body.services.map((s) => ({
            serviceTypeId: s.service_type_id,
            frequency:     s.frequency,
            durationMin:   s.duration_min,
            notes:         s.notes,
          })),
        },
      },
      include: { planServices: true },
    })

    return reply.code(201).send(plan)
  })

  // ── PATCH /:id ─────────────────────────────────────────

  fastify.patch<{ Params: { id: string } }>('/:id', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const body = updatePlanSchema.parse(req.body)

    const plan = await prisma.carePlan.findUnique({ where: { id: req.params.id } })
    if (!plan) throw new Error('CARE_PLAN_NOT_FOUND')

    const updated = await prisma.carePlan.update({
      where: { id: req.params.id },
      data: {
        ...(body.end_date          && { endDate:          new Date(body.end_date) }),
        ...(body.weekly_hours      && { weeklyHours:      body.weekly_hours }),
        ...(body.asl_authorization && { aslAuthorization: body.asl_authorization }),
        ...(body.notes             && { notes:            body.notes }),
      },
    })
    return reply.send(updated)
  })

  // ── POST /:id/activate ─────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/:id/activate', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const plan = await prisma.carePlan.findUnique({ where: { id: req.params.id } })
    if (!plan) throw new Error('CARE_PLAN_NOT_FOUND')
    if (plan.status !== 'draft') {
      return reply.code(400).send({ error: 'PLAN_NOT_DRAFT', message: 'Solo piani in bozza possono essere attivati.' })
    }
    await prisma.carePlan.update({
      where: { id: req.params.id },
      data:  { status: 'active' },
    })
    return reply.send({ message: 'Piano attivato.' })
  })

  // ── POST /:id/close ────────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/:id/close', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const body = z.object({
      reason: z.string().optional(),
    }).parse(req.body ?? {})

    const plan = await prisma.carePlan.findUnique({ where: { id: req.params.id } })
    if (!plan) throw new Error('CARE_PLAN_NOT_FOUND')

    await prisma.$transaction([
      prisma.carePlan.update({
        where: { id: req.params.id },
        data:  { status: 'closed', endDate: new Date() },
      }),
      // Cancella appuntamenti futuri non ancora completati
      prisma.appointment.updateMany({
        where: {
          carePlanId:     req.params.id,
          status:         { notIn: ['completed', 'in_progress', 'cancelled'] },
          scheduledStart: { gt: new Date() },
        },
        data: {
          status:             'cancelled',
          cancellationReason: body.reason ?? 'Piano di cura chiuso',
        },
      }),
    ])

    return reply.send({ message: 'Piano chiuso e appuntamenti futuri cancellati.' })
  })

  // ── POST /:id/generate — Genera appuntamenti ───────────

  fastify.post<{ Params: { id: string } }>('/:id/generate', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const caller = req.user as { sub: string }
    const body   = generateSchema.parse(req.body)

    // Validazione range date
    const from = new Date(body.from)
    const to   = new Date(body.to)
    if (from >= to) throw new Error('INVALID_DATE_RANGE')

    const maxRange = 365 * 24 * 60 * 60 * 1000 // 1 anno max
    if (to.getTime() - from.getTime() > maxRange) {
      return reply.code(400).send({
        error:   'RANGE_TOO_LARGE',
        message: 'Il range massimo per la generazione è 1 anno.',
      })
    }

    const result = await plannerService.generateFromPlan({
      carePlanId:  req.params.id,
      operatorId:  body.operator_id,
      from,
      to,
      createdBy:   caller.sub,
      dryRun:      body.dry_run,
    })

    return reply.code(body.dry_run ? 200 : 201).send({
      dry_run:    body.dry_run,
      generated:  result.generated,
      skipped:    result.skipped,
      conflicts:  result.conflicts,
      message:    body.dry_run
        ? `Simulazione: verranno creati ${result.generated} appuntamenti (${result.conflicts} conflitti).`
        : `Creati ${result.generated} appuntamenti (${result.conflicts} conflitti saltati).`,
    })
  })
}
