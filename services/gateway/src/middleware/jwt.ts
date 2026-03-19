// ─────────────────────────────────────────────────────────
// src/middleware/jwt.ts
// Verifica JWT su ogni richiesta non pubblica.
// Inietta header x-user-id, x-user-role nel proxy request
// così i microservizi downstream non devono ri-verificare.
// ─────────────────────────────────────────────────────────

import type { FastifyRequest, FastifyReply } from 'fastify'
import { PUBLIC_PREFIXES } from '../config/routes.js'

export async function jwtMiddleware(
  req:   FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Controlla se il percorso è pubblico
  const isPublic = PUBLIC_PREFIXES.some((p) => req.url.startsWith(p))
  if (isPublic) return

  // Percorso WebSocket CO — gestisce il proprio auth
  if (req.url.startsWith('/ws/')) return

  try {
    await req.jwtVerify()

    // Inietta identità nel proxy request (header X-)
    const user = req.user as { sub: string; role: string; jti: string }
    req.headers['x-user-id']   = user.sub
    req.headers['x-user-role'] = user.role
    req.headers['x-user-jti']  = user.jti
  } catch (err: any) {
    return reply.code(401).send({
      error:   'UNAUTHORIZED',
      message: 'Token non valido o scaduto.',
    })
  }
}
