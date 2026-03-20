// src/pages/ProfilePage.tsx
import { useState } from 'react'
import { useAuthStore }    from '../store/auth.store'
import { useProfileStore } from '../store/profile.store'
import { useThemeStore, COLOR_THEMES, FONT_LABELS, type FontOption, type ColorTheme } from '../store/theme.store'
import api from '../lib/api'

const ROLE_LABELS: Record<string, string> = {
  admin:    'Amministratore',
  operator: 'Operatore',
  manager:  'Responsabile',
  viewer:   'Visualizzatore',
}

/* ─── Sezione Informazioni ─────────────────────────────── */
function SectionInfo() {
  const { user }                      = useAuthStore()
  const { profile, updateProfile }    = useProfileStore()
  const [form, setForm]               = useState({
    ...profile,
    email: profile.email || user?.email || '',
  })
  const [saved, setSaved]             = useState(false)

  const initials = ((form.nome?.[0] ?? '') + (form.cognome?.[0] ?? '')).toUpperCase()
    || user?.email?.slice(0, 2).toUpperCase() || 'XX'

  const handleSave = () => {
    updateProfile(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </label>
      <input
        className="input"
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={`Inserisci ${label.toLowerCase()}`}
      />
    </div>
  )

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <span className="card-title">Informazioni Personali</span>
      </div>

      {/* Avatar */}
      <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'var(--navy)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 700, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-900)' }}>
            {(form.nome || form.cognome) ? `${form.nome} ${form.cognome}`.trim() : (user?.email ?? '—')}
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 500, textTransform: 'capitalize',
            background: 'var(--teal-light)', color: 'var(--teal)',
            border: '1px solid color-mix(in srgb, var(--teal) 25%, transparent)',
            borderRadius: 99, padding: '3px 10px', marginTop: 4,
          }}>
            {user?.role ? (ROLE_LABELS[user.role] ?? user.role) : '—'}
          </span>
        </div>
      </div>

      {/* Campi */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {field('Nome',      'nome')}
        {field('Cognome',   'cognome')}
        {field('Telefono',  'telefono',  'tel')}
        {field('Cellulare', 'cellulare', 'tel')}
      </div>

      {/* Email + Ruolo */}
      <div style={{ padding: '14px 24px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <ReadField label="Utente" value={user?.email ?? '—'} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Email
          </label>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Nuova email"
          />
        </div>
        <ReadField label="Ruolo" value={user?.role ? (ROLE_LABELS[user.role] ?? user.role) : '—'} />
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave}>Salva modifiche</button>
        {saved && <span style={{ fontSize: 12, color: 'var(--teal)' }}>✓ Salvato</span>}
      </div>
    </div>
  )
}

/* ─── Sezione Password ─────────────────────────────────── */
function SectionPassword() {
  const [form, setForm]     = useState({ current: '', next: '', confirm: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  const valid = form.current && form.next.length >= 8 && form.next === form.confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setStatus('loading')
    setErrMsg('')
    try {
      await api.post('/auth/change-password', {
        current_password: form.current,
        new_password:     form.next,
      })
      setStatus('ok')
      setForm({ current: '', next: '', confirm: '' })
    } catch (err: any) {
      setStatus('error')
      setErrMsg(err?.response?.data?.message ?? 'Errore durante il cambio password.')
    }
  }

  const inp = (label: string, key: keyof typeof form, placeholder: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </label>
      <input
        className="input"
        type="password"
        autoComplete="new-password"
        value={form[key]}
        placeholder={placeholder}
        onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setStatus('idle') }}
      />
    </div>
  )

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <span className="card-title">Sicurezza</span>
      </div>
      <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
          {inp('Password attuale',   'current', '••••••••')}
          {inp('Nuova password',     'next',    'Min. 8 caratteri')}
          {inp('Conferma password',  'confirm', 'Ripeti nuova password')}
        </div>

        {form.next && form.next.length < 8 && (
          <p style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 10 }}>La password deve avere almeno 8 caratteri.</p>
        )}
        {form.next && form.confirm && form.next !== form.confirm && (
          <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>Le password non coincidono.</p>
        )}
        {status === 'error' && (
          <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{errMsg}</p>
        )}
        {status === 'ok' && (
          <p style={{ fontSize: 12, color: 'var(--teal)', marginBottom: 10 }}>✓ Password aggiornata con successo.</p>
        )}

        <button
          className="btn btn-primary btn-sm"
          type="submit"
          disabled={!valid || status === 'loading'}
        >
          {status === 'loading' ? 'Salvataggio…' : 'Cambia password'}
        </button>
      </form>
    </div>
  )
}

/* ─── Sezione Impostazioni ─────────────────────────────── */
function SectionSettings() {
  const { font, colorTheme, setFont, setColorTheme } = useThemeStore()

  const fonts: FontOption[] = ['dm-sans', 'system', 'inter', 'serif', 'mono']
  const themes = Object.entries(COLOR_THEMES) as [ColorTheme, typeof COLOR_THEMES[ColorTheme]][]

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Impostazioni Aspetto</span>
      </div>
      <div style={{ padding: '20px 24px' }}>

        {/* Font */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Carattere
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {fonts.map(f => (
              <button
                key={f}
                onClick={() => setFont(f)}
                style={{
                  padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  fontFamily: f === 'serif' ? "'DM Serif Display', Georgia, serif"
                            : f === 'mono'  ? "'JetBrains Mono', monospace"
                            : f === 'inter' ? "'Inter', sans-serif"
                            : undefined,
                  border: font === f
                    ? '2px solid var(--navy)'
                    : '1px solid var(--gray-300)',
                  background: font === f ? 'var(--navy-50)' : 'white',
                  color: font === f ? 'var(--navy)' : 'var(--gray-700)',
                  fontWeight: font === f ? 600 : 400,
                  transition: 'all .12s',
                }}
              >
                {FONT_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Colore */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Tema Colore
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {themes.map(([key, t]) => (
              <button
                key={key}
                onClick={() => setColorTheme(key)}
                title={t.label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                  border: colorTheme === key
                    ? `2px solid ${t.vars.navy}`
                    : '1px solid var(--gray-300)',
                  background: colorTheme === key ? t.vars.navy50 : 'white',
                  transition: 'all .12s',
                }}
              >
                {/* Anteprima colori */}
                <span style={{ display: 'flex', gap: 3 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: t.vars.navy, display: 'inline-block' }} />
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: t.vars.teal, display: 'inline-block' }} />
                </span>
                <span style={{
                  fontSize: 12, fontWeight: colorTheme === key ? 600 : 400,
                  color: colorTheme === key ? t.vars.navy : 'var(--gray-700)',
                }}>
                  {t.label}
                </span>
                {colorTheme === key && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.vars.navy} strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Campo sola lettura ───────────────────────────────── */
function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </label>
      <div className="input" style={{ background: 'var(--gray-50)', color: 'var(--gray-500)', cursor: 'default' }}>
        {value}
      </div>
    </div>
  )
}

/* ─── Page ─────────────────────────────────────────────── */
export default function ProfilePage() {
  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }} className="fade-up">
      <div className="page-header">
        <h1 className="page-title">Profilo Utente</h1>
        <p className="page-sub">Gestisci le tue informazioni, la sicurezza e le preferenze di visualizzazione</p>
      </div>
      <SectionInfo />
      <SectionPassword />
      <SectionSettings />
    </div>
  )
}
