// src/pages/DashboardPage.tsx
import { useQuery }   from '@tanstack/react-query'
import { format }     from 'date-fns'
import { it }         from 'date-fns/locale'
import api            from '../lib/api'
import {
  Users, Calendar, ClipboardCheck, AlertTriangle,
  TrendingUp, Activity, Clock, CheckCircle2,
} from 'lucide-react'

// ── Tipi ──────────────────────────────────────────────────
interface KpiData {
  activeOperators:     number
  todayAppointments:   number
  completedToday:      number
  pendingCheckIn:      number
  alertsToday:         number
  offlineQueue:        number
}

// ── Hook dati ─────────────────────────────────────────────
function useDashboard() {
  return useQuery<KpiData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const [appts, attendance] = await Promise.all([
        api.get('/appointments', { params: { date: today, limit: 200 } }),
        api.get('/attendance',   { params: { from: today, to: today, limit: 200 } }),
      ])
      const apptList  = appts.data.data ?? []
      const attnList  = attendance.data.data ?? []
      return {
        activeOperators:   new Set(apptList.map((a: any) => a.operatorId)).size,
        todayAppointments: apptList.length,
        completedToday:    attnList.filter((a: any) => a.status === 'checked_out').length,
        pendingCheckIn:    apptList.filter((a: any) => a.status === 'scheduled').length,
        alertsToday:       0,
        offlineQueue:      0,
      }
    },
    refetchInterval: 30_000,
  })
}

function useTodayAppointments() {
  const today = format(new Date(), 'yyyy-MM-dd')
  return useQuery({
    queryKey: ['appointments', 'today'],
    queryFn:  () => api.get('/appointments', { params: { date: today, limit: 50 } })
                       .then(r => r.data.data ?? []),
    refetchInterval: 15_000,
  })
}

// ── Componenti ────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color, sub }: {
  icon: any; label: string; value: number | string
  color: string; sub?: string
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled:  'bg-blue-100 text-blue-700',
    confirmed:  'bg-indigo-100 text-indigo-700',
    in_progress:'bg-amber-100 text-amber-700',
    completed:  'bg-green-100 text-green-700',
    cancelled:  'bg-red-100 text-red-700',
    missed:     'bg-gray-100 text-gray-700',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

// ── Pagina principale ─────────────────────────────────────
export default function DashboardPage() {
  const { data: kpi, isLoading } = useDashboard()
  const { data: appointments }   = useTodayAppointments()
  const today = format(new Date(), "EEEE d MMMM yyyy", { locale: it })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500 text-sm capitalize mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2 bg-green-50 border border-green-200
                        px-3 py-1.5 rounded-full">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs font-medium text-green-700">Sistema operativo</span>
        </div>
      </div>

      {/* KPI Grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({length: 6}).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 animate-pulse h-28">
              <div className="h-4 bg-gray-100 rounded w-1/2 mb-3" />
              <div className="h-8 bg-gray-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          <KpiCard icon={Users}          label="Operatori attivi oggi"
            value={kpi?.activeOperators ?? 0}
            color="bg-blue-50 text-blue-600" />
          <KpiCard icon={Calendar}       label="Appuntamenti oggi"
            value={kpi?.todayAppointments ?? 0}
            color="bg-indigo-50 text-indigo-600" />
          <KpiCard icon={CheckCircle2}   label="Visite completate"
            value={kpi?.completedToday ?? 0}
            color="bg-green-50 text-green-600"
            sub={`su ${kpi?.todayAppointments ?? 0} totali`} />
          <KpiCard icon={Clock}          label="In attesa check-in"
            value={kpi?.pendingCheckIn ?? 0}
            color="bg-amber-50 text-amber-600" />
          <KpiCard icon={AlertTriangle}  label="Alert clinici"
            value={kpi?.alertsToday ?? 0}
            color="bg-red-50 text-red-600" />
          <KpiCard icon={Activity}       label="Queue offline"
            value={kpi?.offlineQueue ?? 0}
            color="bg-purple-50 text-purple-600"
            sub="record in attesa sync" />
        </div>
      )}

      {/* Appuntamenti del giorno */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Appuntamenti oggi</h2>
          <span className="text-xs text-gray-400">Aggiornamento ogni 15s</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-6 py-3 text-left font-medium">Orario</th>
                <th className="px-6 py-3 text-left font-medium">Operatore</th>
                <th className="px-6 py-3 text-left font-medium">Beneficiario</th>
                <th className="px-6 py-3 text-left font-medium">Servizio</th>
                <th className="px-6 py-3 text-left font-medium">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(appointments ?? []).slice(0, 20).map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-3 font-mono text-xs text-gray-600">
                    {format(new Date(a.scheduledStart), 'HH:mm')}–
                    {format(new Date(a.scheduledEnd),   'HH:mm')}
                  </td>
                  <td className="px-6 py-3 text-gray-700">
                    {a.operatorId?.slice(0, 8)}…
                  </td>
                  <td className="px-6 py-3 font-medium text-gray-800">
                    {a.carePlan?.beneficiary?.firstName ?? '—'}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {a.serviceType?.name ?? '—'}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
              {!appointments?.length && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    Nessun appuntamento per oggi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
