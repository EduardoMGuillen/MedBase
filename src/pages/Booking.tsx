import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Building2, CalendarCheck, ChevronLeft, ChevronRight, Phone } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Avatar, Loading } from '../components/ui'
import { api } from '../lib/api'
import { cap, DAY_NAMES, formatPhone, localISODate } from '../lib/format'
import { DniInput } from '../components/DniInput'
import type { Schedule } from '../lib/types'
import { describeSchedule, rangesOn } from '../lib/schedule'

interface Clinic { name: string; address: string; phone: string; doctors: { id: string; name: string; specialty?: string; color: string; schedule?: Schedule }[] }

const DAYS_AHEAD = 21

/** Sin clínica en la dirección: lista de clínicas que reciben reservas (o entra directo si hay una sola). */
function ClinicChooser() {
  const [list, setList] = useState<{ slug: string; name: string; address: string }[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api<{ slug: string; name: string; address: string }[]>('/public/clinics').then(setList).catch((e: Error) => setError(e.message)) }, [])
  if (list?.length === 1) return <Navigate to={`/reservar/${list[0].slug}`} replace />
  return (
    <div className="booking">
      <header className="booking__nav"><div className="lp-wrap"><Link to="/" aria-label="Inicio"><Logo /></Link></div></header>
      <main className="lp-wrap booking__main">
        <div className="booking__intro"><h1>Reserva tu cita</h1><p>Elige la clínica donde quieres atenderte.</p></div>
        {error ? <div className="auth__err">{error}</div> : !list ? <Loading /> : list.length ? (
          <div className="doc-grid">{list.map((c) => (
            <Link key={c.slug} to={`/reservar/${c.slug}`} className="doc-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="clinic-ico"><Building2 size={20} /></span>
              <span style={{ flex: 1 }}><strong>{c.name}</strong><small>{c.address}</small></span><ChevronRight size={18} color="var(--faint)" />
            </Link>
          ))}</div>
        ) : <div className="empty">Por ahora ninguna clínica recibe reservas en línea.</div>}
        <p className="booking__back"><Link to="/"><ChevronLeft size={14} style={{ display: 'inline', verticalAlign: '-2px' }} />Volver al sitio</Link></p>
      </main>
    </div>
  )
}

export default function Booking() {
  const { slug } = useParams()
  return slug ? <ClinicBooking slug={slug} /> : <ClinicChooser />
}

function ClinicBooking({ slug }: { slug: string }) {
  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [error, setError] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [day, setDay] = useState('')
  const [slots, setSlots] = useState<string[] | null>(null)
  const [time, setTime] = useState('')
  const [f, setF] = useState({ firstName: '', lastName: '', birthDate: '', sex: '' as '' | 'F' | 'M', phone: '', email: '', dni: '', reason: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ code: string; doctor: string; start: string } | null>(null)

  useEffect(() => { api<Clinic>(`/public/${slug}/clinic`).then(setClinic).catch((e: Error) => setError(e.message)) }, [slug])
  useEffect(() => {
    if (!doctorId || !day) return
    setSlots(null); setTime('')
    api<{ slots: string[] }>(`/public/${slug}/slots?doctorId=${doctorId}&date=${day}`).then((r) => setSlots(r.slots)).catch((e: Error) => setError(e.message))
  }, [doctorId, day, slug])

  const doctor = clinic?.doctors.find((d) => d.id === doctorId)
  const dates = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d }), [])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: k === 'phone' ? formatPhone(e.target.value) : e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!f.sex) { setError('Indica el sexo del paciente.'); return }
    setBusy(true)
    try {
      setDone(await api(`/public/${slug}/book`, { body: { doctorId, date: day, time, ...f } }))
      window.scrollTo({ top: 0 })
    } catch (err) {
      setError((err as Error).message)
      if (/ocuparse/.test((err as Error).message)) { setTime(''); setSlots(null); api<{ slots: string[] }>(`/public/${slug}/slots?doctorId=${doctorId}&date=${day}`).then((r) => setSlots(r.slots)) }
    } finally { setBusy(false) }
  }

  return (
    <div className="booking">
      <header className="booking__nav">
        <div className="lp-wrap">
          <Link to="/" aria-label="Inicio"><Logo /></Link>
          {clinic && <span className="booking__clinic">{clinic.name}</span>}
        </div>
      </header>

      <main className="lp-wrap booking__main">
        {!clinic ? (error ? <div className="auth__err">{error}</div> : <Loading />) : done ? (
          <section className="booking__done">
            <CalendarCheck size={44} color="var(--mint-ink)" />
            <h1>Tu cita quedó reservada</h1>
            <p className="booking__when">{cap(new Date(done.start).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' }))} a las {done.start.slice(11, 16)}</p>
            <p>con {done.doctor} en {clinic.name}</p>
            <div className="booking__code">Código de reserva <b className="num">{done.code}</b></div>
            <p style={{ color: 'var(--muted)', maxWidth: '46ch' }}>Te escribiremos por WhatsApp un día antes para confirmar. Llega 10 minutos antes con tu identificación. Si necesitas cambiarla, llama al {clinic.phone}.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a className="btn btn--ghost" href={`tel:${clinic.phone.replace(/[^\d+]/g, '')}`}><Phone size={16} />Llamar a la clínica</a>
              <button className="btn btn--primary" onClick={() => { setDone(null); setDay(''); setTime(''); setDoctorId(''); setF({ ...f, reason: '' }) }}>Reservar otra cita</button>
            </div>
          </section>
        ) : (<>
          <div className="booking__intro">
            <h1>Reserva tu cita</h1>
            <p>{clinic.address}. Elige médico, día y hora; no necesitas crear una cuenta.</p>
          </div>

          <ol className="booking__steps">
            <li className="booking__step">
              <h2><span className="journey__n">1</span> Elige médico</h2>
              <div className="doc-grid">
                {clinic.doctors.map((d) => (
                  <button key={d.id} className="doc-card" aria-pressed={doctorId === d.id} onClick={() => { setDoctorId(d.id); setDay(''); setSlots(null) }}>
                    <Avatar name={d.name} color={d.color} size={44} />
                    <span><strong>{d.name}</strong><small>{d.specialty}</small>
                      {d.schedule && <small>{describeSchedule(d.schedule)}</small>}</span>
                  </button>
                ))}
              </div>
            </li>

            {doctor && (
              <li className="booking__step">
                <h2><span className="journey__n">2</span> Elige día y hora</h2>
                <div className="date-strip" role="radiogroup" aria-label="Día">
                  {dates.map((d) => {
                    const key = localISODate(d)
                    const works = rangesOn(doctor.schedule, key).length > 0
                    return (
                      <button key={key} role="radio" aria-checked={day === key} disabled={!works} className="date-chip" onClick={() => setDay(key)}>
                        <small>{DAY_NAMES[d.getDay()].slice(0, 3)}</small><b className="num">{d.getDate()}</b><small>{d.toLocaleDateString('es-HN', { month: 'short' })}</small>
                      </button>
                    )
                  })}
                </div>
                {day && (slots === null ? <Loading label="Buscando horarios" /> : slots.length ? (
                  <div className="slot-grid" role="radiogroup" aria-label="Hora">
                    {slots.map((s) => <button key={s} role="radio" aria-checked={time === s} className="slot num" onClick={() => setTime(s)}>{s}</button>)}
                  </div>
                ) : <p className="empty" style={{ textAlign: 'left', padding: '12px 0' }}>No quedan horarios libres ese día. Prueba con otra fecha.</p>)}
              </li>
            )}

            {time && (
              <li className="booking__step">
                <h2><span className="journey__n">3</span> Datos del paciente</h2>
                <form onSubmit={submit} className="form-grid" style={{ maxWidth: 720 }}>
                  <label className="field"><span>Nombres</span><input className="input" required autoComplete="given-name" value={f.firstName} onChange={set('firstName')} /></label>
                  <label className="field"><span>Apellidos</span><input className="input" required autoComplete="family-name" value={f.lastName} onChange={set('lastName')} /></label>
                  <label className="field"><span>Fecha de nacimiento</span><input className="input" type="date" required max={localISODate(new Date())} value={f.birthDate} onChange={set('birthDate')} /></label>
                  <label className="field"><span>Sexo</span><select className="select" required value={f.sex} onChange={set('sex')}><option value="">Elige</option><option value="F">Femenino</option><option value="M">Masculino</option></select></label>
                  <label className="field"><span>Teléfono con WhatsApp</span><input className="input" required inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} placeholder="9876-5432" /></label>
                  <label className="field"><span>Número de identidad (opcional)</span><DniInput value={f.dni} onChange={(dni) => setF({ ...f, dni })} /></label>
                  <label className="field"><span>Correo (opcional)</span><input className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} /></label>
                  <label className="field span-2"><span>Motivo de la consulta</span><input className="input" required value={f.reason} onChange={set('reason')} placeholder="Ej. Dolor de garganta desde hace 3 días" /></label>
                  <input type="text" name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
                  {error && <div className="auth__err span-2" role="alert">{error}</div>}
                  <div className="span-2 booking__summary">
                    <span>{doctor?.name}, {new Date(`${day}T12:00:00`).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })} a las {time}</span>
                    <button className="btn btn--primary btn--lg" disabled={busy}>{busy ? 'Reservando…' : 'Confirmar reserva'}</button>
                  </div>
                </form>
              </li>
            )}
          </ol>
          {!time && error && <div className="auth__err" role="alert">{error}</div>}
        </>)}
        <p className="booking__back"><Link to="/"><ChevronLeft size={14} style={{ display: 'inline', verticalAlign: '-2px' }} />Volver al sitio</Link></p>
      </main>
    </div>
  )
}
