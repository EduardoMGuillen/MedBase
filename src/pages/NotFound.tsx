import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'

export default function NotFound({ inApp = false }: { inApp?: boolean }) {
  return (
    <div className={inApp ? 'page' : 'auth__main'} style={{ minHeight: inApp ? undefined : '100vh' }}>
      <div className="notfound">
        {!inApp && <Logo />}
        <svg viewBox="0 0 320 60" width="280" height="52" aria-hidden="true">
          <path d="M0 40 H120 L130 40 L140 40 H320" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <h1>Esta página no existe</h1>
        <p>Puede que el enlace esté incompleto o que la página se haya movido.</p>
        <Link className="btn btn--primary" to={inApp ? '/app' : '/'}>{inApp ? 'Ir al inicio' : 'Volver al sitio'}</Link>
      </div>
    </div>
  )
}
