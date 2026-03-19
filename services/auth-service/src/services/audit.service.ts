// src/services/audit.service.ts
// Scrive audit log (append-only)

import { prisma } from '../db/prisma.js'

export interface AuditEntry {
  userId?:    string
  action:     string
  entityType: string
  entityId?:  string
  ipAddress?: string
  userAgent?: string
  payload?:   Record<string, unknown>
}

export class AuditService {
  async log(entry: AuditEntry): Promise<void> {
    // Fire-and-forget: non bloccare la risposta HTTP
    prisma.auditLog.create({ data: entry }).catch((err) => {
      console.error('[Audit] Errore scrittura log:', err)
    })
  }
}

export const auditService = new AuditService()
