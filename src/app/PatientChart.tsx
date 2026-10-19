import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FileBadge, FileText, Lock, NotebookPen, Pencil } from 'lucide-react'
import { useStore, type Chart } from '../lib/store'
import { Loading, StatusBadge } from '../components/ui'
import { PatientHeader } from '../components/PatientHeader'
import { age, BACKGROUND_GROUPS, bmi, date, time } from '../lib/format'
import { Attachments } from './Attachments'
import { AllergiesForm, BackgroundForm, IdentificationForm } from './PatientForms'
import type { Consultation, Patient, Vitals } from '../lib/types'

export function VitalsGrid({ v }: { v: Vitals }) {
  const warn = (x: boolean) => (x ? 'vital vital--warn' : 'vital')
  return (
    <div className="vitals">
      <div className={warn(v.systolic >= 140 || v.diastolic >= 90)}><span>Presión arterial</span><b>{v.systolic}/{v.diastolic}<small>mmHg</small></b></div>
      <div className={warn(v.heartRate > 100 || v.heartRate < 60)}><span>Frec. cardíaca</span><b>{v.heartRate}<small>lpm</small></b></div>
      <div className={warn(v.respRate != null && (v.respRate > 20 || v.respRate < 12))}><span>Frec. respiratoria</span><b>{v.respRate ?? '—'}<small>rpm</small></b></div>
      <div className={warn(v.temperature >= 37.6)}><span>Temperatura</span><b>{v.temperature.toFixed(1)}<small>°C</small></b></div>
      <div className={warn(v.spo2 < 94)}><span>Saturación</span><b>{v.spo2}<small>%</small></b></div>
      <div className="vital"><span>Peso / IMC</span><b>{v.weightKg || '—'}<small>kg</small>{v.weightKg && v.heightCm ? <small> (IMC {bmi(v.weightKg, v.heightCm)})</small> : null}</b></div>
      {v.glucose != null && <div className={warn(v.glucose > 180 || v.glucose < 70)}><span>Glucometría</span><b>{v.glucose}<small>mg/dL</small></b></div>}
      {v.painScale != null && v.painScale > 0 && <div className={warn(v.painScale >= 7)}><span>Dolor</span><b>{v.painScale}<small>/10</small></b></div>}
    </div>
  )
}

/** Carga el expediente clínico de un paciente. Cada carga queda en la bitácora del servidor. */
export function useChart(patientId: string | undefined, enabled: boolean) {
  const { fetchChart, notify } = useStore()
  const [chart, setChart] = useState<Chart | null>(null)
  const load = useCallback(() => {
    if (!patientId || !enabled) return
    fetchChart(patientId).then(setChart).catch((e: Error) => notify(e.message, 'error'))
  }, [patientId, enabled, fetchChart, notify])
  useEffect(load, [load])
  return { chart, reload: load }
}

/** Lista de pares etiqueta/valor; omite los vacíos salvo que se pida mostrarlos. */
function Facts({ rows, showEmpty = false }: { rows: [string, string | undefined][]; showEmpty?: boolean }) {
  const shown = rows.filter(([, v]) => showEmpty || v)
  return (
    <dl className="facts">
      {shown.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || <span className="muted">Sin dato</span>}</dd></div>)}
    </dl>
  )
}

export function Identification({ p }: { p: Patient }) {
  return <Facts showEmpty rows={[
    ['Nombre completo', `${p.firstName} ${p.lastName}`],
    ['Número de identidad', p.dni],
    ['Fecha de nacimiento', `${date(`${p.birthDate}T12:00:00`)} (${age(p.birthDate)})`],
    ['Sexo', p.sex === 'F' ? 'Femenino' : 'Masculino'],
    ['Estado civil', p.civilStatus],
    ['Ocupación', p.occupation],
    ['Escolaridad', p.education],
    ['Religión', p.religion],
    ['Procedencia y dirección', p.address],
    ['Teléfono', p.phone],
    ['Contacto de emergencia', p.emergencyName ? `${p.emergencyName}${p.emergencyRelation ? ` (${p.emergencyRelation})` : ''}${p.emergencyPhone ? `, ${p.emergencyPhone}` : ''}` : undefined],
    ['Aseguradora', p.insurance],
  ]} />
}

export function BackgroundView({ p, compact = false }: { p: Patient; compact?: boolean }) {
  const b = p.background ?? {}
  const groups = BACKGROUND_GROUPS.filter((g) => !g.female || p.sex === 'F')
  const any = groups.some((g) => g.fields.some((f) => b[f.key])) || p.conditions.length > 0
  if (!any) return <p className="muted">Sin antecedentes registrados.</p>
  return (
    <div className={`bg-groups ${compact ? 'bg-groups--compact' : ''}`}>
      {groups.map((g) => {
        const rows = g.fields.map((f) => [f.label, f.date && b[f.key] ? date(`${b[f.key]}T12:00:00`) : b[f.key]] as [string, string | undefined])
        const extra = g.title === 'Personales patológicos' && p.conditions.length ? [['Enfermedades crónicas', p.conditions.join(', ')] as [string, string]] : []
        const all = [...extra, ...rows].filter(([, v]) => v)
        if (!all.length) return null
        return <div key={g.title} className="bg-group"><h4>{g.title}</h4><Facts rows={all} /></div>
      })}
    </div>
  )
}

/** Una consulta en el orden de la historia clínica: el manejo siempre al final. */
export function ConsultationBody({ c, vitals }: { c: Consultation; vitals?: Vitals | null }) {
  return (
    <div className="note">
      <div className="note__sec"><h4>Motivo de consulta</h4><p>{c.reason}</p></div>
      {c.history && <div className="note__sec"><h4>Enfermedad actual</h4><p>{c.history}</p></div>}
      <div className="note__sec"><h4>Examen físico</h4>
        {vitals && <p className="note__vitals">PA {vitals.systolic}/{vitals.diastolic} mmHg, FC {vitals.heartRate} lpm{vitals.respRate ? `, FR ${vitals.respRate} rpm` : ''}, T {vitals.temperature.toFixed(1)} °C, SpO₂ {vitals.spo2}%{vitals.weightKg ? `, Peso ${vitals.weightKg} kg` : ''}{vitals.glucose ? `, Glucometría ${vitals.glucose} mg/dL` : ''}</p>}
        {c.exam ? <p>{c.exam}</p> : !vitals && <p className="muted">Sin registro.</p>}
      </div>
      <div className="note__sec"><h4>Impresión diagnóstica</h4>
        <ol className="note__list">{c.diagnoses.map((d) => <li key={d.code}>{d.label} <span className="muted">({d.code})</span></li>)}</ol>
      </div>
      <div className="note__sec"><h4>Manejo</h4>
        {c.orders.length
          ? <ol className="note__list">{c.orders.map((o, i) => <li key={i}>{o}</li>)}</ol>
          : <p>{c.plan || <span className="muted">Sin registro.</span>}</p>}
      </div>
    </div>
  )
}

type Tab = 'history' | 'consults' | 'vitals' | 'rx' | 'files'

export default function PatientChart() {
  const { id } = useParams()
  const { patient, appointments, staffById, can, updatePatient } = useStore()
  const [tab, setTab] = useState<Tab>('history')
  const [editing, setEditing] = useState<null | 'id' | 'allergies' | 'background'>(null)
  const clinical = can('chart.view')
  const p = patient(id!)
  // Sólo se pide el expediente de pacientes de la propia clínica
  const { chart, reload } = useChart(id, clinical && !!p)
  if (!p) return <div className="page"><div className="empty">Este expediente no existe. Vuelve a <Link to="/app/pacientes">Pacientes</Link>.</div></div>

  const cs = chart?.consultations ?? []
  const rxs = chart?.prescriptions ?? []
  const vs = chart?.vitals ?? []
  const appts = appointments.filter((a) => a.patientId === p.id).sort((a, b) => b.start.localeCompare(a.start))
  const tabs: [Tab, string, boolean][] = [
    ['history', 'Historia clínica', true], ['consults', `Consultas (${cs.length})`, clinical],
    ['vitals', 'Signos vitales', clinical], ['rx', `Recetas (${rxs.length})`, clinical && can('rx.view')], ['files', 'Archivos', clinical],
  ]
  const save = async (data: Partial<Patient>) => { if (await updatePatient(p.id, data)) { setEditing(null); reload() } }

  return (
    <div className="page page--chart">
      <div className="sticky-top">
        <PatientHeader p={p} clinical={clinical} />
        <div className="tabs tabs--scroll" role="tablist">
          {tabs.filter((t) => t[2]).map(([k, label]) => (
            <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>

      {clinical && !chart && tab !== 'history' && <Loading label="Cargando expediente" />}

      {tab === 'history' && (
        <div className="hc">
          <section className="panel hc__sec">
            <div className="panel__head"><h2><span className="hc__n">I.</span> Ficha de identificación</h2>
              {can('patients.manage') && <button className="btn btn--ghost btn--sm" onClick={() => setEditing('id')}><Pencil size={14} />Editar</button>}</div>
            <div className="panel__body"><Identification p={p} /></div>
          </section>

          {clinical ? (<>
            <section className={`panel hc__sec ${p.allergies.length ? 'hc__sec--alert' : ''}`}>
              <div className="panel__head"><h2><span className="hc__n">II.</span> Alergias</h2>
                <button className="btn btn--ghost btn--sm" onClick={() => setEditing('allergies')}><Pencil size={14} />Editar</button></div>
              <div className="panel__body">
                {p.allergies.length
                  ? <div className="chips">{p.allergies.map((a) => <span key={a} className="chip chip--red">{a}</span>)}</div>
                  : <p className="muted">Sin alergias conocidas.</p>}
                <p style={{ marginTop: 10, fontSize: 13.5 }}>Tipo de sangre: <b>{p.bloodType ?? 'Sin dato'}</b></p>
              </div>
            </section>

            <section className="panel hc__sec">
              <div className="panel__head"><h2><span className="hc__n">III.</span> Antecedentes</h2>
                <button className="btn btn--ghost btn--sm" onClick={() => setEditing('background')}><Pencil size={14} />Editar</button></div>
              <div className="panel__body"><BackgroundView p={p} /></div>
            </section>

            <section className="panel hc__sec">
              <div className="panel__head"><h2><span className="hc__n">IV.</span> Últimos signos vitales</h2>{vs[0] && <p>{date(vs[0].takenAt)}, {time(vs[0].takenAt)}</p>}</div>
              <div className="panel__body">{!chart ? <Loading /> : vs[0] ? <VitalsGrid v={vs[0]} /> : <p className="muted">Sin registros todavía.</p>}</div>
            </section>
          </>) : (
            <section className="panel"><div className="empty"><Lock size={20} style={{ margin: '0 auto 8px' }} />Alergias, antecedentes y consultas sólo están disponibles para médicos y enfermería.</div></section>
          )}

          <section className="panel hc__sec">
            <div className="panel__head"><h2>Citas</h2></div>
            {appts.length ? <div className="rows">{appts.slice(0, 12).map((a) => (
              <div key={a.id} className="row" style={{ gridTemplateColumns: '120px 1fr auto' }}>
                <span className="num" style={{ fontSize: 13.5 }}>{date(a.start, { day: 'numeric', month: 'short', year: '2-digit' })} {time(a.start)}</span>
                <div className="row__who"><strong>{a.reason}</strong><span>{staffById(a.doctorId)?.name}</span></div>
                <StatusBadge status={a.status} />
              </div>
            ))}</div> : <div className="empty">Sin citas registradas.</div>}
          </section>
        </div>
      )}

      {tab === 'consults' && chart && (
        <div className="hc">
          {cs.length ? cs.map((c) => (
            <article key={c.id} className="panel consult-entry">
              <div className="panel__head">
                <div><h2>{date(c.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2><p>{time(c.date)}, {staffById(c.doctorId)?.name}</p></div>
                <div className="page-head__actions">
                  <Link className="btn btn--ghost btn--sm" to={`/app/nota/${c.id}`}><NotebookPen size={15} />Nota</Link>
                  {c.prescriptionId && can('rx.view') && <Link className="btn btn--ghost btn--sm" to={`/app/recetas/${c.prescriptionId}`}><FileText size={15} />Receta</Link>}
                  {can('consult.write') && <Link className="btn btn--ghost btn--sm" to={`/app/constancia/${c.id}`}><FileBadge size={15} />Constancia médica</Link>}
                </div>
              </div>
              <div className="panel__body"><ConsultationBody c={c} vitals={vs.find((v) => v.id === c.vitalsId)} /></div>
            </article>
          )) : <section className="panel"><div className="empty">Este paciente aún no tiene consultas firmadas.</div></section>}
        </div>
      )}

      {tab === 'vitals' && chart && (
        <section className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Fecha</th><th>PA</th><th>FC</th><th>FR</th><th>Temp.</th><th>SpO₂</th><th>Peso</th><th>Motivo</th><th>Tomó</th></tr></thead>
            <tbody>{vs.map((v) => (
              <tr key={v.id} className="num">
                <td style={{ whiteSpace: 'nowrap' }}>{date(v.takenAt)} {time(v.takenAt)}</td><td>{v.systolic}/{v.diastolic}</td><td>{v.heartRate}</td><td>{v.respRate ?? '—'}</td>
                <td>{v.temperature.toFixed(1)} °C</td><td>{v.spo2}%</td><td>{v.weightKg ? `${v.weightKg} kg` : '—'}</td><td style={{ minWidth: 180 }}>{v.chiefComplaint ?? '—'}</td><td>{staffById(v.takenBy)?.name}</td>
              </tr>
            ))}</tbody>
          </table>
          {!vs.length && <div className="empty">Sin registros todavía.</div>}
        </section>
      )}

      {tab === 'rx' && chart && (
        <section className="panel">
          {rxs.length ? <div className="rows">{rxs.map((r) => (
            <Link key={r.id} to={`/app/recetas/${r.id}`} className="row" style={{ gridTemplateColumns: '110px 1fr auto' }}>
              <span className="num" style={{ fontSize: 13.5 }}>{date(r.issuedAt)}</span>
              <div className="row__who"><strong>{r.items.map((i) => i.drug).join(', ')}</strong><span>{r.folio}, {staffById(r.doctorId)?.name}</span></div>
              <FileText size={18} color="var(--faint)" />
            </Link>
          ))}</div> : <div className="empty">Sin recetas emitidas.</div>}
        </section>
      )}

      {tab === 'files' && clinical && <Attachments patientId={p.id} />}

      {editing === 'id' && <IdentificationForm title="Ficha de identificación" submitLabel="Guardar cambios" initial={p} onClose={() => setEditing(null)} onSave={save} />}
      {editing === 'allergies' && <AllergiesForm initial={p} onClose={() => setEditing(null)} onSave={save} />}
      {editing === 'background' && <BackgroundForm initial={p} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  )
}
