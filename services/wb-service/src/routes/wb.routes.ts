// ─────────────────────────────────────────────────────────
// src/routes/wb.routes.ts
// POST /api/v1/wb/reports            — PUBBLICO (anonimo)
// GET  /api/v1/wb/reports/track/:code — PUBBLICO (solo tracking)
// GET  /api/v1/wb/reports            — [admin/auditor]
// GET  /api/v1/wb/reports/:id        — [admin/auditor]
// PATCH /api/v1/wb/reports/:id/status — [admin/auditor]
// POST /api/v1/wb/reports/:id/message — [admin/auditor] risposta
// GET  /api/v1/wb/reports/:id/access-log — [admin]
// ─────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { z }                    from 'zod'
import { prisma }               from '../db/prisma.js'
import { enc, dec, hmacReporter, generateTrackingCode } from '../utils/crypto.js'

// ── Schemi ────────────────────────────────────────────────

const submitSchema = z.object({
  category: z.enum([
    'violazione_normativa','violazione_codice_etico','corruzione',
    'frode','discriminazione','sicurezza_lavoro','privacy_gdpr','altro',
  ]),
  description:    z.string().min(20).max(10000),
  reported_entity:z.string().max(500).optional(),
  incident_date:  z.string().max(50).optional(),
  evidence:       z.string().max(5000).optional(),
  is_anonymous:   z.boolean().default(true),
  // Opzionale: contatto cifrato per follow-up (email o nickname)
  // Non salvato in chiaro MAI
  reporter_contact: z.string().max(200).optional(),
})

const updateStatusSchema = z.object({
  status: z.enum(['received','under_review','awaiting_info','closed_founded','closed_unfounded','closed_archived']),
  note:   z.string().max(2000).optional(),
})

// ── Helper: log accesso ───────────────────────────────────

async function logWbAccess(params: {
  reportId:    string
  handlerRole: string
  action:      string
  ipAddress?:  string
}): Promise<void> {
  prisma.wbAccessLog.create({ data: params }).catch(console.error)
}

// ── Route plugin ──────────────────────────────────────────

export async function wbRoutes(fastify: FastifyInstance) {

  // ── POST /reports — Invia segnalazione (PUBBLICO) ──────

  fastify.post('/reports', async (req, reply) => {
    const body = submitSchema.parse(req.body)

    const trackingCode   = generateTrackingCode()
    const reporterHash   = body.reporter_contact && !body.is_anonymous
      ? hmacReporter(body.reporter_contact)
      : null

    const report = await prisma.wbReport.create({
      data: {
        trackingCode,
        category:      body.category,
        isAnonymous:   body.is_anonymous,
        description:   enc(body.description),
        reportedEntity:body.reported_entity ? enc(body.reported_entity) : null,
        incidentDate:  body.incident_date   ? enc(body.incident_date)   : null,
        evidence:      body.evidence        ? enc(body.evidence)         : null,
        reporterHash,
      },
    })

    // Log ricezione
    await logWbAccess({
      reportId:    report.id,
      handlerRole: 'system',
      action:      'RECEIVED',
      ipAddress:   req.ip,
    })

    // Risposta: solo tracking code — NO id interno
    return reply.code(201).send({
      tracking_code: trackingCode,
      message:       'Segnalazione ricevuta. Conserva il codice di tracking per seguire lo stato.',
      submitted_at:  report.submittedAt.toISOString(),
    })
  })

  // ── GET /reports/track/:code — Stato segnalazione (PUBBLICO) ─

  fastify.get<{ Params: { code: string } }>(
    '/reports/track/:code',
    async (req, reply) => {
      const report = await prisma.wbReport.findUnique({
        where:   { trackingCode: req.params.code.toUpperCase() },
        select: {
          status:      true,
          category:    true,
          isAnonymous: true,
          submittedAt: true,
          updatedAt:   true,
          updates: {
            select: { newStatus: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
          },
        },
      })

      if (!report) {
        return reply.code(404).send({
          error:   'REPORT_NOT_FOUND',
          message: 'Nessuna segnalazione trovata con questo codice.',
        })
      }

      return reply.send({
        status:       report.status,
        category:     report.category,
        is_anonymous: report.isAnonymous,
        submitted_at: report.submittedAt.toISOString(),
        last_update:  report.updatedAt.toISOString(),
        history:      report.updates.map((u) => ({
          status:     u.newStatus,
          updated_at: u.updatedAt.toISOString(),
        })),
      })
    }
  )

  // ── GET /reports — Lista [admin/auditor] ───────────────

  fastify.get('/reports', {
    onRequest: [fastify.authenticate],
  }, async (req, reply) => {
    const caller = req.user as { sub: string; role: string }
    if (!['admin','auditor'].includes(caller.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' })
    }

    const q     = req.query as { status?: string; category?: string; page?: string; limit?: string }
    const page  = Math.max(1, Number(q.page ?? 1))
    const limit = Math.min(50, Number(q.limit ?? 20))

    const where: any = {}
    if (q.status)   where.status   = q.status
    if (q.category) where.category = q.category

    const [reports, total] = await prisma.$transaction([
      prisma.wbReport.findMany({
        where,
        skip:    (page-1)*limit,
        take:    limit,
        select: {
          id: true, trackingCode: true, category: true, status: true,
          isAnonymous: true, submittedAt: true, updatedAt: true,
          _count: { select: { updates: true } },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.wbReport.count({ where }),
    ])

    await logWbAccess({ reportId: 'LIST', handlerRole: caller.role, action: 'LIST', ipAddress: req.ip })

    return reply.send({
      data:       reports,
      pagination: { page, limit, total, pages: Math.ceil(total/limit) },
    })
  })

  // ── GET /reports/:id — Dettaglio [admin/auditor] ───────

  fastify.get<{ Params: { id: string } }>('/reports/:id', {
    onRequest: [fastify.authenticate],
  }, async (req, reply) => {
    const caller = req.user as { sub: string; role: string }
    if (!['admin','auditor'].includes(caller.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' })
    }

    const report = await prisma.wbReport.findUnique({
      where:   { id: req.params.id },
      include: { updates: { orderBy: { updatedAt: 'asc' } } },
    })
    if (!report) return reply.code(404).send({ error: 'REPORT_NOT_FOUND' })

    // Decifra campi
    const decrypted = {
      id:              report.id,
      trackingCode:    report.trackingCode,
      category:        report.category,
      status:          report.status,
      isAnonymous:     report.isAnonymous,
      description:     dec(report.description),
      reportedEntity:  report.reportedEntity  ? dec(report.reportedEntity)  : null,
      incidentDate:    report.incidentDate     ? dec(report.incidentDate)    : null,
      evidence:        report.evidence         ? dec(report.evidence)         : null,
      submittedAt:     report.submittedAt,
      updates: report.updates.map((u) => ({
        id:         u.id,
        newStatus:  u.newStatus,
        note:       u.note ? dec(u.note) : null,
        handlerRole:u.handlerRole,
        updatedAt:  u.updatedAt,
      })),
    }

    await logWbAccess({ reportId: report.id, handlerRole: caller.role, action: 'READ', ipAddress: req.ip })
    return reply.send(decrypted)
  })

  // ── PATCH /reports/:id/status — Aggiorna stato ─────────

  fastify.patch<{ Params: { id: string } }>('/reports/:id/status', {
    onRequest: [fastify.authenticate],
  }, async (req, reply) => {
    const caller = req.user as { sub: string; role: string }
    if (!['admin'].includes(caller.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' })
    }

    const body   = updateStatusSchema.parse(req.body)
    const report = await prisma.wbReport.findUnique({ where: { id: req.params.id } })
    if (!report) return reply.code(404).send({ error: 'REPORT_NOT_FOUND' })

    await prisma.$transaction([
      prisma.wbReport.update({
        where: { id: req.params.id },
        data:  { status: body.status },
      }),
      prisma.wbReportUpdate.create({
        data: {
          reportId:    req.params.id,
          newStatus:   body.status,
          note:        body.note ? enc(body.note) : null,
          handlerRole: caller.role,
        },
      }),
    ])

    await logWbAccess({ reportId: req.params.id, handlerRole: caller.role, action: 'UPDATE_STATUS', ipAddress: req.ip })
    return reply.send({ message: `Stato aggiornato: ${body.status}` })
  })

  // ── GET /reports/:id/access-log — Audit [admin] ────────

  fastify.get<{ Params: { id: string } }>('/reports/:id/access-log', {
    onRequest: [fastify.authenticate],
  }, async (req, reply) => {
    const caller = req.user as { role: string }
    if (caller.role !== 'admin') return reply.code(403).send({ error: 'FORBIDDEN' })

    const logs = await prisma.wbAccessLog.findMany({
      where:   { reportId: req.params.id },
      orderBy: { accessedAt: 'desc' },
    })
    return reply.send(logs)
  })

  // ── GET /stats — Statistiche aggregate [admin] ─────────

  fastify.get('/stats', {
    onRequest: [fastify.authenticate],
  }, async (req, reply) => {
    const caller = req.user as { role: string }
    if (!['admin','auditor'].includes(caller.role)) return reply.code(403).send({ error: 'FORBIDDEN' })

    const [byStatus, byCategory, total] = await prisma.$transaction([
      prisma.wbReport.groupBy({ by: ['status'], _count: true }),
      prisma.wbReport.groupBy({ by: ['category'], _count: true }),
      prisma.wbReport.count(),
    ])

    return reply.send({ total, byStatus, byCategory })
  })
}
