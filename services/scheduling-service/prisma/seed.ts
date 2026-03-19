// prisma/seed.ts — scheduling-service
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seed scheduling-service...')

  // Tipi di servizio ADI standard
  const serviceTypes = [
    { code: 'INF-01', name: 'Assistenza infermieristica base',        category: 'infermieristica', requiredQualification: 'infermiere',         defaultDurationMin: 30 },
    { code: 'INF-02', name: 'Gestione catetere/medicazione avanzata', category: 'infermieristica', requiredQualification: 'infermiere',         defaultDurationMin: 45 },
    { code: 'RIA-01', name: 'Fisioterapia domiciliare',               category: 'riabilitativa',  requiredQualification: 'fisioterapista',     defaultDurationMin: 60 },
    { code: 'OSS-01', name: 'Assistenza alla persona (igiene)',       category: 'assistenziale',  requiredQualification: 'OSS',               defaultDurationMin: 60 },
    { code: 'OSS-02', name: 'Assistenza alla persona (pasti/mobilità)',category:'assistenziale',  requiredQualification: 'OSS',               defaultDurationMin: 90 },
    { code: 'SOC-01', name: 'Supporto sociale',                       category: 'sociale',         requiredQualification: 'assistente_sociale', defaultDurationMin: 60 },
  ]

  for (const st of serviceTypes) {
    await prisma.serviceType.upsert({
      where:  { code: st.code },
      update: {},
      create: { ...st, isBillable: true, isActive: true },
    })
    console.log(`  ✅ ${st.code} — ${st.name}`)
  }

  console.log('🎉 Seed scheduling completato!')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
