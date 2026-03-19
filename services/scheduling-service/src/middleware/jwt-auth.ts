// src/middleware/jwt-auth.ts
import type { FastifyRequest, FastifyReply } from 'fastify'

export async function jwtAuthMiddleware(
  req:   FastifyRequest,
  reply: FastifyReply
) {
  try {
    await req.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Token non valido o scaduto.' })
  }
}

// RBAC helper
export function requireRole(roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as { sub: string; role: string } | undefined
    if (!user)                        return reply.code(401).send({ error: 'UNAUTHORIZED' })
    if (!roles.includes(user.role))   return reply.code(403).send({ error: 'FORBIDDEN' })
  }
}
