import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BedDouble, Plus, Search, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { Modal, PageHead } from '../components/ui'
import { age, dateTime, dniDigits, fullName, inputDateTime } from '../lib/format'
import { ICD10 } from '../lib/catalogs'
import { stayDay, stayPath } from '../lib/inpatient'
import type { Bed, Hospitalization } from '../lib/types'

export const bedLabel = (b?: Pick<Bed, 'room' | 'label'>) => (b ? `Cuarto ${b.room}${b.label ? `-${b.label}` : ''}` : 'Sin cama')

/**
 * Hospitalizados: tablero de cuartos. Cualquier especialidad puede ocupar cualquier cama.
 * El conteo es de la clínica: ocupadas/total.
 */
export default function Inpatients() {
  const { beds, inpatients, patient, can } = useStore()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const admitFor = params.get('paciente')
  const [admitting, setAdmitting] = useState<{ bedId?: string } | null>(admitFor ? {} : null)

  const shown = beds
    .filter((b) => b.active)
    .sort((a, b) => a.room.localeCompare(b.room, 'es', { numeric: true }) || a.label.localeCompare(b.label))
  // El tablero es de camas: los pacientes en observación no ocupan cama
  const byBed = new Map(inpatients.filter((h) => h.kind !== 'observation' && h.bedId).map((h) => [h.bedId!, h]))
  const occupied = shown.filter((b) => byBed.has(b.id)).length
  const waiting = inpatients.filter((h) => h.kind !== 'observation' && !h.bedId)

  return (
    <div className="page">
      <PageHead title="Hospitalizados" sub={`${occupied}/${shown.length} camas`}
        actions={can('inpatient.orders') && <button className="btn btn--primary" onClick={() => setAdmitting({})}><Plus size={17} />Ingresar paciente</button>} />

      {waiting.length > 0 && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel__head"><div><h2>Sin cama asignada</h2><p>Ingresados desde la consulta externa: falta elegir la cama.</p></div></div>
          <div className="rows">{waiting.map((h) => {
            const p = patient(h.patientId)
            return p && (
              <Link key={h.id} to={`/app/hospitalizados/${h.id}?completar=1`} className="row">
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
            if (!h || !p) {
              return (
                <div key={b.id} className="bed bed--free">
                  <div className="bed__head"><b>{bedLabel(b)}</b><span>Libre</span></div>
                  <p className="muted">Cualquier especialidad</p>
                  {can('inpatient.orders') && <button className="btn btn--ghost btn--sm" onClick={() => setAdmitting({ bedId: b.id })}><Plus size={14} />Ingresar aquí</button>}
                </div>
              )
            }
            return (
              <Link key={b.id} to={`/app/hospitalizados/${h.id}`} className="bed">
                <div className="bed__head"><b>{bedLabel(b)}</b><span>Ocupado</span></div>
                <strong className="bed__name">{fullName(p)}</strong>
                <span className="bed__meta">{age(p.birthDate)}, {p.sex === 'F' ? 'femenino' : 'masculino'} · Día {stayDay(h.admittedAt)} de estancia</span>
                <span className="bed__dx">{h.diagnoses.map((d) => d.label).join('; ')}</span>
                {p.allergies.length > 0 && <span className="chip chip--red">Alergias: {p.allergies.join(', ')}</span>}
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
          onDone={(h) => nav(`/app/hospitalizados/${h.id}`)} />
      )}
    </div>
  )
}

/**
 * Buscador de pacientes de la clínica por nombre, expediente o identidad. Con `onNotFound`, si la búsqueda no
 * encuentra a nadie ofrece seguir sin expediente (receta para un paciente no registrado).
 */
export function PatientPicker({ value, onChange, onNotFound, notFoundLabel }: { value: string; onChange: (id: string) => void; onNotFound?: (query: string) => void; notFoundLabel?: string }) {
  const { patients, patient } = useStore()
  const [q, setQ] = useState('')
  const chosen = value ? patient(value) : undefined
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    return patients.filter((p) => !p.pending).filter((p) => fullName(p).toLowerCase().includes(s) || p.record.toLowerCase().includes(s) || (dniDigits(s).length >= 3 && dniDigits(p.dni).includes(dniDigits(s)))).slice(0, 8)
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
    <div className="field suggest"><span>Paciente</span>
      <Search size={16} style={{ position: 'absolute', left: 12, top: 37, color: 'var(--faint)' }} />
      <input className="input" style={{ paddingLeft: 36 }} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, expediente o identidad" aria-label="Buscar paciente" />
      {(matches.length > 0 || (onNotFound && q.trim().length >= 3)) && (
        <div className="suggest__list">
          {matches.map((p) => <button type="button" key={p.id} onClick={() => { onChange(p.id); setQ('') }}><span>{fullName(p)}</span><span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{p.record}</span></button>)}
          {onNotFound && q.trim().length >= 3 && (
            <button type="button" className="suggest__new" onClick={() => onNotFound(q.trim())}><Plus size={15} />{matches.length ? 'No es ninguno: ' : 'No está registrado: '}{notFoundLabel ?? 'continuar sin expediente'}</button>
          )}
        </div>
      )}
    </div>
  )
}

/** Diagnósticos CIE-10: se buscan en el catálogo o se escriben libres. */
export function DxPicker({ value, onChange, label = 'Diagnósticos' }: { value: { code: string; label: string }[]; onChange: (v: { code: string; label: string }[]) => void; label?: string }) {
  const [q, setQ] = useState('')
  const s = q.trim().toLowerCase()
  const matches = s ? ICD10.filter((d) => !value.some((x) => x.code === d.code) && (d.code.toLowerCase().includes(s) || d.label.toLowerCase().includes(s))).slice(0, 6) : []
  return (
    <div className="field"><span>{label}</span>
      {value.length > 0 && <ol className="dx-list">{value.map((d) => (
        <li key={d.code + d.label}><span><b>{d.label}</b> <span className="muted">{d.code}</span></span>
          <button type="button" className="icon-btn" aria-label={`Quitar ${d.label}`} onClick={() => onChange(value.filter((x) => x !== d))}><X size={15} /></button></li>
      ))}</ol>}
      <div className="suggest">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre o código CIE-10" aria-label="Buscar diagnóstico"
          onKeyDown={(e) => { if (e.key === 'Enter' && s && !matches.length) { e.preventDefault(); onChange([...value, { code: 'S/C', label: q.trim() }]); setQ('') } }} />
        {(matches.length > 0 || s) && (
          <div className="suggest__list">
            {matches.map((d) => <button type="button" key={d.code} onClick={() => { onChange([...value, d]); setQ('') }}><code>{d.code}</code>{d.label}</button>)}
            {!matches.length && <button type="button" onClick={() => { onChange([...value, { code: 'S/C', label: q.trim() }]); setQ('') }}>Agregar “{q.trim()}” sin código</button>}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Hoja de hospitalización: fecha y hora del ingreso, cama, acompañante, teléfonos y diagnósticos. Con `edit`
 * corrige un ingreso que ya existe (o le asigna la cama al que se ingresó desde la consulta) sin rehacerlo.
 */
export function AdmitModal({ initialPatientId, consultationId, bedId, edit, onClose, onDone }: {
  initialPatientId?: string; consultationId?: string; bedId?: string; edit?: Hospitalization; onClose: () => void; onDone: (h: Hospitalization) => void
}) {
  const { beds, inpatients, patient, admit, updateAdmission, fetchConsultation, inpatientOf } = useStore()
  const [patientId, setPatientId] = useState(edit?.patientId ?? initialPatientId ?? '')
  const p = patientId ? patient(patientId) : undefined
  const free = beds.filter((b) => b.active && (b.id === edit?.bedId || !inpatients.some((h) => h.bedId === b.id)))
    .sort((a, b) => a.room.localeCompare(b.room, 'es', { numeric: true }) || a.label.localeCompare(b.label))
  const [f, setF] = useState({
    bedId: edit?.bedId ?? bedId ?? '', admittedAt: inputDateTime(edit ? new Date(edit.admittedAt) : new Date()), reason: edit?.reason ?? '', companionName: edit?.companionName ?? '',
    companionRelation: edit?.companionRelation ?? '', companionPhone: edit?.companionPhone ?? '', patientPhone: edit?.patientPhone ?? '',
  })
  const [dx, setDx] = useState<{ code: string; label: string }[]>(edit?.diagnoses ?? [])
  const [busy, setBusy] = useState(false)
  const obs = edit?.kind === 'observation'

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
  const already = !edit && p && inpatientOf(p.id)
  const ready = p && !already && (f.bedId || obs) && f.reason.trim() && dx.length > 0

  return (
    <Modal title={edit ? (edit.bedId || obs ? 'Corregir ingreso' : 'Completar ingreso: cama y acompañante') : 'Ingreso a hospitalización'} wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ready || busy} onClick={async () => {
        setBusy(true)
        if (edit) {
          const h = await updateAdmission(edit.id, {
            bedId: !obs && f.bedId !== edit.bedId ? f.bedId : undefined, admittedAt: new Date(f.admittedAt).toISOString(), reason: f.reason.trim(), diagnoses: dx,
            companionName: f.companionName.trim() || undefined, companionRelation: f.companionRelation.trim() || undefined,
            companionPhone: f.companionPhone.trim() || undefined, patientPhone: f.patientPhone.trim() || undefined,
          })
          setBusy(false)
          if (h) onDone(h)
          return
        }
        const h = await admit({
          patientId, bedId: f.bedId, admittedAt: new Date(f.admittedAt).toISOString(), reason: f.reason.trim(), diagnoses: dx, consultationId,
          companionName: f.companionName.trim() || undefined, companionRelation: f.companionRelation.trim() || undefined,
          companionPhone: f.companionPhone.trim() || undefined, patientPhone: f.patientPhone.trim() || undefined,
        })
        setBusy(false)
        if (h) onDone(h)
      }}><BedDouble size={16} />{edit ? 'Guardar' : 'Ingresar'}</button>
    </>}>
      {(initialPatientId || edit) && p ? <div className="field"><span>Paciente</span><div className="picked"><b>{fullName(p)}</b><span className="muted">{p.record}, {age(p.birthDate)}</span></div></div>
        : <PatientPicker value={patientId} onChange={setPatientId} />}
      {edit && <p className="muted" style={{ fontSize: 13.5 }}>Se corrige el mismo ingreso: las notas, las órdenes y los medicamentos se conservan. Queda en la bitácora qué cambiaste.</p>}
      {!edit && <p className="muted" style={{ fontSize: 13.5 }}>Si el paciente tuvo una consulta externa con ingreso en las últimas 48 horas, este ingreso se vincula a ella y jala sus órdenes y medicamentos sin duplicarlos.</p>}
      {already && <div className="alert-strip">Este paciente ya está {already.kind === 'observation' ? 'en observación: desde su expediente puedes pasarlo a hospitalización' : 'hospitalizado'}. <Link to={stayPath(already)}>Abrir su expediente</Link>.</div>}
      <div className="form-grid">
        {!obs && <label className="field"><span>Cama</span>
          <select className="select" value={f.bedId} onChange={set('bedId')}>
            <option value="">Elige un cuarto libre</option>
            {free.map((b) => <option key={b.id} value={b.id}>{bedLabel(b)}</option>)}
          </select></label>}
        <label className="field"><span>Fecha y hora del ingreso</span><input className="input" type="datetime-local" value={f.admittedAt} onChange={set('admittedAt')} /></label>
        <label className="field span-2"><span>Motivo del ingreso</span><textarea className="textarea textarea--sm" rows={2} value={f.reason} onChange={set('reason')} /></label>
      </div>
      <DxPicker label="Diagnósticos de ingreso" value={dx} onChange={setDx} />
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
