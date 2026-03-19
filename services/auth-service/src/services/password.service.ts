// ─────────────────────────────────────────────────────────
// src/services/password.service.ts
// Hash, verifica, policy, storico ultime 5 password
// ─────────────────────────────────────────────────────────

import bcrypt       from 'bcrypt'
import { prisma }   from '../db/prisma.js'
import { env }      from '../config/env.js'

// Policy password (OWASP compliant)
const PASSWORD_POLICY = {
  minLength:      8,
  requireUpper:   /[A-Z]/,
  requireLower:   /[a-z]/,
  requireNumber:  /\d/,
  requireSymbol:  /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/,
  maxLength:      128,
  historyCount:   5,
}

export interface PasswordValidationResult {
  valid:  boolean
  errors: string[]
}

export class PasswordService {

  // ── Valida policy ─────────────────────────────────────

  validatePolicy(password: string): PasswordValidationResult {
    const errors: string[] = []

    if (password.length < PASSWORD_POLICY.minLength)
      errors.push(`Minimo ${PASSWORD_POLICY.minLength} caratteri`)
    if (password.length > PASSWORD_POLICY.maxLength)
      errors.push(`Massimo ${PASSWORD_POLICY.maxLength} caratteri`)
    if (!PASSWORD_POLICY.requireUpper.test(password))
      errors.push('Richiesta almeno una lettera maiuscola')
    if (!PASSWORD_POLICY.requireLower.test(password))
      errors.push('Richiesta almeno una lettera minuscola')
    if (!PASSWORD_POLICY.requireNumber.test(password))
      errors.push('Richiesto almeno un numero')
    if (!PASSWORD_POLICY.requireSymbol.test(password))
      errors.push('Richiesto almeno un simbolo speciale')

    return { valid: errors.length === 0, errors }
  }

  // ── Hash ──────────────────────────────────────────────

  async hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, env.BCRYPT_ROUNDS)
  }

  // ── Verifica ──────────────────────────────────────────

  async verify(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash)
  }

  // ── Verifica storico (no riutilizzo ultime 5) ─────────

  async isInHistory(userId: string, plaintext: string): Promise<boolean> {
    const history = await prisma.passwordHistory.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    PASSWORD_POLICY.historyCount,
      select:  { passwordHash: true },
    })

    for (const { passwordHash } of history) {
      if (await bcrypt.compare(plaintext, passwordHash)) {
        return true // trovato in storico
      }
    }
    return false
  }

  // ── Aggiorna password + salva in storico ─────────────

  async updatePassword(userId: string, newPlaintext: string): Promise<void> {
    const validation = this.validatePolicy(newPlaintext)
    if (!validation.valid) {
      throw Object.assign(new Error('PASSWORD_POLICY_VIOLATION'), {
        details: validation.errors,
      })
    }

    const inHistory = await this.isInHistory(userId, newPlaintext)
    if (inHistory) {
      throw new Error('PASSWORD_RECENTLY_USED')
    }

    const newHash = await this.hash(newPlaintext)

    await prisma.$transaction([
      // Aggiorna hash corrente
      prisma.user.update({
        where: { id: userId },
        data:  { passwordHash: newHash },
      }),
      // Salva in storico
      prisma.passwordHistory.create({
        data: { userId, passwordHash: newHash },
      }),
      // Mantieni solo gli ultimi N
      prisma.passwordHistory.deleteMany({
        where: {
          userId,
          id: {
            notIn: await prisma.passwordHistory
              .findMany({
                where:   { userId },
                orderBy: { createdAt: 'desc' },
                take:    PASSWORD_POLICY.historyCount,
                select:  { id: true },
              })
              .then((rows) => rows.map((r) => r.id)),
          },
        },
      }),
    ])
  }
}
