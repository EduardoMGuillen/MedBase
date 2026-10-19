import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Avatar } from '../components/ui'
import { useStore } from '../lib/store'
import { ROLE_LABEL } from '../lib/permissions'

const DEMO_PASSWORD = 'demo1234'

export default function Login() {
  const { staff, signIn } = useStore()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const enter = (id: string) => { signIn(id); nav('/app') }

  // Enlace directo de demo: /login?as=s-herrera&next=/app/agenda
  const [params] = useSearchParams()
  useEffect(() => {
    const as = params.get('as')
    if (as && staff.some((s) => s.id === as)) { signIn(as); nav(params.get('next') ?? '/app', { replace: true }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const user = staff.find((s) => s.email.toLowerCase() === email.trim().toLowerCase())
    if (!user || password !== DEMO_PASSWORD) {
      setError('El correo o la contraseña no coinciden. Revisa los datos o entra con una cuenta de demo.')
      return
    }
    if (!user.active) {
      setError('Esta cuenta está desactivada. Pide a administración que la reactive.')
      return
    }
    enter(user.id)
  }

  const demo = ['s-herrera', 's-rios', 's-mejia', 's-admin'].map((id) => staff.find((s) => s.id === id)!)

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
            <button className="btn btn--primary btn--lg" type="submit">Iniciar sesión</button>
          </form>

          <div className="auth__demo">
            <span>Cuentas de demo (contraseña {DEMO_PASSWORD})</span>
            {demo.map((s) => (
              <button key={s.id} className="demo-role" onClick={() => enter(s.id)}>
                <Avatar name={s.name} color={s.color} />
                <span>
                  <strong>{s.name}</strong>
                  <small>{ROLE_LABEL[s.role]}{s.specialty ? `, ${s.specialty}` : ''}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
