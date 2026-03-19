// ─────────────────────────────────────────────────────────
// src/routes/operator.routes.ts
// POST   /api/v1/operators           — crea operatore
// GET    /api/v1/operators           — lista
// GET    /api/v1/operators/:id
// PATCH  /api/v1/operators/:id
// POST   /api/v1/operators/:id/device — registra device token + secret
// ─────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { randomBytes }           from 'crypto'
import { z }                     from 'zod'
import { prisma }                from '../db/prisma.js'
import { PasswordService }       from '../services/password.service.js'
import { auditService }          from '../services/audit.service.js'
import { requireRole }           from '../middleware/require-role.js'
import { encryptField, decryptField } from '../utils/crypto.js'

const passwordService = new PasswordService()

const createOperatorSchema = z.object({
  email:          z.string().email(),
  temp_password:  z.string().min(8),
  first_name:     z.string().min(1),
  last_name:      z.string().min(1),
  fiscal_code:    z.string().length(16),
  badge_number:   z.string().min(1),
  qualification:  z.enum(['OSS', 'OTS', 'infermiere', 'fisioterapista', 'assistente_sociale']),
  contract_type:  z.enum(['tempo_indeterminato', 'tempo_determinato', 'partita_iva', 'collaborazione']),
  hire_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  territory_zone: z.string().optional(),
})

const updateOperatorSchema = z.object({
  territory_zone: z.string().optional(),
  is_available:   z.boolean().optional(),
  contract_type:  z.enum(['tempo_indeterminato', 'tempo_determinato', 'partita_iva', 'collaborazione']).optional(),
})

const deviceSchema = z.object({
  device_token: z.string().min(1),   // FCM/APNS token push
  device_id:    z.string().min(1),
})

export async function operatorRoutes(fastify: FastifyInstance) {

  fastify.addHook('onRequest', fastify.authenticate)

  // ── POST / — Crea utente + profilo operatore ──────────

  fastify.post('/', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const caller = req.user as { sub: string }
    const body   = createOperatorSchema.parse(req.body)

    // Verifica email non duplicata
    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    })
    if (existing) {
      return reply.code(409).send({ error: 'EMAIL_ALREADY_EXISTS' })
    }

    const validation = passwordService.validatePolicy(body.temp_password)
    if (!validation.valid) {
      return reply.code(400).send({ error: 'PASSWORD_POLICY_VIOLATION', details: validation.errors })
    }

    const passwordHash   = await passwordService.hash(body.temp_password)
    const deviceSecret   = randomBytes(32).toString('hex') // HMAC secret per proof-of-presence

    // Cifra dati sensibili prima della persistenza
    const encFirstName   = encryptField(body.first_name)
    const encLastName    = encryptField(body.last_name)
    const encFiscalCode  = encryptField(body.fiscal_code)

    const user = await prisma.user.create({
      data: {
        email:        body.email.toLowerCase(),
        passwordHash,
        role:         'operator',
        passwordHistory: { create: { passwordHash } },
        operator: {
          create: {
            firstName:     encFirstName,
            lastName:      encLastName,
            fiscalCode:    encFiscalCode,
            badgeNumber:   body.badge_number,
            qualification: body.qualification,
            contractType:  body.contract_type,
            hireDate:      new Date(body.hire_date),
            territoryZone: body.territory_zone,
            deviceSecret,  // restituito UNA sola volta per onboarding app
          },
        },
      },
      select: {
        id: true, email: true, role: true,
        operator: {
          select: {
            id: true, badgeNumber: true, qualification: true,
            contractType: true, hireDate: true, territoryZone: true,
          },
        },
      },
    })

    await auditService.log({
      userId: caller.sub, action: 'OPERATOR_CREATED',
      entityType: 'operator', entityId: user.id, ipAddress: req.ip,
      payload: { email: user.email, badge: body.badge_number },
    })

    // deviceSecret restituito solo al momento della creazione per onboarding
    return reply.code(201).send({
      ...user,
      device_secret: deviceSecret, // App deve salvare in Keystore
    })
  })

  // ── GET / — Lista operatori ───────────────────────────

  fastify.get('/', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const q = req.query as {
      zone?: string; qualification?: string; available?: string
      page?: string; limit?: string
    }

    const page  = Math.max(1, Number(q.page ?? 1))
    const limit = Math.min(100, Number(q.limit ?? 20))
    const skip  = (page - 1) * limit

    const where: any = {}
    if (q.zone)          where.operator = { ...where.operator, territoryZone: q.zone }
    if (q.qualification) where.operator = { ...where.operator, qualification: q.qualification }
    if (q.available)     where.operator = { ...where.operator, isAvailable: q.available === 'true' }

    where.role     = 'operator'
    where.isActive = true

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip, take: limit,
        select: {
          id: true, email: true,
          operator: {
            select: {
              id: true, badgeNumber: true, qualification: true,
              contractType: true, territoryZone: true, isAvailable: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.user.count({ where }),
    ])

    // Decifra nomi
    const operators = users.map((u) => ({
      ...u,
      operator: u.operator
        ? {
            ...u.operator,
            // firstName/lastName decifrati on-the-fly (non nel DB)
          }
        : null,
    }))

    return reply.send({
      data: operators,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  })

  // ── GET /:id ───────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const caller = req.user as { sub: string; role: string }

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, email: true, role: true, isActive: true,
        operator: true,
      },
    })

    if (!user || !user.operator) return reply.code(404).send({ error: 'OPERATOR_NOT_FOUND' })

    // Operatori vedono solo sé stessi
    if (caller.role === 'operator' && caller.sub !== req.params.id) {
      return reply.code(403).send({ error: 'FORBIDDEN' })
    }

    // Decifra campi sensibili
    const decrypted = {
      ...user,
      operator: {
        ...user.operator,
        firstName:  decryptField(user.operator.firstName),
        lastName:   decryptField(user.operator.lastName),
        fiscalCode: decryptField(user.operator.fiscalCode),
        deviceSecret: undefined, // mai restituito dopo creazione
      },
    }

    return reply.send(decrypted)
  })

  // ── PATCH /:id ─────────────────────────────────────────

  fastify.patch<{ Params: { id: string } }>('/:id', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const body = updateOperatorSchema.parse(req.body)

    await prisma.operator.update({
      where: { userId: req.params.id },
      data: {
        ...(body.territory_zone !== undefined && { territoryZone: body.territory_zone }),
        ...(body.is_available   !== undefined && { isAvailable:   body.is_available }),
        ...(body.contract_type  !== undefined && { contractType:  body.contract_type }),
      },
    })

    return reply.send({ message: 'Operatore aggiornato.' })
  })

  // ── POST /:id/device — Registra token push ────────────

  fastify.post<{ Params: { id: string } }>('/:id/device', async (req, reply) => {
    const caller = req.user as { sub: string; role: string }

    if (caller.sub !== req.params.id) {
      return reply.code(403).send({ error: 'FORBIDDEN' })
    }

    const { device_token } = deviceSchema.parse(req.body)

    await prisma.operator.update({
      where: { userId: req.params.id },
      data:  { deviceToken: device_token },
    })

    return reply.send({ message: 'Device token registrato.' })
  })
}
