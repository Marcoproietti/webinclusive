// ─────────────────────────────────────────────────────────
// src/config/routes.ts
// Routing table: prefisso URL → upstream service
// Ogni route definisce anche le policy di sicurezza
// ─────────────────────────────────────────────────────────

import { env } from './env.js'

export interface RouteConfig {
  upstream:      string
  prefix:        string
  auth:          'public' | 'jwt' | 'internal'
  rateLimit?:    'default' | 'strict' | 'relaxed'
  stripPrefix?:  boolean
}

export const ROUTES: RouteConfig[] = [
  // ── Auth Service ──────────────────────────────────────
  {
    prefix:    '/api/v1/auth/login',
    upstream:  env.AUTH_SERVICE_URL,
    auth:      'public',
    rateLimit: 'strict',
  },
  {
    prefix:    '/api/v1/auth/refresh',
    upstream:  env.AUTH_SERVICE_URL,
    auth:      'public',
    rateLimit: 'strict',
  },
  {
    prefix:    '/api/v1/auth',
    upstream:  env.AUTH_SERVICE_URL,
    auth:      'jwt',
  },
  {
    prefix:    '/api/v1/users',
    upstream:  env.AUTH_SERVICE_URL,
    auth:      'jwt',
  },
  {
    prefix:    '/api/v1/operators',
    upstream:  env.AUTH_SERVICE_URL,
    auth:      'jwt',
  },

  // ── Scheduling Service ────────────────────────────────
  {
    prefix:    '/api/v1/beneficiaries',
    upstream:  env.SCHEDULING_SERVICE_URL,
    auth:      'jwt',
  },
  {
    prefix:    '/api/v1/care-plans',
    upstream:  env.SCHEDULING_SERVICE_URL,
    auth:      'jwt',
  },
  {
    prefix:    '/api/v1/appointments',
    upstream:  env.SCHEDULING_SERVICE_URL,
    auth:      'jwt',
  },
  {
    prefix:    '/api/v1/shifts',
    upstream:  env.SCHEDULING_SERVICE_URL,
    auth:      'jwt',
    rateLimit: 'relaxed',   // app mobile fa molte richieste
  },
  {
    prefix:    '/api/v1/availability',
    upstream:  env.SCHEDULING_SERVICE_URL,
    auth:      'jwt',
  },
  {
    prefix:    '/api/v1/messages',
    upstream:  env.SCHEDULING_SERVICE_URL,
    auth:      'jwt',
    rateLimit: 'relaxed',
  },
  {
    prefix:    '/api/v1/service-types',
    upstream:  env.SCHEDULING_SERVICE_URL,
    auth:      'jwt',
  },

  // ── Presenze Service ──────────────────────────────────
  {
    prefix:    '/api/v1/attendance',
    upstream:  env.PRESENZE_SERVICE_URL,
    auth:      'jwt',
    rateLimit: 'relaxed',
  },
  {
    prefix:    '/api/v1/devices',
    upstream:  env.PRESENZE_SERVICE_URL,
    auth:      'jwt',
  },

  // ── Cartella Service ──────────────────────────────────
  {
    prefix:    '/api/v1/clinical',
    upstream:  env.CARTELLA_SERVICE_URL,
    auth:      'jwt',
  },

  // ── HR Service ────────────────────────────────────────
  {
    prefix:    '/api/v1/trainings',
    upstream:  env.HR_SERVICE_URL,
    auth:      'jwt',
  },
  {
    prefix:    '/api/v1/quality',
    upstream:  env.HR_SERVICE_URL,
    auth:      'jwt',
  },

  // ── Whistleblowing (anonimo) ──────────────────────────
  {
    prefix:    '/api/v1/wb/reports',
    upstream:  env.WB_SERVICE_URL,
    auth:      'public',    // invio anonimo senza JWT
    rateLimit: 'strict',
  },
  {
    prefix:    '/api/v1/wb',
    upstream:  env.WB_SERVICE_URL,
    auth:      'jwt',
  },
]

// Route pubbliche — skippa JWT verify
export const PUBLIC_PREFIXES = ROUTES
  .filter((r) => r.auth === 'public')
  .map((r) => r.prefix)
