// ─────────────────────────────────────────────────────────
// src/routes/user.routes.ts
// GET    /api/v1/users
// GET    /api/v1/users/:id
// POST   /api/v1/users
// PATCH  /api/v1/users/:id
// PATCH  /api/v1/users/:id/password
// DELETE /api/v1/users/:id  (soft delete → isActive = false)
// ─────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { z }                    from 'zod'
import { prisma }               from '../db/prisma.js'
import { PasswordService }      from '../services/password.service.js'
import { auditService }         from '../services/audit.service.js'
import { requireRole }          from '../middleware/require-role.js'

const passwordService = new PasswordService()

// ── Schema ────────────────────────────────────────────────

const createUserSchema = z.object({
  email:         z.string().email(),
  temp_password: z.string().min(8),
  role:          z.enum(['admin', 'coordinator', 'operator', 'caregiver', 'auditor']),
})

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role:     z.enum(['admin', 'coordinator', 'operator', 'caregiver', 'auditor']).optional(),
})

const changePasswordSchema = z.object({
  old_password: z.string().min(1),
  new_password: z.string().min(8),
})

// ── Routes ────────────────────────────────────────────────

export async function userRoutes(fastify: FastifyInstance) {

  // Tutti gli endpoint richiedono JWT
  fastify.addHook('onRequest', fastify.authenticate)

  // ── GET /users ─────────────────────────────────────────

  fastify.get('/', {
    onRequest: [requireRole(['admin', 'coordinator'])],
  }, async (req, reply) => {
    const query = req.query as {
      role?: string; isActive?: string
      page?: string; limit?: string
    }

    const page  = Math.max(1, Number(query.page  ?? 1))
    const limit = Math.min(100, Number(query.limit ?? 20))
    const skip  = (page - 1) * limit

    const where: any = {}
    if (query.role)     where.role     = query.role
    if (query.isActive) where.isActive = query.isActive === 'true'

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true, email: true, role: true,
          isActive: true, lastLoginAt: true, createdAt: true,
          operator: {
            select: {
              badgeNumber: true, qualification: true, territoryZone: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ])

    return reply.send({
      data: users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  })

  // ── GET /users/:id ─────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const caller = req.user as { sub: string; role: string }

    // Ogni utente può vedere solo sé stesso, admin vede tutti
    if (caller.sub !== req.params.id && caller.role !== 'admin') {
      return reply.code(403).send({ error: 'FORBIDDEN' })
    }

    const user = await prisma.user.findUnique({
      where:  { id: req.params.id },
      select: {
        id: true, email: true, role: true,
        isActive: true, mfaEnabled: true,
        lastLoginAt: true, createdAt: true,
        operator: true,
        caregiver: { select: { id: true, relationship: true } },
      },
    })

    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' })
    return reply.send(user)
  })

  // ── POST /users ────────────────────────────────────────

  fastify.post('/', {
    onRequest: [requireRole(['admin'])],
  }, async (req, reply) => {
    const caller = req.user as { sub: string }
    const body   = createUserSchema.parse(req.body)

    // Verifica email non duplicata
    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    })
    if (existing) {
      return reply.code(409).send({
        error:   'EMAIL_ALREADY_EXISTS',
        message: 'Esiste già un utente con questa email.',
      })
    }

    // Valida e hasha password temporanea
    const validation = passwordService.validatePolicy(body.temp_password)
    if (!validation.valid) {
      return reply.code(400).send({
        error:   'PASSWORD_POLICY_VIOLATION',
        details: validation.errors,
      })
    }

    const passwordHash = await passwordService.hash(body.temp_password)

    const user = await prisma.user.create({
      data: {
        email:        body.email.toLowerCase(),
        passwordHash,
        role:         body.role,
        // Salva anche in storico
        passwordHistory: {
          create: { passwordHash },
        },
      },
      select: {
        id: true, email: true, role: true, isActive: true, createdAt: true,
      },
    })

    await auditService.log({
      userId:     caller.sub,
      action:     'USER_CREATED',
      entityType: 'user',
      entityId:   user.id,
      ipAddress:  req.ip,
      payload:    { email: user.email, role: user.role },
    })

    return reply.code(201).send(user)
  })

  // ── PATCH /users/:id ───────────────────────────────────

  fastify.patch<{ Params: { id: string } }>('/:id', {
    onRequest: [requireRole(['admin'])],
  }, async (req, reply) => {
    const caller = req.user as { sub: string }
    const body   = updateUserSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' })

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data:  body,
      select: { id: true, email: true, role: true, isActive: true },
    })

    await auditService.log({
      userId: caller.sub, action: 'USER_UPDATED',
      entityType: 'user', entityId: req.params.id,
      ipAddress: req.ip, payload: body,
    })

    return reply.send(updated)
  })

  // ── PATCH /users/:id/password ──────────────────────────

  fastify.patch<{ Params: { id: string } }>('/:id/password', async (req, reply) => {
    const caller = req.user as { sub: string; role: string }
    const body   = changePasswordSchema.parse(req.body)

    // Solo l'utente stesso o un admin può cambiare la password
    if (caller.sub !== req.params.id && caller.role !== 'admin') {
      return reply.code(403).send({ error: 'FORBIDDEN' })
    }

    const user = await prisma.user.findUnique({
      where:  { id: req.params.id },
      select: { passwordHash: true },
    })
    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' })

    // Verifica vecchia password (se non admin)
    if (caller.role !== 'admin') {
      const oldOk = await passwordService.verify(body.old_password, user.passwordHash)
      if (!oldOk) {
        return reply.code(401).send({
          error:   'INVALID_OLD_PASSWORD',
          message: 'La password attuale non è corretta.',
        })
      }
    }

    try {
      await passwordService.updatePassword(req.params.id, body.new_password)
    } catch (err: any) {
      if (err.message === 'PASSWORD_POLICY_VIOLATION') {
        return reply.code(400).send({ error: 'PASSWORD_POLICY_VIOLATION', details: err.details })
      }
      if (err.message === 'PASSWORD_RECENTLY_USED') {
        return reply.code(400).send({
          error:   'PASSWORD_RECENTLY_USED',
          message: 'La password è stata usata di recente. Sceglierne una diversa.',
        })
      }
      throw err
    }

    await auditService.log({
      userId: caller.sub, action: 'PASSWORD_CHANGED',
      entityType: 'user', entityId: req.params.id, ipAddress: req.ip,
    })

    return reply.send({ message: 'Password aggiornata con successo.' })
  })

  // ── DELETE /users/:id (soft) ───────────────────────────

  fastify.delete<{ Params: { id: string } }>('/:id', {
    onRequest: [requireRole(['admin'])],
  }, async (req, reply) => {
    const caller = req.user as { sub: string }

    await prisma.user.update({
      where: { id: req.params.id },
      data:  { isActive: false },
    })

    await auditService.log({
      userId: caller.sub, action: 'USER_DEACTIVATED',
      entityType: 'user', entityId: req.params.id, ipAddress: req.ip,
    })

    return reply.send({ message: 'Utente disattivato.' })
  })
}
