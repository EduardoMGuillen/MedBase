import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Check, Receipt, Stethoscope } from 'lucide-react'
import { useStore } from '../lib/store'
import { money } from '../lib/format'
import { ScheduleEditor } from './ScheduleEditor'

const STEPS = [
  { title: 'Tu consultorio', hint: 'Lo que sale en tus recetas y constancias.', icon: Stethoscope },
  { title: 'Tu horario', hint: 'La agenda y la reserva en línea sólo ofrecen estas horas.', icon: CalendarClock },
  { title: 'Precio de la consulta', hint: 'Lo que se cobra en caja. Lo demás lo ajustas en Configuración.', icon: Receipt },
] as const

/**
 * Primer ingreso del médico titular de un consultorio: datos del consultorio, horario y precio de la consulta.
 * Cada paso se puede saltar; al terminar (o saltar todo) no vuelve a aparecer y todo se cambia en Configuración.
 */
export default function Onboarding() {
  const { settings, saveSettings, services, updateService, staffById, user, finishSetup } = useStore()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [f, setF] = useState({ name: settings.name, address: settings.address, phone: settings.phone, specialty: settings.specialty ?? '', license: settings.license ?? '' })
  const consult = services.find((s) => s.active) ?? services[0]
  const [price, setPrice] = useState(String(consult?.price ?? ''))
  const [busy, setBusy] = useState(false)
  const me = user ? staffById(user.id) : undefined
  const finish = async () => { if (await finishSetup()) nav('/app', { replace: true }) }
  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : finish())
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const S = STEPS[step]

  return (
    <div className="page onboard">
      <div className="onboard__head">
        <h1>Hola, {me?.name ?? 'bienvenido a Clinara'}</h1>
        <p className="muted">Tres pasos para dejar listo tu consultorio. Puedes saltar cualquiera y completarlo después en Configuración.</p>
        <ol className="onboard__steps">{STEPS.map((x, i) => (
          <li key={x.title} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}><span>{i < step ? <Check size={14} /> : i + 1}</span>{x.title}</li>
        ))}</ol>
      </div>
      <section className="panel">
        <div className="panel__head"><div><h2><S.icon size={18} style={{ verticalAlign: '-3px' }} /> {S.title}</h2><p>{S.hint}</p></div></div>
        <div className="panel__body" style={{ display: 'grid', gap: 14 }}>
          {step === 0 && (<>
            <div className="form-grid">
              <label className="field span-2"><span>Nombre del consultorio</span><input className="input" value={f.name} onChange={set('name')} /></label>
              <label className="field span-2"><span>Dirección</span><input className="input" value={f.address} onChange={set('address')} placeholder="Col., calle, número, ciudad" /></label>
              <label className="field"><span>Teléfono</span><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
              <label className="field"><span>Especialidad</span><input className="input" value={f.specialty} onChange={set('specialty')} /></label>
              <label className="field"><span>Número de colegiación</span><input className="input" value={f.license} onChange={set('license')} /></label>
            </div>
            <p className="muted" style={{ fontSize: 13.5 }}>El logo lo subes en Configuración; si no hay, las recetas salen con tu nombre como encabezado.</p>
          </>)}
          {step === 1 && me && <ScheduleEditor key={JSON.stringify(me.schedule)} d={me} onSaved={next} />}
          {step === 2 && consult && (
            <label className="field" style={{ maxWidth: 280 }}><span>{consult.name} ({settings.currency})</span>
              <input className="input num" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              <small className="muted">Hoy: {money(consult.price, settings.currency)}</small></label>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {step !== 1 && (
              <button className="btn btn--primary" disabled={busy || (step === 0 && (f.name.trim().length < 3 || f.address.trim().length < 3 || f.phone.replace(/\D/g, '').length < 7))} onClick={async () => {
                setBusy(true)
                const ok = step === 0
                  ? await saveSettings({ ...settings, name: f.name.trim(), address: f.address.trim(), phone: f.phone.trim(), specialty: f.specialty.trim(), license: f.license.trim() })
                  : consult && Number(price) !== consult.price ? await updateService(consult.id, { price: Number(price) }) : true
                setBusy(false)
                if (ok) next()
              }}>{step === STEPS.length - 1 ? 'Terminar' : 'Guardar y seguir'}</button>
            )}
            <button className="btn btn--ghost" onClick={next}>{step === STEPS.length - 1 ? 'Saltar y terminar' : 'Saltar este paso'}</button>
            {step < STEPS.length - 1 && <button className="btn btn--ghost" onClick={finish}>Lo hago después</button>}
          </div>
        </div>
      </section>
    </div>
  )
}
