// src/middleware/require-role.ts
// RBAC middleware: controlla ruolo nel JWT payload

import type { FastifyRequest, FastifyReply } from 'fastify'

export function requireRole(allowedRoles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as { sub: string; role: string } | undefined

    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED' })
    }

    if (!allowedRoles.includes(user.role)) {
      return reply.code(403).send({
        error:   'FORBIDDEN',
        message: `Accesso riservato a: ${allowedRoles.join(', ')}`,
      })
    }
  }
}
