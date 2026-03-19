// src/index.ts — wb-service (rete Docker ISOLATA)
import Fastify   from 'fastify'
import cors      from '@fastify/cors'
import helmet    from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt       from '@fastify/jwt'
import { env }   from './config/env.js'
import { prisma } from './db/prisma.js'
import { wbRoutes } from './routes/wb.routes.js'

export async function buildApp() {
  const app = Fastify({ logger: env.NODE_ENV !== 'test', trustProxy: true })

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors,   { origin: env.ALLOWED_ORIGINS.split(','), credentials: true })
  await app.register(rateLimit, {
    max: 20, timeWindow: '1 minute', // stretto per whistleblowing
    keyGenerator: (req) => (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip,
  })
  await app.register(jwt, { secret: env.JWT_ACCESS_SECRET, verify: { issuer: 'webinclusive-auth' } })

  // Decorator authenticate (opzionale — alcune route sono pubbliche)
  app.decorate('authenticate', async (req: any, reply: any) => {
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }) }
  })

  app.setErrorHandler((err, req, reply) => {
    const known: Record<string,number> = { REPORT_NOT_FOUND: 404, FORBIDDEN: 403 }
    if (err.message in known) return reply.code(known[err.message]).send({ error: err.message })
    req.log?.error({ err })
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' })
  })

  app.get('/health', async (_req, reply) => reply.send({ status:'ok', service:'wb-service' }))
  app.get('/health/ready', async (_req, reply) => {
    try { await prisma.$queryRaw`SELECT 1`; return reply.send({ status:'ready', checks:{ postgres:'ok' } }) }
    catch { return reply.code(503).send({ status:'degraded', checks:{ postgres:'error' } }) }
  })

  await app.register(wbRoutes, { prefix: '/api/v1/wb' })

  const shutdown = async () => {
    await app.close(); await prisma.$disconnect(); process.exit(0)
  }
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown)
  return app
}

const app = await buildApp()
await app.listen({ port: env.PORT, host: '0.0.0.0' })
app.log.info(`wb-service avviato su porta ${env.PORT} (rete isolata)`)
