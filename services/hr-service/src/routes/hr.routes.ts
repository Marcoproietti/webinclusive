// ─────────────────────────────────────────────────────────
// src/routes/training.routes.ts + quality.routes.ts
// ─────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { z }                    from 'zod'
import { PrismaClient }         from '@prisma/client'
import { env }                  from '../config/env.js'

const prisma = new PrismaClient()

// ── Training routes ───────────────────────────────────────

export async function trainingRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /trainings — catalogo corsi
  fastify.get('/', async (req, reply) => {
    const q = req.query as { mandatory?: string; category?: string }
    const where: any = { isActive: true }
    if (q.mandatory === 'true') where.isMandatory = true
    if (q.category)             where.category    = q.category
    const trainings = await prisma.training.findMany({ where, orderBy: { category: 'asc' } })
    return reply.send(trainings)
  })

  // GET /trainings/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const t = await prisma.training.findUnique({ where: { id: req.params.id }, include: { _count: { select: { completions: true } } } })
    if (!t) return reply.code(404).send({ error: 'TRAINING_NOT_FOUND' })
    return reply.send(t)
  })

  // POST /trainings — crea corso
  fastify.post('/', async (req, reply) => {
    const caller = req.user as { role: string }
    if (!['admin','coordinator'].includes(caller.role)) return reply.code(403).send({ error:'FORBIDDEN' })
    const body = z.object({
      title: z.string(), category: z.enum(['obbligatoria','tecnica','soft_skills','sicurezza','privacy_gdpr','qualita']),
      provider: z.string().optional(), duration_hours: z.number().positive(),
      is_mandatory: z.boolean().default(false), expiry_months: z.number().int().optional(), description: z.string().optional(),
    }).parse(req.body)
    const t = await prisma.training.create({ data: {
      title: body.title, category: body.category, provider: body.provider,
      durationHours: body.duration_hours, isMandatory: body.is_mandatory,
      expiryMonths: body.expiry_months, description: body.description,
    }})
    return reply.code(201).send(t)
  })

  // GET /trainings/operator/:operatorId — corsi operatore + scadenze
  fastify.get<{ Params: { operatorId: string } }>('/operator/:operatorId', async (req, reply) => {
    const completions = await prisma.operatorTraining.findMany({
      where:   { operatorId: req.params.operatorId },
      include: { training: true },
      orderBy: { createdAt: 'desc' },
    })
    // Calcola corsi mancanti obbligatori
    const mandatory = await prisma.training.findMany({ where: { isMandatory: true, isActive: true } })
    const completedIds = new Set(completions.map(c => c.trainingId))
    const missing = mandatory.filter(m => !completedIds.has(m.id))

    // Corsi in scadenza entro 30 giorni
    const now = new Date()
    const soon = new Date(now); soon.setDate(soon.getDate() + 30)
    const expiring = completions.filter(c =>
      c.expiryDate && c.expiryDate > now && c.expiryDate <= soon
    )

    return reply.send({ completions, missing, expiring })
  })

  // POST /trainings/:id/complete — registra completamento
  fastify.post<{ Params: { id: string } }>('/:id/complete', async (req, reply) => {
    const caller = req.user as { sub: string; role: string }
    if (!['admin','coordinator'].includes(caller.role)) return reply.code(403).send({ error:'FORBIDDEN' })
    const body = z.object({
      operator_id:  z.string().uuid(),
      completed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      score:        z.number().optional(),
      passed:       z.boolean().optional(),
    }).parse(req.body)
    const training = await prisma.training.findUnique({ where: { id: req.params.id } })
    if (!training) return reply.code(404).send({ error: 'TRAINING_NOT_FOUND' })

    const completedAt = new Date(body.completed_at)
    const expiryDate  = training.expiryMonths
      ? new Date(completedAt.getFullYear(), completedAt.getMonth() + training.expiryMonths, completedAt.getDate())
      : null

    const c = await prisma.operatorTraining.upsert({
      where: { operatorId_trainingId: { operatorId: body.operator_id, trainingId: req.params.id } },
      update: { completedAt, score: body.score, passed: body.passed, expiryDate },
      create: { operatorId: body.operator_id, trainingId: req.params.id, completedAt, score: body.score, passed: body.passed, expiryDate },
    })
    return reply.code(201).send(c)
  })
}

// ── Quality Document routes ───────────────────────────────

export async function qualityRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /quality/documents
  fastify.get('/documents', async (req, reply) => {
    const q = req.query as { type?: string; status?: string }
    const where: any = {}
    if (q.type)   where.docType = q.type
    if (q.status) where.status  = q.status
    const docs = await prisma.qualityDocument.findMany({
      where, orderBy: [{ docType: 'asc' }, { reviewDate: 'asc' }],
    })
    return reply.send(docs)
  })

  // GET /quality/documents/:id
  fastify.get<{ Params: { id: string } }>('/documents/:id', async (req, reply) => {
    const doc = await prisma.qualityDocument.findUnique({ where: { id: req.params.id } })
    if (!doc) return reply.code(404).send({ error: 'DOCUMENT_NOT_FOUND' })
    return reply.send(doc)
  })

  // POST /quality/documents
  fastify.post('/documents', async (req, reply) => {
    const caller = req.user as { sub: string; role: string }
    if (!['admin','coordinator'].includes(caller.role)) return reply.code(403).send({ error:'FORBIDDEN' })
    const body = z.object({
      doc_code: z.string(), title: z.string(),
      doc_type: z.enum(['procedura','istruzione','modulo','policy','piano','registro']),
      version: z.string(), effective_date: z.string(), review_date: z.string(),
      owner: z.string(), description: z.string().optional(),
    }).parse(req.body)
    const doc = await prisma.qualityDocument.create({ data: {
      docCode: body.doc_code, title: body.title, docType: body.doc_type,
      version: body.version, effectiveDate: new Date(body.effective_date),
      reviewDate: new Date(body.review_date), owner: body.owner,
      description: body.description, createdBy: caller.sub,
    }})
    return reply.code(201).send(doc)
  })

  // PATCH /quality/documents/:id/status
  fastify.patch<{ Params: { id: string } }>('/documents/:id/status', async (req, reply) => {
    const caller = req.user as { role: string }
    if (!['admin'].includes(caller.role)) return reply.code(403).send({ error:'FORBIDDEN' })
    const { status } = z.object({ status: z.enum(['draft','in_review','approved','obsolete']) }).parse(req.body)
    const doc = await prisma.qualityDocument.update({ where: { id: req.params.id }, data: { status } })
    return reply.send(doc)
  })

  // GET /quality/expiring — documenti in scadenza entro 30gg
  fastify.get('/expiring', async (_req, reply) => {
    const now  = new Date()
    const soon = new Date(now); soon.setDate(soon.getDate() + 30)
    const docs = await prisma.qualityDocument.findMany({
      where: { reviewDate: { gte: now, lte: soon }, status: 'approved' },
      orderBy: { reviewDate: 'asc' },
    })
    return reply.send(docs)
  })
}
