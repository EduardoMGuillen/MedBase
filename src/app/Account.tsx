import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, PageHead } from '../components/ui'
import { ROLE_LABEL, ROLE_PERMISSIONS, PERMISSIONS } from '../lib/permissions'
import { ScheduleEditor } from './ScheduleEditor'

export default function Account() {
  const { user, staffById } = useStore()
  if (!user) return null
  // El horario viene de la lista del personal, que se actualiza al guardar
  const me = staffById(user.id) ?? user
  return (
    <div className="page">
      <PageHead title="Mi cuenta" sub="Tu contraseña y la verificación en dos pasos." />
      <div className="chart-head" style={{ gridTemplateColumns: 'auto 1fr' }}>
        <Avatar name={user.name} color={user.color} />
        <div>
          <h1 style={{ fontSize: 24 }}>{user.name}</h1>
          <div className="chart-meta"><span>{ROLE_LABEL[user.role]}{user.specialty ? `, ${user.specialty}` : ''}</span><span>{user.email}</span>{user.license && <span>Colegiación <b>{user.license}</b></span>}</div>
        </div>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <PasswordPanel />
        <TwoFactorPanel />
      </div>
      {user.role === 'doctor' && (
        <section className="panel">
          <div className="panel__head"><div><h2>Mi horario de atención</h2><p>La agenda y la reserva en línea sólo ofrecen horas dentro de tu horario.</p></div></div>
          <div className="panel__body"><ScheduleEditor key={JSON.stringify(me.schedule)} d={me} /></div>
        </section>
      )}
      <section className="panel">
        <div className="panel__head"><h2>Lo que tu rol permite</h2></div>
        <div className="panel__body"><div className="chips">{ROLE_PERMISSIONS[user.role].map((p) => <span key={p} className="chip">{PERMISSIONS[p]}</span>)}</div></div>
      </section>
    </div>
  )
}

function PasswordPanel() {
  const { changePassword } = useStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const mismatch = repeat.length > 0 && next !== repeat
  const valid = current && next.length >= 8 && next === repeat
  return (
    <section className="panel">
      <div className="panel__head"><h2>Cambiar contraseña</h2></div>
      <form className="panel__body" style={{ display: 'grid', gap: 14 }} onSubmit={async (e) => {
        e.preventDefault()
        if (valid && await changePassword(current, next)) { setCurrent(''); setNext(''); setRepeat('') }
      }}>
        <label className="field"><span>Contraseña actual</span><input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="field"><span>Nueva contraseña, mínimo 8 caracteres</span><input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label className="field"><span>Repite la nueva contraseña</span><input className="input" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-invalid={mismatch} /></label>
        {mismatch && <p style={{ color: 'var(--red-ink)', fontSize: 13.5 }}>Las contraseñas no coinciden.</p>}
        <button className="btn btn--primary" style={{ justifySelf: 'start' }} disabled={!valid}>Cambiar contraseña</button>
      </form>
    </section>
  )
}

function TwoFactorPanel() {
  const { user, setupTwoFactor, enableTwoFactor, disableTwoFactor } = useStore()
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  if (!user) return null
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Verificación en dos pasos</h2><p>Además de la contraseña, pide un código de tu teléfono al entrar.</p></div></div>
      <div className="panel__body" style={{ display: 'grid', gap: 14 }}>
        {user.twoFactor ? (<>
          <div className="alert-strip alert-strip--calm"><ShieldCheck size={18} />Activada. Necesitarás tu app de códigos para entrar.</div>
          <label className="field"><span>Para desactivarla escribe tu contraseña</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="btn btn--danger" style={{ justifySelf: 'start' }} disabled={!password} onClick={async () => { if (await disableTwoFactor(password)) setPassword('') }}>Desactivar</button>
        </>) : !setup ? (<>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Recomendado para médicos y administración. Necesitas una app como Google Authenticator o Microsoft Authenticator.</p>
          <button className="btn btn--primary" style={{ justifySelf: 'start' }} onClick={async () => { const r = await setupTwoFactor(); if (r) setSetup(r) }}>Configurar</button>
        </>) : (<>
          <ol className="steps">
            <li>Abre tu app de autenticación y escanea este código.</li>
            <li>Escribe el código de 6 dígitos que aparece en la app.</li>
          </ol>
          {/* SVG generado por nuestro propio servidor */}
          <div className="qr" dangerouslySetInnerHTML={{ __html: setup.qr }} role="img" aria-label="Código QR para la app de autenticación" />
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>¿No puedes escanear? Escribe esta clave en la app: <code className="secret" style={{ fontSize: 13, padding: '2px 6px' }}>{setup.secret}</code></p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
