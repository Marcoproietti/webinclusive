// src/pages/OperatorsPage.tsx
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api from '../lib/api'
import { UserCheck, Plus, MapPin } from 'lucide-react'

export default function OperatorsPage() {
  const [zone, setZone] = useState('')
  const [qual, setQual] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['operators', zone, qual],
    queryFn:  () => api.get('/operators', {
      params: { ...(zone ? { zone } : {}), ...(qual ? { qualification: qual } : {}) }
    }).then(r => r.data),
  })

  const quals = ['OSS','OTS','infermiere','fisioterapista','assistente_sociale']

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <UserCheck className="w-6 h-6 text-[#1A5276]" />
          <h1 className="text-2xl font-bold text-gray-800">Operatori</h1>
        </div>
        <button className="flex items-center gap-2 bg-[#1A5276] text-white
                           px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#154360] transition-colors">
          <Plus className="w-4 h-4" /> Nuovo operatore
        </button>
      </div>

      {/* Filtri */}
      <div className="flex gap-3 mb-4">
        <select value={qual} onChange={e => setQual(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-[#1A5276]/30">
          <option value="">Tutte le qualifiche</option>
          {quals.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <input value={zone} onChange={e => setZone(e.target.value)}
          placeholder="Zona territoriale..."
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-[#1A5276]/30" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading && Array.from({length:6}).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-pulse">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gray-100" />
              <div className="space-y-1">
                <div className="h-4 bg-gray-100 rounded w-32" />
                <div className="h-3 bg-gray-100 rounded w-20" />
              </div>
            </div>
          </div>
        ))}
        {!isLoading && (data?.data ?? []).map((op: any) => (
          <div key={op.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100
                                       hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1A5276]/10 flex items-center
                                justify-center text-[#1A5276] font-bold text-sm">
                  {op.email?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{op.email}</p>
                  <p className="text-xs text-gray-500">{op.operator?.badgeNumber}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                ${op.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {op.isActive ? 'Attivo' : 'Inattivo'}
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                <span className="font-medium text-gray-700">{op.operator?.qualification ?? '—'}</span>
              </div>
              {op.operator?.territoryZone && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{op.operator.territoryZone}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
