// ─────────────────────────────────────────────────────────
// WEB.INCLUSIVE — auth-service/src/index.ts
// Entry point — bootstrap Fastify
// ─────────────────────────────────────────────────────────

import Fastify from 'fastify'
import cookie   from '@fastify/cookie'
import cors     from '@fastify/cors'
import helmet   from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt      from '@fastify/jwt'

import { env }            from './config/env.js'
import { prisma }         from './db/prisma.js'
import { redis }          from './db/redis.js'
import { authRoutes }     from './routes/auth.routes.js'
import { userRoutes }     from './routes/user.routes.js'
import { operatorRoutes } from './routes/operator.routes.js'
import { healthRoutes }   from './routes/health.routes.js'
import { errorHandler }   from './middleware/error-handler.js'
import { logger }         from './config/logger.js'

// ── Build app ─────────────────────────────────────────────

export async function buildApp() {
  const app = Fastify({
    logger:     logger,
    trustProxy: true,
    genReqId:   () => crypto.randomUUID(),
  })

  // ── Security plugins ──────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // gestito da NGINX
  })

  await app.register(cors, {
    origin:      env.ALLOWED_ORIGINS.split(','),
    credentials: true,
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })

  await app.register(rateLimit, {
    max:         100,
    timeWindow:  '1 minute',
    keyGenerator: (req) =>
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'TOO_MANY_REQUESTS',
      message: 'Troppi tentativi. Riprova tra un minuto.',
    }),
  })

  // ── JWT ───────────────────────────────────────────────
  await app.register(jwt, {
    secret:  env.JWT_ACCESS_SECRET,
    sign:    { expiresIn: '15m', issuer: 'webinclusive-auth' },
    verify:  { issuer: 'webinclusive-auth' },
  })

  // ── Cookie (per refresh token HttpOnly) ──────────────
  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
    hook:   'onRequest',
  })

  // ── Error handler globale ─────────────────────────────
  app.setErrorHandler(errorHandler)

  // ── Routes ───────────────────────────────────────────
  await app.register(healthRoutes,   { prefix: '/health' })
  await app.register(authRoutes,     { prefix: '/api/v1/auth' })
  await app.register(userRoutes,     { prefix: '/api/v1/users' })
  await app.register(operatorRoutes, { prefix: '/api/v1/operators' })

  // ── Graceful shutdown ─────────────────────────────────
  const shutdown = async () => {
    app.log.info('Shutdown in corso...')
    await app.close()
    await prisma.$disconnect()
    await redis.quit()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT',  shutdown)

  return app
}

// ── Start ─────────────────────────────────────────────────

const app = await buildApp()

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  app.log.info(`auth-service avviato su porta ${env.PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
