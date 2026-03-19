// ─────────────────────────────────────────────────────────
// src/middleware/error-handler.ts
// Handler globale errori Fastify
// ─────────────────────────────────────────────────────────

import type { FastifyRequest, FastifyReply, FastifyError } from 'fastify'
import { ZodError } from 'zod'

export function errorHandler(
  error: FastifyError,
  req:   FastifyRequest,
  reply: FastifyReply
) {
  const log = req.log

  // ── Zod validation error ──────────────────────────────
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error:   'VALIDATION_ERROR',
      message: 'Dati non validi.',
      details: error.errors.map((e) => ({
        field:   e.path.join('.'),
        message: e.message,
      })),
    })
  }

  // ── Errori applicativi noti ───────────────────────────
  const knownErrors: Record<string, { code: number; message: string }> = {
    INVALID_CREDENTIALS:     { code: 401, message: 'Email o password non corretti.'             },
    INVALID_REFRESH_TOKEN:   { code: 401, message: 'Sessione scaduta. Effettuare il login.'     },
    USER_INACTIVE:           { code: 403, message: 'Account disabilitato.'                       },
    MFA_NOT_ENABLED:         { code: 400, message: 'MFA non configurata su questo account.'     },
    MFA_INVALID_CODE:        { code: 401, message: 'Codice TOTP non valido o scaduto.'          },
    MFA_SETUP_EXPIRED:       { code: 400, message: 'Setup MFA scaduto. Ripetere la procedura.'  },
    MFA_NOT_PENDING:         { code: 400, message: 'Nessun login MFA pendente.'                  },
    PASSWORD_RECENTLY_USED:  { code: 400, message: 'Password usata di recente.'                 },
    EMAIL_ALREADY_EXISTS:    { code: 409, message: 'Email già registrata.'                       },
    OPERATOR_NOT_FOUND:      { code: 404, message: 'Operatore non trovato.'                     },
    USER_NOT_FOUND:          { code: 404, message: 'Utente non trovato.'                        },
  }

  if (error.message in knownErrors) {
    const { code, message } = knownErrors[error.message]
    return reply.code(code).send({ error: error.message, message })
  }

  // ── Fastify schema validation (JSON Schema nativo) ────
  if (error.validation) {
    return reply.code(400).send({
      error:   'VALIDATION_ERROR',
      message: 'Richiesta non valida.',
      details: error.validation,
    })
  }

  // ── JWT errors ────────────────────────────────────────
  if (error.statusCode === 401) {
    return reply.code(401).send({
      error:   'UNAUTHORIZED',
      message: 'Token non valido o scaduto.',
    })
  }

  if (error.statusCode === 429) {
    return reply.code(429).send({
      error:   'TOO_MANY_REQUESTS',
      message: error.message,
    })
  }

  // ── Prisma: record non trovato ────────────────────────
  if ((error as any).code === 'P2025') {
    return reply.code(404).send({
      error:   'NOT_FOUND',
      message: 'Risorsa non trovata.',
    })
  }

  // ── Prisma: unique constraint violation ───────────────
  if ((error as any).code === 'P2002') {
    return reply.code(409).send({
      error:   'DUPLICATE_ENTRY',
      message: 'Esiste già una risorsa con questi dati.',
    })
  }

  // ── Errore generico 500 ───────────────────────────────
  log.error({ err: error, url: req.url, method: req.method }, 'Unhandled error')

  const isProd = process.env.NODE_ENV === 'production'
  return reply.code(500).send({
    error:   'INTERNAL_SERVER_ERROR',
    message: isProd
      ? 'Errore interno del server. Contattare l\'amministratore.'
      : error.message,
    ...(isProd ? {} : { stack: error.stack }),
  })
}
