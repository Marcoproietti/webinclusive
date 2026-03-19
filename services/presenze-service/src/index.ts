// src/index.ts
import Fastify   from 'fastify'
import cors      from '@fastify/cors'
import helmet    from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt       from '@fastify/jwt'

import { env }                from './config/env.js'
import { prisma }             from './db/clients.js'
import { redis }              from './db/clients.js'
import { attendanceRoutes }   from './routes/attendance.routes.js'
import { deviceRoutes }       from './routes/device.routes.js'
import { PostCheckoutWorker } from './workers/post-checkout.worker.js'

export async function buildApp() {
  const app = Fastify({
    logger:     env.NODE_ENV !== 'test',
    trustProxy: true,
    genReqId:   () => crypto.randomUUID(),
  })

  await app.register(helmet,    { contentSecurityPolicy: false })
  await app.register(cors,      { origin: env.ALLOWED_ORIGINS.split(','), credentials: true })
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })
  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
    verify: { issuer: 'webinclusive-auth' },
  })

  app.decorate('authenticate', async (req: any, reply: any) => {
    try { await req.jwtVerify() }
    catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }) }
  })

  app.setErrorHandler((err, req, reply) => {
    const known: Record<string,number> = {
      ALREADY_CHECKED_IN:      409,
      ATTENDANCE_NOT_FOUND:    404,
      NOT_CHECKED_IN:          400,
      CHECKOUT_REQUIRED:       400,
      NOTE_ALREADY_EXISTS:     409,
      DEVICE_NOT_REGISTERED:   403,
      RECORD_TOO_OLD:          422,
      FORBIDDEN:               403,
    }
    if (err.message in known) return reply.code(known[err.message]).send({ error: err.message })
    req.log?.error({ err }, 'unhandled')
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' })
  })

  // Health
  app.get('/health', async (_req, reply) =>
    reply.send({ status: 'ok', service: 'presenze-service' })
  )
  app.get('/health/ready', async (_req, reply) => {
    const checks: Record<string,string> = {}
    try { await prisma.$queryRaw`SELECT 1`; checks.postgres = 'ok' } catch { checks.postgres = 'error' }
    try { await redis.ping();               checks.redis    = 'ok' } catch { checks.redis    = 'error' }
    const ok = Object.values(checks).every(v => v === 'ok')
    return reply.code(ok ? 200 : 503).send({ status: ok ? 'ready' : 'degraded', checks })
  })

  await app.register(attendanceRoutes, { prefix: '/api/v1/attendance' })
  await app.register(deviceRoutes,     { prefix: '/api/v1/devices' })

  if (env.NODE_ENV !== 'test') PostCheckoutWorker.start()

  const shutdown = async () => {
    await PostCheckoutWorker.stop()
    await app.close()
    await prisma.$disconnect()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT',  shutdown)

  return app
}

const app = await buildApp()
await app.listen({ port: env.PORT, host: '0.0.0.0' })
app.log.info(`presenze-service avviato su porta ${env.PORT}`)
