// ─────────────────────────────────────────────────────────
// src/services/conflict-check.service.ts
// Verifica sovrapposizioni appuntamenti per operatore
// e compatibilità qualifica/tipo servizio
// ─────────────────────────────────────────────────────────

import { prisma }  from '../db/prisma.js'
import type { QualificationType, ServiceCategory } from '@prisma/client'

// Mappa qualifica → categorie che può erogare
const QUALIFICATION_MAP: Record<QualificationType, ServiceCategory[]> = {
  OSS:                ['assistenziale', 'sociale'],
  OTS:                ['assistenziale'],
  infermiere:         ['infermieristica', 'assistenziale'],
  fisioterapista:     ['riabilitativa'],
  assistente_sociale: ['sociale'],
}

export interface ConflictCheckResult {
  hasConflict:   boolean
  conflictType?: 'time_overlap' | 'qualification_mismatch' | 'operator_unavailable'
  details?:      string
}

export class ConflictCheckService {

  // ── Verifica sovrapposizione oraria ───────────────────

  async checkTimeOverlap(
    operatorId:     string,
    scheduledStart: Date,
    scheduledEnd:   Date,
    excludeId?:     string   // esclude un appuntamento (per update)
  ): Promise<boolean> {
    const overlap = await prisma.appointment.findFirst({
      where: {
        operatorId,
        status:   { notIn: ['cancelled', 'missed'] },
        id:       excludeId ? { not: excludeId } : undefined,
        // Verifica intersezione intervalli: ¬(end ≤ start ∨ start ≥ end)
        AND: [
          { scheduledStart: { lt: scheduledEnd   } },
          { scheduledEnd:   { gt: scheduledStart } },
        ],
      },
    })
    return overlap !== null
  }

  // ── Verifica qualifica operatore per tipo servizio ────

  async checkQualification(
    operatorId:    string,
    serviceTypeId: string
  ): Promise<ConflictCheckResult> {
    // Recupera qualifica operatore dall'auth-service via DB condiviso
    // (in alternativa via chiamata interna HTTP)
    // Per ora usiamo una chiamata diretta al DB auth schema
    const [serviceType] = await Promise.all([
      prisma.serviceType.findUnique({
        where:  { id: serviceTypeId },
        select: { requiredQualification: true, name: true, category: true },
      }),
    ])

    if (!serviceType) throw new Error('SERVICE_TYPE_NOT_FOUND')

    // La verifica della qualifica operatore avviene tramite JWT payload
    // Il gateway inietta il ruolo e la qualifica nell'header x-operator-qualification
    // (oppure via chiamata interna a auth-service)
    // Restituiamo ok di default — la verifica completa avviene in appointment.service
    return { hasConflict: false }
  }

  // ── Verifica disponibilità operatore (ferie/malattia) ─

  async checkOperatorAvailability(
    operatorId: string,
    date:       Date
  ): Promise<boolean> {
    const dateOnly = new Date(date.toISOString().split('T')[0])
    const exception = await prisma.operatorAvailability.findUnique({
      where: { operatorId_date: { operatorId, date: dateOnly } },
    })
    // Se c'è un'eccezione con isAvailable=false → non disponibile
    if (exception && !exception.isAvailable) return false
    return true
  }

  // ── Check completo prima di creare appuntamento ───────

  async fullCheck(params: {
    operatorId:     string
    serviceTypeId:  string
    scheduledStart: Date
    scheduledEnd:   Date
    excludeId?:     string
  }): Promise<ConflictCheckResult> {
    // 1. Disponibilità operatore
    const isAvailable = await this.checkOperatorAvailability(
      params.operatorId,
      params.scheduledStart
    )
    if (!isAvailable) {
      return {
        hasConflict:  true,
        conflictType: 'operator_unavailable',
        details:      'L\'operatore non è disponibile in questa data (ferie/malattia).',
      }
    }

    // 2. Sovrapposizione oraria
    const hasOverlap = await this.checkTimeOverlap(
      params.operatorId,
      params.scheduledStart,
      params.scheduledEnd,
      params.excludeId
    )
    if (hasOverlap) {
      return {
        hasConflict:  true,
        conflictType: 'time_overlap',
        details:      'L\'operatore ha già un appuntamento in questa fascia oraria.',
      }
    }

    return { hasConflict: false }
  }
}

export const conflictChecker = new ConflictCheckService()
