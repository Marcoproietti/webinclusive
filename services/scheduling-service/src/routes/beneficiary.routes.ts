// ─────────────────────────────────────────────────────────
// src/routes/beneficiary.routes.ts
// ─────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { z }                    from 'zod'
import { prisma }               from '../db/prisma.js'
import { requireRole }          from '../middleware/jwt-auth.js'
import { encryptField, searchableHash } from '../utils/crypto.js'

const createBeneSchema = z.object({
  fiscal_code:            z.string().length(16),
  first_name:             z.string().min(1),
  last_name:              z.string().min(1),
  date_of_birth:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  address:                z.string().min(1),
  phone:                  z.string().optional(),
  district_code:          z.string().optional(),
  asl_code:               z.string().optional(),
  assigned_coordinator_id:z.string().uuid().optional(),
  intake_date:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:                  z.string().optional(),
})

export async function beneficiaryRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/', {
    onRequest: [requireRole(['admin', 'coordinator', 'operator'])],
  }, async (req, reply) => {
    const q = req.query as {
      status?: string; coordinator_id?: string; search?: string
      page?: string; limit?: string
    }
    const page  = Math.max(1, Number(q.page ?? 1))
    const limit = Math.min(100, Number(q.limit ?? 20))
    const where: any = {}
    if (q.status)         where.status               = q.status
    if (q.coordinator_id) where.assignedCoordinatorId = q.coordinator_id
    if (q.search) {
      // Ricerca per hash del CF (deterministico)
      where.fiscalCodeHash = searchableHash(q.search)
    }
    const [benes, total] = await prisma.$transaction([
      prisma.beneficiary.findMany({
        where, skip: (page-1)*limit, take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.beneficiary.count({ where }),
    ])
    return reply.send({ data: benes, pagination: { page, limit, total } })
  })

  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const b = await prisma.beneficiary.findUnique({ where: { id: req.params.id } })
    if (!b) throw new Error('BENEFICIARY_NOT_FOUND')
    return reply.send(b)
  })

  fastify.post('/', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const body = createBeneSchema.parse(req.body)
    const hash = searchableHash(body.fiscal_code)
    // Verifica unicità CF
    const existing = await prisma.beneficiary.findUnique({ where: { fiscalCodeHash: hash } })
    if (existing) return reply.code(409).send({ error: 'FISCAL_CODE_EXISTS' })

    const b = await prisma.beneficiary.create({
      data: {
        fiscalCodeHash:        hash,
        firstName:             encryptField(body.first_name),
        lastName:              encryptField(body.last_name),
        dateOfBirth:           encryptField(body.date_of_birth),
        address:               encryptField(body.address),
        phone:                 body.phone ? encryptField(body.phone) : undefined,
        districtCode:          body.district_code,
        aslCode:               body.asl_code,
        assignedCoordinatorId: body.assigned_coordinator_id,
        intakeDate:            new Date(body.intake_date),
        notes:                 body.notes ? encryptField(body.notes) : undefined,
      },
    })
    return reply.code(201).send(b)
  })

  fastify.patch<{ Params: { id: string } }>('/:id', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const body = createBeneSchema.partial().parse(req.body)
    const data: any = {}
    if (body.first_name)              data.firstName             = encryptField(body.first_name)
    if (body.last_name)               data.lastName              = encryptField(body.last_name)
    if (body.address)                 data.address               = encryptField(body.address)
    if (body.phone)                   data.phone                 = encryptField(body.phone)
    if (body.district_code)           data.districtCode          = body.district_code
    if (body.asl_code)                data.aslCode               = body.asl_code
    if (body.assigned_coordinator_id) data.assignedCoordinatorId = body.assigned_coordinator_id
    if (body.notes)                   data.notes                 = encryptField(body.notes)
    const b = await prisma.beneficiary.update({ where: { id: req.params.id }, data })
    return reply.send(b)
  })
}
