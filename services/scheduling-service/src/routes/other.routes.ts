// ─────────────────────────────────────────────────────────
// src/routes/availability.routes.ts
// ─────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { z }                    from 'zod'
import { prisma }               from '../db/prisma.js'
import { availabilityService }  from '../services/availability.service.js'
import { requireRole }          from '../middleware/jwt-auth.js'

export async function availabilityRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /availability/operators — operatori disponibili in fascia oraria
  fastify.get('/operators', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const q = z.object({
      from:          z.string().datetime(),
      to:            z.string().datetime(),
      qualification: z.string(),
      zone:          z.string().optional(),
    }).parse(req.query)

    const operators = await availabilityService.getAvailableOperators({
      from:          new Date(q.from),
      to:            new Date(q.to),
      qualification: q.qualification,
      zone:          q.zone,
    })
    return reply.send(operators)
  })

  // GET /availability/operators/:id/workload
  fastify.get<{ Params: { id: string } }>('/operators/:id/workload', async (req, reply) => {
    const q = z.object({ week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query)
    const wl = await availabilityService.getWeeklyWorkload(req.params.id, new Date(q.week_start))
    return reply.send(wl)
  })

  // POST /availability/exceptions — registra eccezione (ferie, malattia)
  fastify.post('/exceptions', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const body = z.object({
      operator_id:   z.string().uuid(),
      dates:         z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
      is_available:  z.boolean().default(false),
      reason:        z.string().optional(),
    }).parse(req.body)

    await prisma.operatorAvailability.createMany({
      data: body.dates.map((d) => ({
        operatorId:   body.operator_id,
        date:         new Date(d),
        isAvailable:  body.is_available,
        reason:       body.reason,
      })),
      skipDuplicates: true,
    })
    return reply.code(201).send({ message: `${body.dates.length} eccezioni registrate.` })
  })
}

// ─────────────────────────────────────────────────────────
// src/routes/service-type.routes.ts
// ─────────────────────────────────────────────────────────

export async function serviceTypeRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/', async (_req, reply) => {
    const types = await prisma.serviceType.findMany({
      where:   { isActive: true },
      orderBy: { category: 'asc' },
    })
    return reply.send(types)
  })

  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const t = await prisma.serviceType.findUnique({ where: { id: req.params.id } })
    if (!t) throw new Error('SERVICE_TYPE_NOT_FOUND')
    return reply.send(t)
  })

  fastify.post('/', {
    onRequest: [requireRole(['admin'])],
  }, async (req, reply) => {
    const body = z.object({
      code:                  z.string().max(20),
      name:                  z.string().max(100),
      category:              z.enum(['infermieristica','riabilitativa','assistenziale','sociale','medica']),
      required_qualification:z.enum(['OSS','OTS','infermiere','fisioterapista','assistente_sociale']),
      default_duration_min:  z.number().int().positive(),
      is_billable:           z.boolean().default(true),
      description:           z.string().optional(),
    }).parse(req.body)

    const t = await prisma.serviceType.create({
      data: {
        code:                  body.code,
        name:                  body.name,
        category:              body.category,
        requiredQualification: body.required_qualification,
        defaultDurationMin:    body.default_duration_min,
        isBillable:            body.is_billable,
        description:           body.description,
      },
    })
    return reply.code(201).send(t)
  })
}

// ─────────────────────────────────────────────────────────
// src/routes/message.routes.ts
// ─────────────────────────────────────────────────────────

import { encryptField, decryptField } from '../utils/crypto.js'

export async function messageRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /messages — inbox utente autenticato
  fastify.get('/', async (req, reply) => {
    const caller = req.user as { sub: string }
    const q = req.query as { unread_only?: string; page?: string; limit?: string }

    const page  = Math.max(1, Number(q.page ?? 1))
    const limit = Math.min(50, Number(q.limit ?? 20))
    const where: any = { receiverUserId: caller.sub }
    if (q.unread_only === 'true') where.isRead = false

    const [msgs, total] = await prisma.$transaction([
      prisma.message.findMany({
        where, skip: (page-1)*limit, take: limit,
        orderBy: { sentAt: 'desc' },
      }),
      prisma.message.count({ where }),
    ])

    // Decifra i body
    const decrypted = msgs.map((m) => ({
      ...m,
      body: decryptField(m.body),
    }))

    return reply.send({ data: decrypted, pagination: { page, limit, total } })
  })

  // POST /messages — invia messaggio
  fastify.post('/', async (req, reply) => {
    const caller = req.user as { sub: string }
    const body = z.object({
      receiver_user_id: z.string().uuid().optional(),
      channel:          z.enum(['operator_co', 'caregiver_co', 'broadcast']),
      body:             z.string().min(1).max(5000),
    }).parse(req.body)

    const msg = await prisma.message.create({
      data: {
        senderUserId:   caller.sub,
        receiverUserId: body.receiver_user_id,
        channel:        body.channel,
        body:           encryptField(body.body),
      },
    })
    return reply.code(201).send({ ...msg, body: body.body })
  })

  // PATCH /messages/:id/read
  fastify.patch<{ Params: { id: string } }>('/:id/read', async (req, reply) => {
    const caller = req.user as { sub: string }
    await prisma.message.updateMany({
      where: { id: req.params.id, receiverUserId: caller.sub },
      data:  { isRead: true, readAt: new Date() },
    })
    return reply.send({ message: 'Marcato come letto.' })
  })

  // PATCH /messages/read-all
  fastify.patch('/read-all', async (req, reply) => {
    const caller = req.user as { sub: string }
    const { count } = await prisma.message.updateMany({
      where: { receiverUserId: caller.sub, isRead: false },
      data:  { isRead: true, readAt: new Date() },
    })
    return reply.send({ marked: count })
  })
}

// ─────────────────────────────────────────────────────────
// src/routes/health.routes.ts
// ─────────────────────────────────────────────────────────

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_req, reply) =>
    reply.send({ status: 'ok', service: 'scheduling-service' })
  )

  fastify.get('/ready', async (_req, reply) => {
    const checks: Record<string, string> = {}
    try { await prisma.$queryRaw`SELECT 1`; checks.postgres = 'ok' }
    catch { checks.postgres = 'error' }
    try { await redis.ping(); checks.redis = 'ok' }
    catch { checks.redis = 'error' }
    const ok = Object.values(checks).every((v) => v === 'ok')
    return reply.code(ok ? 200 : 503).send({ status: ok ? 'ready' : 'degraded', checks })
  })
}

// Import mancante per healthRoutes
import { redis } from '../db/redis.js'
