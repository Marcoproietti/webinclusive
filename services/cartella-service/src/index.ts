// src/index.ts — cartella-service
import Fastify    from 'fastify'
import cors       from '@fastify/cors'
import helmet     from '@fastify/helmet'
import rateLimit  from '@fastify/rate-limit'
import jwt        from '@fastify/jwt'
import multipart  from '@fastify/multipart'
import { env }    from './config/env.js'
import { prisma, redis } from './db/clients.js'
import { clinicalRoutes } from './routes/clinical.routes.js'

export async function buildApp() {
  const app = Fastify({ logger: env.NODE_ENV !== 'test', trustProxy: true })
  await app.register(helmet,   { contentSecurityPolicy: false })
  await app.register(cors,     { origin: env.ALLOWED_ORIGINS.split(','), credentials: true })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(jwt,      { secret: env.JWT_ACCESS_SECRET, verify: { issuer: 'webinclusive-auth' } })
  await app.register(multipart, { limits: { fileSize: env.MAX_ATTACHMENT_SIZE } })

  app.decorate('authenticate', async (req: any, reply: any) => {
    try { await req.jwtVerify() }
    catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }) }
  })

  app.setErrorHandler((err, req, reply) => {
    const known: Record<string,number> = {
      CLINICAL_RECORD_NOT_FOUND: 404, ATTACHMENT_NOT_FOUND: 404,
      NOTE_ALREADY_EXISTS: 409, FILE_TOO_LARGE: 413,
      UNSUPPORTED_MIME_TYPE: 415, FORBIDDEN: 403,
    }
    if (err.message in known) return reply.code(known[err.message]).send({ error: err.message })
    req.log?.error({ err })
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' })
  })

  app.get('/health', async (_req, reply) => reply.send({ status:'ok', service:'cartella-service' }))
  app.get('/health/ready', async (_req, reply) => {
    const checks: Record<string,string> = {}
    try { await prisma.$queryRaw`SELECT 1`; checks.postgres = 'ok' } catch { checks.postgres = 'error' }
    try { await redis.ping();               checks.redis    = 'ok' } catch { checks.redis    = 'error' }
    const ok = Object.values(checks).every(v => v === 'ok')
    return reply.code(ok ? 200 : 503).send({ status: ok ? 'ready' : 'degraded', checks })
  })

  await app.register(clinicalRoutes, { prefix: '/api/v1/clinical' })

  const shutdown = async () => {
    await app.close(); await prisma.$disconnect(); await redis.quit(); process.exit(0)
  }
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown)
  return app
}

const app = await buildApp()
await app.listen({ port: env.PORT, host: '0.0.0.0' })
app.log.info(`cartella-service avviato su porta ${env.PORT}`)
