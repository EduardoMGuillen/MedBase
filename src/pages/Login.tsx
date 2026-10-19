import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Avatar } from '../components/ui'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { ROLE_LABEL } from '../lib/permissions'
import type { Staff } from '../lib/types'

export default function Login() {
  const { user, signIn } = useStore()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState<{ accounts: Staff[]; password: string | null }>({ accounts: [], password: null })

  useEffect(() => {
    api<typeof demo>('/demo-accounts').then(setDemo).catch((e: Error) => setError(e.message))
  }, [])

  if (user) return <Navigate to="/app" replace />

  const enter = async (mail: string, pw: string) => {
    setBusy(true)
    setError('')
    try {
      await signIn(mail, pw)
      nav('/app')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) { setError('Escribe tu correo y tu contraseña.'); return }
    enter(email.trim(), password)
  }

  return (
    <div className="auth">
      <aside className="auth__side">
        <Link to="/" aria-label="Volver al inicio"><Logo light /></Link>
        <svg className="auth__trace" viewBox="0 0 600 120" preserveAspectRatio="none" height="120" width="100%" aria-hidden="true">
          <path d="M0 80 H160 Q172 66 184 80 H206 L212 92 L222 14 L232 108 L240 80 H262 Q284 56 306 80 H600" fill="none" stroke="var(--mint-strong)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <h2>Tu turno empieza con la agenda de hoy lista.</h2>
        <p>Entra con tu cuenta de la clínica. Lo que ves depende de tu rol.</p>
      </aside>

      <main className="auth__main">
        <div className="auth__card">
          <h1>Iniciar sesión</h1>
          <p>Usa el correo que te asignó tu clínica.</p>
          <form onSubmit={submit} style={{ display: 'grid', gap: 14 }} noValidate>
            {error && <div className="auth__err" role="alert">{error}</div>}
            <label className="field">
              <span>Correo</span>
              <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@clinica.com" required />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button className="btn btn--primary btn--lg" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'}</button>
          </form>

          {demo.accounts.length > 0 && demo.password && (
            <div className="auth__demo">
              <span>Cuentas de demo (contraseña {demo.password})</span>
              {demo.accounts.filter((s) => s.id !== 's-paz' && s.id !== 's-zuniga').map((s) => (
                <button key={s.id} className="demo-role" disabled={busy} onClick={() => enter(s.email, demo.password!)}>
                  <Avatar name={s.name} color={s.color} />
                  <span>
                    <strong>{s.name}</strong>
                    <small>{ROLE_LABEL[s.role]}{s.specialty ? `, ${s.specialty}` : ''}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
