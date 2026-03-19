// src/pages/BeneficiariesPage.tsx
import { useQuery }  from '@tanstack/react-query'
import { useState }  from 'react'
import api           from '../lib/api'
import { Search, Plus, Users } from 'lucide-react'

export default function BeneficiariesPage() {
  const [search, setSearch] = useState('')
  const [page,   setPage]   = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['beneficiaries', page, search],
    queryFn:  () => api.get('/beneficiaries', {
      params: { page, limit: 20, ...(search ? { search } : {}) }
    }).then(r => r.data),
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-[#1A5276]" />
          <h1 className="text-2xl font-bold text-gray-800">Beneficiari</h1>
          {data?.pagination && (
            <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full">
              {data.pagination.total} totali
            </span>
          )}
        </div>
        <button className="flex items-center gap-2 bg-[#1A5276] text-white
                           px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#154360] transition-colors">
          <Plus className="w-4 h-4" />
          Nuovo beneficiario
        </button>
      </div>

      {/* Ricerca */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Cerca per codice fiscale..."
          className="w-full max-w-md pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl
                     text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5276]/30" />
      </div>

      {/* Tabella */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-gray-500 text-xs uppercase tracking-wide">
              <th className="px-6 py-3 text-left font-medium">ID</th>
              <th className="px-6 py-3 text-left font-medium">Distretto</th>
              <th className="px-6 py-3 text-left font-medium">ASL</th>
              <th className="px-6 py-3 text-left font-medium">Presa in carico</th>
              <th className="px-6 py-3 text-left font-medium">Stato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && Array.from({length:8}).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {Array.from({length:5}).map((__, j) => (
                  <td key={j} className="px-6 py-4">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
            {!isLoading && (data?.data ?? []).map((b: any) => (
              <tr key={b.id} className="hover:bg-gray-50/50 cursor-pointer transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-gray-500">{b.id.slice(0,8)}…</td>
                <td className="px-6 py-4 text-gray-700">{b.districtCode ?? '—'}</td>
                <td className="px-6 py-4 text-gray-700">{b.aslCode ?? '—'}</td>
                <td className="px-6 py-4 text-gray-600">
                  {b.intakeDate ? new Date(b.intakeDate).toLocaleDateString('it-IT') : '—'}
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                    ${b.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Paginazione */}
        {data?.pagination && (
          <div className="px-6 py-4 border-t border-gray-50 flex items-center justify-between text-sm text-gray-500">
            <span>Pagina {page} di {data.pagination.pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40
                           hover:bg-gray-50 transition-colors">←</button>
              <button onClick={() => setPage(p => Math.min(data.pagination.pages, p+1))}
                disabled={page === data.pagination.pages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40
                           hover:bg-gray-50 transition-colors">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
