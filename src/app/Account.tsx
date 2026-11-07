import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useStore } from '../lib/store'

/** Paneles de seguridad de la cuenta (contraseña y verificación en dos pasos); los usa Mi configuración (MC6). */
export function PasswordPanel() {
  const { changePassword } = useStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const mismatch = repeat.length > 0 && next !== repeat
  const valid = current && next.length >= 8 && next === repeat
  return (
    <section className="panel">
      <div className="panel__head"><h2>Cambiar contraseña</h2></div>
      <form className="panel__body stack" onSubmit={async (e) => {
        e.preventDefault()
        if (valid && await changePassword(current, next)) { setCurrent(''); setNext(''); setRepeat('') }
      }}>
        <label className="field"><span>Contraseña actual</span><input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="field"><span>Nueva contraseña, mínimo 8 caracteres</span><input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label className="field"><span>Repite la nueva contraseña</span><input className="input" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-invalid={mismatch} /></label>
        {mismatch && <p style={{ color: 'var(--red-ink)', fontSize: 13.5 }}>Las contraseñas no coinciden.</p>}
        <button className="btn btn--primary self-start" disabled={!valid}>Cambiar contraseña</button>
      </form>
    </section>
  )
}

export function TwoFactorPanel() {
  const { user, setupTwoFactor, enableTwoFactor, disableTwoFactor } = useStore()
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  if (!user) return null
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Verificación en dos pasos</h2><p>Además de la contraseña, pide un código de tu teléfono al entrar.</p></div></div>
      <div className="panel__body stack">
        {user.twoFactor ? (<>
          <div className="alert-strip alert-strip--calm"><ShieldCheck size={18} />Activada. Necesitarás tu app de códigos para entrar.</div>
          <label className="field"><span>Para desactivarla escribe tu contraseña</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="btn btn--danger self-start" disabled={!password} onClick={async () => { if (await disableTwoFactor(password)) setPassword('') }}>Desactivar</button>
        </>) : !setup ? (<>
          <p className="c-muted fs-base">Recomendado para médicos y administración. Necesitas una app como Google Authenticator o Microsoft Authenticator.</p>
          <button className="btn btn--primary self-start" onClick={async () => { const r = await setupTwoFactor(); if (r) setSetup(r) }}>Configurar</button>
        </>) : (<>
          <ol className="steps">
            <li>Abre tu app de autenticación y escanea este código.</li>
            <li>Escribe el código de 6 dígitos que aparece en la app.</li>
          </ol>
          {/* SVG generado por nuestro propio servidor */}
          <div className="qr" dangerouslySetInnerHTML={{ __html: setup.qr }} role="img" aria-label="Código QR para la app de autenticación" />
          <p className="fs-md c-muted">¿No puedes escanear? Escribe esta clave en la app: <code className="secret" style={{ fontSize: 13, padding: '2px 6px' }}>{setup.secret}</code></p>
          <div className="hstack">
            <input className="input num" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              style={{ width: 160, fontSize: 20, letterSpacing: '0.25em' }} aria-label="Código de verificación" />
            <button className="btn btn--primary" disabled={code.length !== 6} onClick={async () => { if (await enableTwoFactor(code)) { setSetup(null); setCode('') } }}>Activar</button>
            <button className="btn btn--ghost" onClick={() => { setSetup(null); setCode('') }}>Cancelar</button>
          </div>
        </>)}
      </div>
    </section>
  )
}
