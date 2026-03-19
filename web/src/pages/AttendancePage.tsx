// src/pages/AttendancePage.tsx
import { useQuery }  from '@tanstack/react-query'
import { useState }  from 'react'
import { format, subDays } from 'date-fns'
import api           from '../lib/api'
import { ClipboardList, Download } from 'lucide-react'

export default function AttendancePage() {
  const today      = format(new Date(), 'yyyy-MM-dd')
  const [from, setFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [to,   setTo]   = useState(today)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', from, to, page],
    queryFn:  () => api.get('/attendance', { params: { from, to, page, limit: 20 } })
                       .then(r => r.data),
  })

  const handleExport = () => {
    window.open(`/api/v1/attendance/report?from=${from}&to=${to}&format=csv`, '_blank')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-[#1A5276]" />
          <h1 className="text-2xl font-bold text-gray-800">Presenze</h1>
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-2 border border-gray-200 text-gray-700
                     px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" /> Esporta CSV
        </button>
      </div>

      {/* Filtri data */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Da</label>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-[#1A5276]/30" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">A</label>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-[#1A5276]/30" />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-gray-500 text-xs uppercase tracking-wide">
              <th className="px-6 py-3 text-left font-medium">Operatore</th>
              <th className="px-6 py-3 text-left font-medium">Check-in</th>
              <th className="px-6 py-3 text-left font-medium">Check-out</th>
              <th className="px-6 py-3 text-left font-medium">Durata</th>
              <th className="px-6 py-3 text-left font-medium">Verificato</th>
              <th className="px-6 py-3 text-left font-medium">Geofence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && Array.from({length:8}).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {Array.from({length:6}).map((__, j) => (
                  <td key={j} className="px-6 py-4">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
            {!isLoading && (data?.data ?? []).map((a: any) => (
              <tr key={a.id} className="hover:bg-gray-50/50">
                <td className="px-6 py-3 font-mono text-xs text-gray-500">{a.operatorId?.slice(0,8)}…</td>
                <td className="px-6 py-3 text-gray-700 text-xs">
                  {new Date(a.checkInAt).toLocaleString('it-IT')}
                </td>
                <td className="px-6 py-3 text-gray-700 text-xs">
                  {a.checkOutAt ? new Date(a.checkOutAt).toLocaleString('it-IT') : '—'}
                </td>
                <td className="px-6 py-3 font-medium">
                  {a.durationMin != null ? `${a.durationMin} min` : '—'}
                </td>
                <td className="px-6 py-3">
                  <span className={`text-xs font-bold ${a.isVerified ? 'text-green-600' : 'text-red-500'}`}>
                    {a.isVerified ? '✓' : '✗'}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <span className={`text-xs font-bold ${a.geofenceOk ? 'text-green-600' : 'text-amber-500'}`}>
                    {a.geofenceOk ? '✓' : '⚠'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.pagination && (
          <div className="px-6 py-4 border-t border-gray-50 flex items-center justify-between text-sm text-gray-500">
            <span>{data.pagination.total} presenze · Pagina {page} di {data.pagination.pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40">←</button>
              <button onClick={() => setPage(p => p+1)} disabled={page===data.pagination.pages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
