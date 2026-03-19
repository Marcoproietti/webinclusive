// src/routes/health.routes.ts
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/prisma.js'
import { redis }  from '../db/redis.js'

export async function healthRoutes(fastify: FastifyInstance) {

  // GET /health — liveness
  fastify.get('/', async (_req, reply) => {
    return reply.send({ status: 'ok', service: 'auth-service' })
  })

  // GET /health/ready — readiness (verifica DB e Redis)
  fastify.get('/ready', async (_req, reply) => {
    const checks: Record<string, string> = {}

    // PostgreSQL
    try {
      await prisma.$queryRaw`SELECT 1`
      checks.postgres = 'ok'
    } catch {
      checks.postgres = 'error'
    }

    // Redis
    try {
      await redis.ping()
      checks.redis = 'ok'
    } catch {
      checks.redis = 'error'
    }

    const allOk = Object.values(checks).every((v) => v === 'ok')

    return reply
      .code(allOk ? 200 : 503)
      .send({ status: allOk ? 'ready' : 'degraded', checks })
  })
}
