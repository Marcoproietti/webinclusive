// ─────────────────────────────────────────────────────────
// src/index.ts — API Gateway
// Unico punto d'ingresso HTTP/WS del sistema.
// Routing intelligente verso microservizi interni.
// ─────────────────────────────────────────────────────────

import Fastify      from 'fastify'
import cors         from '@fastify/cors'
import helmet       from '@fastify/helmet'
import rateLimit    from '@fastify/rate-limit'
import jwt          from '@fastify/jwt'
import cookie       from '@fastify/cookie'
import websocket    from '@fastify/websocket'
import httpProxy    from '@fastify/http-proxy'
import Redis        from 'ioredis'

import { env }              from './config/env.js'
import { ROUTES }           from './config/routes.js'
import { jwtMiddleware }    from './middleware/jwt.js'
import { auditMiddleware }  from './middleware/audit.js'
import { registerWsRoutes } from './ws/co-realtime.js'

// ─────────────────────────────────────────────────────────

export async function buildApp() {
  const app = Fastify({
    logger:          env.NODE_ENV !== 'test',
    trustProxy:      true,
    genReqId:        () => crypto.randomUUID(),
    bodyLimit:       10 * 1024 * 1024,  // 10MB (upload allegati)
    requestTimeout:  30_000,
  })

  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 })

  // ── Plugins sicurezza ─────────────────────────────────

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })

  await app.register(cors, {
    origin:      (origin, cb) => {
      const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      if (!origin || allowed.includes(origin) || allowed.includes('*')) {
        return cb(null, true)
      }
      cb(new Error('CORS: origine non autorizzata'), false)
    },
    credentials: true,
    methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization','X-Request-Id'],
  })

  await app.register(rateLimit, {
    global:      true,
    max:         env.RATE_LIMIT_MAX,
    timeWindow:  '1 minute',
    redis,
    keyGenerator: (req) =>
      ((req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip),
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error:      'TOO_MANY_REQUESTS',
      message:    `Rate limit raggiunto. Riprova tra ${Math.ceil(context.ttl / 1000)}s.`,
    }),
  })

  await app.register(jwt, {
    secret:  env.JWT_ACCESS_SECRET,
    verify:  { issuer: 'webinclusive-auth' },
  })

  await app.register(cookie, { secret: env.COOKIE_SECRET })
  await app.register(websocket)

  // ── Hooks globali ─────────────────────────────────────

  app.addHook('onRequest', jwtMiddleware)
  app.addHook('onResponse', auditMiddleware)

  // ── Health ────────────────────────────────────────────

  app.get('/health', async (_req, reply) => {
    const redisOk = await redis.ping().then(() => true).catch(() => false)
    return reply
      .code(redisOk ? 200 : 503)
      .send({
        status:   redisOk ? 'ok' : 'degraded',
        service:  'gateway',
        version:  '1.0.0',
        ts:       new Date().toISOString(),
        checks:   { redis: redisOk ? 'ok' : 'error' },
      })
  })

  // ── Metrics (Prometheus) ──────────────────────────────

  app.get('/metrics', async (_req, reply) => {
    // In produzione integrare prom-client
    return reply.send('# WEB.INCLUSIVE gateway metrics\n')
  })

  // ── WebSocket routes ──────────────────────────────────

  await registerWsRoutes(app)

  // ── HTTP Proxy routes ─────────────────────────────────
  // Ogni route nella routing table viene registrata come proxy

  for (const route of ROUTES) {
    const rateLimitConfig =
      route.rateLimit === 'strict'  ? { max: env.RATE_LIMIT_AUTH_MAX, timeWindow: '1 minute' } :
      route.rateLimit === 'relaxed' ? { max: 500, timeWindow: '1 minute' } :
      undefined

    await app.register(async (instance) => {
      if (rateLimitConfig) {
        await instance.register(rateLimit, {
          ...rateLimitConfig,
          redis,
          keyGenerator: (req) =>
            ((req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip),
        })
      }

      await instance.register(httpProxy, {
        upstream:   route.upstream,
        prefix:     route.prefix,
        rewriteRequestHeaders: (req, headers) => {
          // Rimuove header interni non trusted dal client
          delete headers['x-internal']
          delete headers['x-user-id']
          delete headers['x-user-role']
          return {
            ...headers,
            // Inietta identità verificata dal Gateway (trusted)
            'x-user-id':      req.headers['x-user-id']   ?? '',
            'x-user-role':    req.headers['x-user-role'] ?? '',
            'x-forwarded-by': 'wi-gateway',
            'x-request-id':   req.id as string,
          }
        },
        httpMethods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
        retryMethods: ['GET'],
        undici: {
          connections:   10,
          pipelining:    1,
          keepAliveTimeout: 30_000,
        },
      })
    })
  }

  // ── Error handler ─────────────────────────────────────

  app.setErrorHandler((err, req, reply) => {
    app.log.error({ err, url: req.url, method: req.method })

    if (err.statusCode === 429) {
      return reply.code(429).send({ error: 'TOO_MANY_REQUESTS', message: err.message })
    }
    return reply.code(err.statusCode ?? 500).send({
      error:   'GATEWAY_ERROR',
      message: env.NODE_ENV === 'production' ? 'Errore del gateway.' : err.message,
    })
  })

  // ── Not found ─────────────────────────────────────────

  app.setNotFoundHandler((req, reply) => {
    return reply.code(404).send({
      error:   'ROUTE_NOT_FOUND',
      message: `${req.method} ${req.url} non trovato.`,
    })
  })

  // ── Graceful shutdown ─────────────────────────────────

  const shutdown = async () => {
    app.log.info('Shutdown gateway...')
    await app.close()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT',  shutdown)

  return app
}

// ── Start ─────────────────────────────────────────────────

const app = await buildApp()
await app.listen({ port: env.PORT, host: '0.0.0.0' })
app.log.info(`Gateway avviato su porta ${env.PORT}`)
