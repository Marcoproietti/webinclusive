// ─────────────────────────────────────────────────────────
// src/routes/auth.routes.ts
// POST /api/v1/auth/login
// POST /api/v1/auth/refresh
// POST /api/v1/auth/logout
// POST /api/v1/auth/mfa/setup
// POST /api/v1/auth/mfa/confirm
// POST /api/v1/auth/mfa/verify
// ─────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z }               from 'zod'
import { prisma }          from '../db/prisma.js'
import { redis, RedisKeys } from '../db/redis.js'
import { TokenService }    from '../services/token.service.js'
import { PasswordService } from '../services/password.service.js'
import { MfaService }      from '../services/mfa.service.js'
import { auditService }    from '../services/audit.service.js'

// ── Schema Zod ────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

const mfaVerifySchema = z.object({
  totp_code: z.string().length(6).regex(/^\d+$/),
})

const refreshSchema = z.object({
  // refresh token letto dal cookie, non dal body
})

// ── Cookie config per refresh token ──────────────────────

const REFRESH_COOKIE_NAME = 'wi_refresh'
const REFRESH_COOKIE_OPTS = {
  httpOnly:  true,
  secure:    process.env.NODE_ENV === 'production',
  sameSite:  'strict' as const,
  path:      '/api/v1/auth',
  maxAge:    7 * 24 * 60 * 60, // 7 giorni
}

// ── Max tentativi login per IP ────────────────────────────

const MAX_LOGIN_ATTEMPTS  = 10
const LOGIN_LOCKOUT_SECS  = 15 * 60 // 15 minuti

// ── Plugin Fastify ────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance) {
  const tokenService   = new TokenService(fastify)
  const passwordService = new PasswordService()
  const mfaService     = new MfaService()

  // ── POST /login ────────────────────────────────────────

  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body)
    const ip = req.ip

    // Brute force check
    const attempts = await redis.get(RedisKeys.loginAttempts(ip))
    if (Number(attempts) >= MAX_LOGIN_ATTEMPTS) {
      return reply.code(429).send({
        error:   'ACCOUNT_LOCKED',
        message: 'Troppi tentativi. Riprova tra 15 minuti.',
      })
    }

    // Cerca utente
    const user = await prisma.user.findUnique({
      where:  { email: email.toLowerCase() },
      select: {
        id: true, email: true, passwordHash: true,
        role: true, isActive: true, mfaEnabled: true,
      },
    })

    // Timing-safe: sempre verifica hash anche se utente non esiste
    const dummyHash = '$2b$12$dummy.hash.to.prevent.timing.attacks'
    const hashToVerify = user?.passwordHash ?? dummyHash
    const passwordOk   = await passwordService.verify(password, hashToVerify)

    if (!user || !passwordOk) {
      // Incrementa contatore tentativi
      await redis.multi()
        .incr(RedisKeys.loginAttempts(ip))
        .expire(RedisKeys.loginAttempts(ip), LOGIN_LOCKOUT_SECS)
        .exec()

      await auditService.log({
        action:     'LOGIN_FAILED',
        entityType: 'user',
        ipAddress:  ip,
        payload:    { email },
      })

      return reply.code(401).send({
        error:   'INVALID_CREDENTIALS',
        message: 'Email o password non corretti.',
      })
    }

    if (!user.isActive) {
      return reply.code(403).send({
        error:   'USER_INACTIVE',
        message: 'Account disabilitato. Contattare l\'amministratore.',
      })
    }

    // Reset contatore tentativi
    await redis.del(RedisKeys.loginAttempts(ip))

    // Aggiorna last_login_at
    await prisma.user.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date() },
    })

    // Se MFA abilitata → risposta intermedia
    if (user.mfaEnabled) {
      await mfaService.setPendingMfa(user.id)
      await auditService.log({
        userId: user.id, action: 'LOGIN_MFA_REQUIRED',
        entityType: 'user', ipAddress: ip,
      })
      return reply.code(200).send({
        mfa_required: true,
        user_id:      user.id,
        message:      'Inserire il codice TOTP per completare l\'accesso.',
      })
    }

    // Emetti token
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    }
    const tokens = await tokenService.generateTokenPair(user.id, user.role, meta)

    await auditService.log({
      userId: user.id, action: 'LOGIN_SUCCESS',
      entityType: 'user', ipAddress: ip,
    })

    reply.setCookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTS)

    return reply.code(200).send({
      access_token: tokens.accessToken,
      token_type:   'Bearer',
      expires_in:   tokens.expiresIn,
      user: {
        id:   user.id,
        email: user.email,
        role:  user.role,
      },
    })
  })

  // ── POST /mfa/verify ───────────────────────────────────

  fastify.post('/mfa/verify', async (req, reply) => {
    const body   = req.body as { user_id?: string; totp_code?: string }
    const parsed = mfaVerifySchema.extend({
      user_id: z.string().uuid(),
    }).parse(body)

    const isPending = await mfaService.isPendingMfa(parsed.user_id)
    if (!isPending) {
      return reply.code(400).send({
        error: 'MFA_NOT_PENDING',
        message: 'Nessun login MFA pendente per questo utente.',
      })
    }

    const valid = await mfaService.verifyTotp(parsed.user_id, parsed.totp_code)
    if (!valid) {
      return reply.code(401).send({
        error: 'MFA_INVALID_CODE',
        message: 'Codice TOTP non valido o scaduto.',
      })
    }

    await mfaService.clearPendingMfa(parsed.user_id)

    const user = await prisma.user.findUniqueOrThrow({
      where:  { id: parsed.user_id },
      select: { id: true, email: true, role: true },
    })

    const tokens = await tokenService.generateTokenPair(user.id, user.role, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    })

    await auditService.log({
      userId: user.id, action: 'LOGIN_MFA_SUCCESS',
      entityType: 'user', ipAddress: req.ip,
    })

    reply.setCookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTS)

    return reply.send({
      access_token: tokens.accessToken,
      token_type:   'Bearer',
      expires_in:   tokens.expiresIn,
      user: { id: user.id, email: user.email, role: user.role },
    })
  })

  // ── POST /refresh ──────────────────────────────────────

  fastify.post('/refresh', async (req, reply) => {
    const rawToken = req.cookies[REFRESH_COOKIE_NAME]
    if (!rawToken) {
      return reply.code(401).send({
        error: 'MISSING_REFRESH_TOKEN',
        message: 'Refresh token mancante.',
      })
    }

    try {
      const tokens = await tokenService.rotateRefreshToken(rawToken, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      })

      reply.setCookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTS)

      return reply.send({
        access_token: tokens.accessToken,
        token_type:   'Bearer',
        expires_in:   tokens.expiresIn,
      })
    } catch (err: any) {
      // Token non valido: forza logout pulendo cookie
      reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' })
      return reply.code(401).send({
        error:   'INVALID_REFRESH_TOKEN',
        message: 'Sessione scaduta. Effettuare nuovamente il login.',
      })
    }
  })

  // ── POST /logout ───────────────────────────────────────

  fastify.post('/logout', {
    onRequest: [fastify.authenticate], // richiede JWT valido
  }, async (req, reply) => {
    const rawToken  = req.cookies[REFRESH_COOKIE_NAME]
    const allDevices = (req.body as any)?.all_devices === true

    if (allDevices) {
      const user = req.user as { sub: string }
      await tokenService.revokeAllUserTokens(user.sub)
      await auditService.log({
        userId: user.sub, action: 'LOGOUT_ALL',
        entityType: 'user', ipAddress: req.ip,
      })
    } else if (rawToken) {
      await tokenService.revokeToken(rawToken)
      await auditService.log({
        userId: (req.user as any)?.sub, action: 'LOGOUT',
        entityType: 'user', ipAddress: req.ip,
      })
    }

    reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' })
    return reply.send({ message: 'Logout effettuato con successo.' })
  })

  // ── POST /mfa/setup ────────────────────────────────────

  fastify.post('/mfa/setup', {
    onRequest: [fastify.authenticate],
  }, async (req, reply) => {
    const user   = req.user as { sub: string }
    const result = await mfaService.setupMfa(user.sub)

    return reply.send({
      secret:       result.secret,
      qr_code:      result.qrCodeDataUrl,
      message:      'Scansiona il QR con Google Authenticator, poi conferma con il codice.',
    })
  })

  // ── POST /mfa/confirm ──────────────────────────────────

  fastify.post('/mfa/confirm', {
    onRequest: [fastify.authenticate],
  }, async (req, reply) => {
    const { totp_code } = mfaVerifySchema.parse(req.body)
    const user          = req.user as { sub: string }

    await mfaService.confirmMfaSetup(user.sub, totp_code)

    await auditService.log({
      userId: user.sub, action: 'MFA_ENABLED',
      entityType: 'user', ipAddress: req.ip,
    })

    return reply.send({ message: 'MFA attivata con successo.' })
  })
}
