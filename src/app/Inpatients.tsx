import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DateTimeField } from '../components/DateTimeField'
import { localValueToIso } from '../lib/dateInput'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BedDouble, Plus, Search, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { Modal, PageHead } from '../components/ui'
import { age, dateTime, dniDigits, fullName, inputDateTime } from '../lib/format'
import { DiagnosisPicker } from '../components/DiagnosisPicker'
import { attendingText, defaultSpecialty, stayDay, stayPath } from '../lib/inpatient'
import { ConsentChoice } from './ConsentFlow'
import { BedFields } from '../components/BedFields'
import type { Bed, Diagnosis, Hospitalization, Patient } from '../lib/types'
import { normalize } from '../lib/patients'

export const bedLabel = (b?: Pick<Bed, 'room' | 'label'>) => (b ? `Cuarto ${b.room}${b.label ? `-${b.label}` : ''}` : 'Sin cama')

/**
 * Hospitalizados: tablero de cuartos. Las camas no tienen especialidad (AD3): cada paciente lleva la de su ingreso.
 * El conteo es de la clínica: ocupadas/en servicio.
 */
export default function Inpatients() {
  const { beds, inpatients, patient, can, bedStays = [], staffById } = useStore()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const admitFor = params.get('paciente')
  const [admitting, setAdmitting] = useState<{ bedId?: string } | null>(admitFor ? {} : null)
  // HO2 (ronda 16): recepción y administración ingresan (y abren la autorización aquí mismo) pero no ven el expediente
  const chart = can('inpatient.view')
  const [consent, setConsent] = useState<{ authorizationId: string; patientId: string } | null>(null)
  const nameOf = (id: string) => staffById(id)?.name

  const shown = beds
    .filter((b) => b.active)
    .sort((a, b) => a.room.localeCompare(b.room, 'es', { numeric: true }) || a.label.localeCompare(b.label))
  // El tablero es de camas: los pacientes en observación no ocupan cama
  const byBed = new Map(inpatients.filter((h) => h.kind !== 'observation' && h.bedId).map((h) => [h.bedId!, h]))
  const occupied = shown.filter((b) => (chart ? byBed.has(b.id) : bedStays.some((x) => x.bedId === b.id))).length
  const waiting = inpatients.filter((h) => h.kind !== 'observation' && !h.bedId)

  return (
    <div className="page">
      <PageHead title="Hospitalizados" sub={`${occupied}/${shown.length} camas`}
        actions={can('inpatient.admit') && <button className="btn btn--primary" data-tour="ingresar" onClick={() => setAdmitting({})}><Plus size={17} />Ingresar paciente</button>} />

      {waiting.length > 0 && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel__head"><div><h2>Sin cama asignada</h2><p>Ingresados desde la consulta externa: falta elegir la cama.</p></div></div>
          <div className="rows">{waiting.map((h) => {
            const p = patient(h.patientId)
            return p && (
              <Link key={h.id} to={`/app/hospitalizados/${h.id}?completar=1`} className="row row--plain">
                <div className="row__who"><strong>{fullName(p)}</strong><span>{h.diagnoses.map((d) => d.label).join('; ')} · ingresó {dateTime(h.admittedAt)}</span></div>
                <span className="badge badge--amber">Asignar cama</span>
              </Link>
            )
          })}</div>
        </section>
      )}

      {!beds.length ? (
        <section className="panel"><div className="empty">La clínica todavía no tiene camas. Administración las agrega en Configuración, pestaña Camas.</div></section>
      ) : (
        <div className="beds">
          {shown.map((b) => {
            const h = byBed.get(b.id)
            const p = h && patient(h.patientId)
            // HO2 (ronda 16): sin acceso al expediente, la cama ocupada solo dice quién está, la especialidad y el médico tratante
            const lite = !chart ? bedStays.find((x) => x.bedId === b.id) : undefined
            const lp = lite && patient(lite.patientId)
            if (lite && lp) {
              return (
                <div key={b.id} className="bed">
                  <div className="bed__head"><b>{bedLabel(b)}</b><span>Ocupado</span></div>
                  <strong className="bed__name">{fullName(lp)}</strong>
                  {lite.specialty && <span className="badge badge--ink bed__spec">{lite.specialty}</span>}
                  {lite.attendingIds?.length ? <span className="bed__meta">Médico tratante: {attendingText(lite.attendingIds, nameOf)}</span> : null}
                </div>
              )
            }
            if (!h || !p) {
              return (
                <div key={b.id} className="bed bed--free">
                  <div className="bed__head"><b>{bedLabel(b)}</b><span>Libre</span></div>
                  <p className="muted">La especialidad la da quien ingresa</p>
                  {can('inpatient.admit') && <button className="btn btn--ghost btn--sm" onClick={() => setAdmitting({ bedId: b.id })}><Plus size={14} />Ingresar aquí</button>}
                </div>
              )
            }
            return (
              <Link key={b.id} to={`/app/hospitalizados/${h.id}`} className="bed">
                <div className="bed__head"><b>{bedLabel(b)}</b><span>Ocupado</span></div>
                <strong className="bed__name">{fullName(p)}</strong>
                {h.specialty && <span className="badge badge--ink bed__spec">{h.specialty}</span>}
                <span className="bed__meta">{age(p.birthDate)}, {p.sex === 'F' ? 'femenino' : 'masculino'} · Día {stayDay(h.admittedAt)} de estancia</span>
                <span className="bed__dx">{h.diagnoses.map((d) => d.label).join('; ')}</span>
                <span className="bed__meta">Médico tratante: {attendingText(h.attendingIds ?? [h.admittedBy], nameOf)}</span>
                {p.allergies.length > 0 && <span className="chip chip--red">Alergias: {p.allergies.join(', ')}</span>}
                {/* HO2 (ronda 16): ingreso directo sin nota de ingreso firmada; se quita sola al firmarla */}
                {h.ordersPending && <span className="chip chip--red">Sin órdenes de ingreso</span>}
                {h.authPending && <span className="chip chip--amber">Autorización pendiente de firma</span>}
                <span className="bed__meta">Ingresó {dateTime(h.admittedAt)}</span>
              </Link>
            )
          })}
        </div>
      )}

      {admitting && (
        <AdmitModal initialPatientId={admitFor ?? undefined} consultationId={params.get('consulta') ?? undefined} bedId={admitting.bedId}
          onClose={() => { setAdmitting(null); if (admitFor) setParams({}) }}
          onDone={(h) => {
            // HO2 (ronda 16): el médico sigue al expediente (autorización y luego la nota de ingreso); recepción y administración
            // abren la autorización aquí y se quedan en el tablero
            if (chart) { nav(`/app/hospitalizados/${h.id}?firmar=1`); return }
            setAdmitting(null)
            if (admitFor) setParams({})
            if (h.authorizationId) setConsent({ authorizationId: h.authorizationId, patientId: h.patientId })
          }} />
      )}
      {consent && patient(consent.patientId) && <ConsentChoice authorizationId={consent.authorizationId} p={patient(consent.patientId)!} onDone={() => setConsent(null)} />}
    </div>
  )
}

/**
 * Buscador de pacientes de la clínica por nombre, expediente o identidad. Con `onNotFound`, si la búsqueda no
 * encuentra a nadie ofrece seguir sin expediente (receta para un paciente no registrado).
 */
/**
 * El buscador de pacientes de la app: busca mientras se escribe, desde 2 letras, por nombre, expediente o identidad, sin importar
 * tildes ni mayúsculas (RU7, ronda 15). Opcional: `label`, `placeholder`, `detail` (una línea más en cada resultado, ej. la
 * ubicación) y `onQuery` (avisa lo escrito, para esconder otras listas mientras se busca).
 */
export function PatientPicker({ value, onChange, onNotFound, notFoundLabel, autoFocus = true, label = 'Paciente', placeholder = 'Nombre, expediente o identidad', detail, onQuery }: {
  value: string; onChange: (id: string) => void; onNotFound?: (query: string) => void; notFoundLabel?: string; autoFocus?: boolean
  label?: string; placeholder?: string; detail?: (p: Patient) => ReactNode; onQuery?: (q: string) => void
}) {
  const { patients, patient } = useStore()
  const [q, setQRaw] = useState('')
  const setQ = (v: string) => { setQRaw(v); onQuery?.(v) }
  const chosen = value ? patient(value) : undefined
  const matches = useMemo(() => {
    const s = normalize(q)
    if (s.length < 2) return []
    const words = s.split(' ')
    return patients.filter((p) => !p.pending).filter((p) => {
      const text = normalize(`${fullName(p)} ${p.record}`)
      return words.every((w) => text.includes(w)) || (dniDigits(s).length >= 3 && dniDigits(p.dni).includes(dniDigits(s)))
    }).slice(0, 8)
  }, [patients, q])
  if (chosen) {
    return (
      <div className="field"><span>Paciente</span>
        <div className="picked"><b>{fullName(chosen)}</b><span className="muted">{chosen.record}{chosen.dni ? `, ID ${chosen.dni}` : ''}, {age(chosen.birthDate)}</span>
          <button className="icon-btn" aria-label="Cambiar paciente" onClick={() => onChange('')}><X size={15} /></button></div>
      </div>
    )
  }
  return (
    <div className="field suggest"><span>{label}</span>
      <Search size={16} style={{ position: 'absolute', left: 12, top: 37, color: 'var(--faint)' }} />
      <input className="input" style={{ paddingLeft: 36 }} autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Buscar paciente" />
      {(matches.length > 0 || (onNotFound && q.trim().length >= 3)) && (
        <div className="suggest__list">
          {matches.map((p) => (
            <button type="button" key={p.id} onClick={() => { onChange(p.id); setQ('') }}>
              {detail
                ? <span className="suggest__pt"><span>{fullName(p)}</span><small className="muted">{[p.record, p.dni ? `ID ${p.dni}` : ''].filter(Boolean).join(' · ')}{detail(p) ? <> · {detail(p)}</> : null}</small></span>
                : <><span>{fullName(p)}</span><span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{p.record}</span></>}
            </button>
          ))}
          {onNotFound && q.trim().length >= 3 && (
            <button type="button" className="suggest__new" onClick={() => onNotFound(q.trim())}><Plus size={15} />{matches.length ? 'No es ninguno: ' : 'No está registrado: '}{notFoundLabel ?? 'continuar sin expediente'}</button>
          )}
        </div>
      )}
    </div>
  )
}

/** Diagnósticos del ingreso y del egreso: el mismo buscador CIE-11 de la consulta. */
export function DxPicker({ value, onChange, label = 'Diagnósticos', recode }: { value: Diagnosis[]; onChange: (v: Diagnosis[]) => void; label?: string; recode?: Diagnosis[] }) {
  return <DiagnosisPicker value={value} onChange={onChange} label={`${label} (CIE-11)`} recode={recode} />
}

/** Hoja de hospitalización: fecha y hora del ingreso, cama, acompañante, teléfonos y diagnósticos. */
export function AdmitModal({ initialPatientId, consultationId, bedId, onClose, onDone }: {
  initialPatientId?: string; consultationId?: string; bedId?: string; onClose: () => void; onDone: (h: Hospitalization & { authorizationId?: string }) => void
}) {
  const { patient, admit, fetchConsultation, inpatientOf, can } = useStore()
  // HO2 (ronda 16): si ingresa un médico, por defecto él es el médico tratante y los diagnósticos son obligatorios; si ingresa
  // recepción o administración, el médico tratante es obligatorio y el diagnóstico lo pone el médico en la nota de ingreso
  const doctor = can('inpatient.orders')
  const [patientId, setPatientId] = useState(initialPatientId ?? '')
  const p = patientId ? patient(patientId) : undefined
  const [f, setF] = useState({
    bedId: bedId ?? '', admittedAt: inputDateTime(new Date()), reason: '', companionName: '', companionRelation: '', companionPhone: '', patientPhone: '',
  })
  const [dx, setDx] = useState<Diagnosis[]>([])
  const [busy, setBusy] = useState(false)
  const { user, staffById } = useStore()
  const [attending, setAttending] = useState<string[]>(() => (doctor && user ? [user.id] : []))
  const [specialty, setSpecialty] = useState(() => (doctor ? defaultSpecialty(user) : ''))
  // Recepción: la especialidad del ingreso es la del médico tratante principal (se puede cambiar)
  const pickAttending = (ids: string[]) => {
    setAttending(ids)
    if (!doctor && ids[0] && (!specialty.trim() || specialty === defaultSpecialty(staffById(attending[0])))) setSpecialty(defaultSpecialty(staffById(ids[0])))
  }

  // Desde la consulta externa: se toman su motivo y sus diagnósticos
  useEffect(() => {
    if (!consultationId) return
    fetchConsultation(consultationId).then(({ consultation: c }) => {
      setDx(c.diagnoses)
      setF((x) => ({ ...x, reason: x.reason || c.reason }))
    }).catch(() => null)
  }, [consultationId, fetchConsultation])
  useEffect(() => {
    if (!p) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setF((x) => ({ ...x, patientPhone: x.patientPhone || p.phone, companionName: x.companionName || p.emergencyName || '',
      companionRelation: x.companionRelation || p.emergencyRelation || '', companionPhone: x.companionPhone || p.emergencyPhone || '' }))
  }, [p])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const already = p && inpatientOf(p.id)
  const ready = p && !already && f.bedId && f.reason.trim() && (dx.length > 0 || !doctor) && attending.length > 0

  return (
    <Modal title="Ingreso a hospitalización" wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true)
        const h = await admit({
          patientId, bedId: f.bedId, admittedAt: localValueToIso(f.admittedAt), reason: f.reason.trim(), diagnoses: dx, consultationId, specialty: specialty.trim() || undefined, attendingIds: attending,
          companionName: f.companionName.trim() || undefined, companionRelation: f.companionRelation.trim() || undefined,
          companionPhone: f.companionPhone.trim() || undefined, patientPhone: f.patientPhone.trim() || undefined,
        })
        setBusy(false)
        if (h) onDone(h)
      }}><BedDouble size={16} />Ingresar</button>
    </>}>
      {initialPatientId && p ? <div className="field"><span>Paciente</span><div className="picked"><b>{fullName(p)}</b><span className="muted">{p.record}, {age(p.birthDate)}</span></div></div>
        : <PatientPicker value={patientId} onChange={setPatientId} />}
      <p className="muted" style={{ fontSize: 13.5 }}>Si el paciente tuvo una consulta externa con ingreso en las últimas 48 horas, este ingreso se vincula a ella y jala sus órdenes y medicamentos sin duplicarlos.</p>
      {already && <div className="alert-strip">Este paciente ya está {already.kind === 'observation' ? 'en observación: desde su expediente puedes pasarlo a hospitalización' : 'hospitalizado'}. <Link to={stayPath(already)}>Abrir su expediente</Link>.</div>}
      <div className="form-grid">
        <div className="span-2"><BedFields bedId={f.bedId} specialty={specialty} onChange={(v) => { setF({ ...f, bedId: v.bedId }); setSpecialty(v.specialty) }} /></div>
        <div className="field"><span>Fecha y hora del ingreso</span><DateTimeField value={f.admittedAt} onChange={(v) => setF({ ...f, admittedAt: v })} label="Fecha y hora del ingreso" /></div>
        {/* HO2 (ronda 16): antes del motivo del ingreso */}
        <div className="span-2"><AttendingPicker value={attending} onChange={pickAttending} required={!doctor} /></div>
        <label className="field span-2"><span>Motivo del ingreso</span><textarea className="textarea textarea--sm" rows={2} value={f.reason} onChange={set('reason')} /></label>
      </div>
      <DxPicker label={doctor ? 'Diagnósticos de ingreso' : 'Diagnósticos de ingreso (opcional)'} value={dx} onChange={setDx} />
      {!doctor && <small className="muted" style={{ marginTop: -6, display: 'block' }}>El diagnóstico lo pone el médico en la nota de ingreso</small>}
      <fieldset className="fs"><legend>Contacto</legend>
        <div className="form-grid">
          <label className="field"><span>Teléfono del paciente</span><input className="input" inputMode="tel" value={f.patientPhone} onChange={set('patientPhone')} /></label>
          <label className="field"><span>Quién lo acompaña</span><input className="input" value={f.companionName} onChange={set('companionName')} /></label>
          <label className="field"><span>Parentesco</span><input className="input" value={f.companionRelation} onChange={set('companionRelation')} /></label>
          <label className="field"><span>Teléfono del acompañante</span><input className="input" inputMode="tel" value={f.companionPhone} onChange={set('companionPhone')} /></label>
        </div>
      </fieldset>
    </Modal>
  )
}

/**
 * HO2 (ronda 16): «Médico tratante»: uno o varios médicos activos de la clínica; el primero es el principal. Se agregan de la
 * lista y se quitan con la X; «Principal» sube a otro al primer lugar.
 */
export function AttendingPicker({ value, onChange, required = false }: { value: string[]; onChange: (ids: string[]) => void; required?: boolean }) {
  const { staff } = useStore()
  const doctors = staff.filter((s) => s.active && (s.roles ?? [s.role]).includes('doctor')).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? 'Médico'
  const rest = doctors.filter((d) => !value.includes(d.id))
  return (
    <div className="field attending">
      <span>Médico tratante</span>
      {value.length > 0 && (
        <div className="attending__list">
          {value.map((id, i) => (
            <span key={id} className="chip attending__chip">
              {name(id)}{i === 0 && value.length > 1 ? ' · principal' : ''}
              {i > 0 && <button type="button" className="link-btn" onClick={() => onChange([id, ...value.filter((x) => x !== id)])}>Hacer principal</button>}
              <button type="button" className="icon-btn" aria-label={`Quitar a ${name(id)}`} onClick={() => onChange(value.filter((x) => x !== id))}><X size={13} /></button>
            </span>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <select className="input" aria-label={value.length ? 'Agregar otro médico tratante' : 'Médico tratante'} value="" onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]) }}>
          <option value="">{value.length ? 'Agregar otro médico tratante…' : 'Elige al médico tratante'}</option>
          {rest.map((d) => <option key={d.id} value={d.id}>{d.name}{d.specialty ? ` · ${d.specialty}` : ''}</option>)}
        </select>
      )}
      {required && !value.length && <small className="field__msg field__msg--warn">Obligatorio: al médico tratante le llega el aviso para escribir la nota de ingreso.</small>}
    </div>
  )
}
