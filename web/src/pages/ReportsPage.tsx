// src/pages/ReportsPage.tsx
import { useQuery }   from '@tanstack/react-query'
import { format, subDays, eachDayOfInterval } from 'date-fns'
import { it }         from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import api            from '../lib/api'
import { BarChart3 }  from 'lucide-react'

export default function ReportsPage() {
  const today = new Date()
  const from  = format(subDays(today, 29), 'yyyy-MM-dd')
  const to    = format(today, 'yyyy-MM-dd')

  const { data: attendance } = useQuery({
    queryKey: ['attendance', 'report', from, to],
    queryFn:  () => api.get('/attendance', { params: { from, to, limit: 500 } })
                       .then(r => r.data.data ?? []),
  })

  // Raggruppa per giorno
  const days = eachDayOfInterval({ start: subDays(today, 29), end: today })
  const chartData = days.map(day => {
    const dayStr = format(day, 'yyyy-MM-dd')
    const recs   = (attendance ?? []).filter((a: any) =>
      a.checkInAt?.startsWith(dayStr)
    )
    return {
      day:       format(day, 'dd/MM', { locale: it }),
      presenze:  recs.length,
      completate:recs.filter((a: any) => a.status === 'checked_out').length,
      verificate:recs.filter((a: any) => a.isVerified).length,
    }
  })

  const totals = {
    presenze:   (attendance ?? []).length,
    completate: (attendance ?? []).filter((a: any) => a.status === 'checked_out').length,
    verificate: (attendance ?? []).filter((a: any) => a.isVerified).length,
    geofenceOk: (attendance ?? []).filter((a: any) => a.geofenceOk).length,
    totalMin:   (attendance ?? []).reduce((s: number, a: any) => s + (a.durationMin ?? 0), 0),
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="w-6 h-6 text-[#1A5276]" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Report</h1>
          <p className="text-sm text-gray-500">Ultimi 30 giorni</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {[
          { label: 'Presenze totali',  value: totals.presenze },
          { label: 'Completate',       value: totals.completate },
          { label: 'Verificate HMAC',  value: totals.verificate },
          { label: 'Geofence OK',      value: totals.geofenceOk },
          { label: 'Ore erogate',      value: `${Math.round(totals.totalMin / 60)}h` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">{label}</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Grafico presenze */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Presenze giornaliere</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={3} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="presenze"   name="Totali"      fill="#1A5276" radius={[3,3,0,0]} />
            <Bar dataKey="completate" name="Completate"  fill="#148F77" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
