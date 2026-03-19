// src/middleware/audit.ts
// Log strutturato di ogni richiesta (dopo risposta)
import type { FastifyRequest, FastifyReply } from 'fastify'

export async function auditMiddleware(
  req:   FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skippa health checks e metriche
  if (req.url === '/health' || req.url === '/metrics') return

  const user = req.user as { sub?: string; role?: string } | undefined
  req.log.info({
    type:      'access',
    method:    req.method,
    url:       req.url,
    status:    reply.statusCode,
    userId:    user?.sub   ?? 'anonymous',
    role:      user?.role  ?? 'none',
    ip:        req.headers['x-forwarded-for'] ?? req.ip,
    userAgent: req.headers['user-agent'],
    ms:        reply.elapsedTime,
  })
}
