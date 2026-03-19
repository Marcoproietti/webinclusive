// src/pages/LoginPage.tsx
import { useState, FormEvent } from 'react'
import { useNavigate }         from 'react-router-dom'
import { useAuthStore }        from '../store/auth.store'
import { Activity, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const navigate      = useNavigate()
  const login         = useAuthStore((s) => s.login)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow]         = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Errore di accesso'
      if (msg.includes('INVALID_CREDENTIALS')) setError('Email o password non corretti.')
      else if (msg.includes('USER_INACTIVE'))  setError('Account disabilitato.')
      else setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A5276] to-[#148F77]
                    flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16
                          bg-white/20 rounded-2xl mb-4">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">WEB.INCLUSIVE</h1>
          <p className="text-white/70 mt-1">Centrale Operativa ADI</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Accedi</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email aziendale
              </label>
              <input
                type="email" value={email} required
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@webinclusive.it"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-[#1A5276]/30
                           focus:border-[#1A5276] transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'} value={password} required
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl
                             focus:outline-none focus:ring-2 focus:ring-[#1A5276]/30
                             focus:border-[#1A5276] transition-all text-sm"
                />
                <button type="button" onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3
                              text-red-700 text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-[#1A5276] hover:bg-[#154360] disabled:opacity-60
                         text-white font-semibold py-3 px-4 rounded-xl transition-all
                         focus:outline-none focus:ring-2 focus:ring-[#1A5276]/50">
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/50 text-xs mt-6">
          WEB.INCLUSIVE v1.0 — Tutti i diritti riservati
        </p>
      </div>
    </div>
  )
}
