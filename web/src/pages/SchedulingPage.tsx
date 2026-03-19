// src/pages/SchedulingPage.tsx
import { useQuery }  from '@tanstack/react-query'
import { useState }  from 'react'
import { format, startOfWeek, addDays, isSameDay } from 'date-fns'
import { it }        from 'date-fns/locale'
import api           from '../lib/api'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function SchedulingPage() {
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
  const days      = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const { data } = useQuery({
    queryKey: ['appointments', 'week', format(weekStart, 'yyyy-Www')],
    queryFn:  () => api.get('/appointments', {
      params: { week: format(weekStart, "yyyy-'W'II"), limit: 500 }
    }).then(r => r.data.data ?? []),
  })

  const appointmentsByDay = (day: Date) =>
    (data ?? []).filter((a: any) =>
      isSameDay(new Date(a.scheduledStart), day)
    )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Pianificazione</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentWeek(d => addDays(d, -7))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">
            {format(weekStart, "d MMM", { locale: it })} –{' '}
            {format(addDays(weekStart, 6), "d MMM yyyy", { locale: it })}
          </span>
          <button onClick={() => setCurrentWeek(d => addDays(d, 7))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-7 divide-x divide-gray-100">
          {days.map((day) => (
            <div key={day.toISOString()}>
              <div className={`px-3 py-3 text-center border-b border-gray-100
                ${isSameDay(day, new Date()) ? 'bg-[#1A5276]' : 'bg-gray-50'}`}>
                <p className={`text-xs font-medium uppercase tracking-wide
                  ${isSameDay(day, new Date()) ? 'text-white/70' : 'text-gray-400'}`}>
                  {format(day, 'EEE', { locale: it })}
                </p>
                <p className={`text-lg font-bold
                  ${isSameDay(day, new Date()) ? 'text-white' : 'text-gray-700'}`}>
                  {format(day, 'd')}
                </p>
              </div>
              <div className="p-2 min-h-[400px] space-y-1">
                {appointmentsByDay(day).map((a: any) => (
                  <div key={a.id}
                    className="bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 text-xs cursor-pointer hover:bg-blue-100 transition-colors">
                    <p className="font-semibold text-blue-800 truncate">
                      {format(new Date(a.scheduledStart), 'HH:mm')}
                    </p>
                    <p className="text-blue-600 truncate">{a.serviceType?.name ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
