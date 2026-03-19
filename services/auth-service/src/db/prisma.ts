// src/db/prisma.ts — singleton Prisma client
import { PrismaClient } from '@prisma/client'
import { env }          from '../config/env.js'

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development'
    ? ['query', 'warn', 'error']
    : ['warn', 'error'],
})

// Connessione eager al boot per fail-fast
await prisma.$connect()
