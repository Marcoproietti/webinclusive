// src/middleware/error-handler.ts
import type { FastifyRequest, FastifyReply, FastifyError } from 'fastify'
import { ZodError } from 'zod'

export function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof ZodError) {
    return reply.code(400).send({
      error:   'VALIDATION_ERROR',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    })
  }

  const known: Record<string, number> = {
    BENEFICIARY_NOT_FOUND:   404,
    CARE_PLAN_NOT_FOUND:     404,
    APPOINTMENT_NOT_FOUND:   404,
    SHIFT_NOT_FOUND:         404,
    SERVICE_TYPE_NOT_FOUND:  404,
    OVERLAPPING_APPOINTMENT: 409,
    OPERATOR_UNAVAILABLE:    409,
    QUALIFICATION_MISMATCH:  422,
    PLAN_NOT_ACTIVE:         422,
    INVALID_DATE_RANGE:      400,
  }

  if (err.message in known) {
    return reply.code(known[err.message]).send({ error: err.message })
  }
  if ((err as any).code === 'P2025') return reply.code(404).send({ error: 'NOT_FOUND' })
  if ((err as any).code === 'P2002') return reply.code(409).send({ error: 'DUPLICATE_ENTRY' })

  req.log?.error({ err }, 'Unhandled error')
  return reply.code(500).send({
    error: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'Errore interno.' : err.message,
  })
}
