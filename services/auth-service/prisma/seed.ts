// ─────────────────────────────────────────────────────────
// prisma/seed.ts
// Seed dati di sviluppo/test
// npx tsx prisma/seed.ts
// ─────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'

const prisma = new PrismaClient()

const BCRYPT_ROUNDS = 12

async function main() {
  console.log('🌱 Seeding database...')

  // ── Utente Admin ──────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin1234!', BCRYPT_ROUNDS)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@webinclusive.it' },
    update: {},
    create: {
      email:        'admin@webinclusive.it',
      passwordHash: adminHash,
      role:         'admin',
      isActive:     true,
      passwordHistory: { create: { passwordHash: adminHash } },
    },
  })
  console.log(`✅ Admin: ${admin.email}`)

  // ── Coordinatore ──────────────────────────────────────
  const coordHash = await bcrypt.hash('Coord1234!', BCRYPT_ROUNDS)
  const coord = await prisma.user.upsert({
    where: { email: 'coordinator@webinclusive.it' },
    update: {},
    create: {
      email:        'coordinator@webinclusive.it',
      passwordHash: coordHash,
      role:         'coordinator',
      isActive:     true,
      passwordHistory: { create: { passwordHash: coordHash } },
    },
  })
  console.log(`✅ Coordinatore: ${coord.email}`)

  // ── Operatore OSS ─────────────────────────────────────
  const opHash = await bcrypt.hash('Operator1234!', BCRYPT_ROUNDS)
  const deviceSecret = randomBytes(32).toString('hex')

  const operator = await prisma.user.upsert({
    where: { email: 'operatore.test@webinclusive.it' },
    update: {},
    create: {
      email:        'operatore.test@webinclusive.it',
      passwordHash: opHash,
      role:         'operator',
      isActive:     true,
      passwordHistory: { create: { passwordHash: opHash } },
      operator: {
        create: {
          firstName:     'ENCRYPTED_mario',    // In prod: cifrato con encryptField
          lastName:      'ENCRYPTED_rossi',
          fiscalCode:    'ENCRYPTED_rssmra80a01h501u',
          badgeNumber:   'OP-2024-001',
          qualification: 'OSS',
          contractType:  'tempo_indeterminato',
          hireDate:      new Date('2022-01-10'),
          territoryZone: 'Roma-Nord',
          deviceSecret,
        },
      },
    },
  })
  console.log(`✅ Operatore: ${operator.email}`)
  console.log(`   device_secret (solo per onboarding): ${deviceSecret}`)

  // ── Auditor ───────────────────────────────────────────
  const auditHash = await bcrypt.hash('Auditor1234!', BCRYPT_ROUNDS)
  const auditor = await prisma.user.upsert({
    where: { email: 'auditor@webinclusive.it' },
    update: {},
    create: {
      email:        'auditor@webinclusive.it',
      passwordHash: auditHash,
      role:         'auditor',
      isActive:     true,
      passwordHistory: { create: { passwordHash: auditHash } },
    },
  })
  console.log(`✅ Auditor: ${auditor.email}`)

  console.log('\n🎉 Seed completato!')
  console.log('\nCredenziali di test:')
  console.log('  admin@webinclusive.it         / Admin1234!')
  console.log('  coordinator@webinclusive.it   / Coord1234!')
  console.log('  operatore.test@webinclusive.it / Operator1234!')
  console.log('  auditor@webinclusive.it        / Auditor1234!')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
