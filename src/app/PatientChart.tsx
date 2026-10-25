import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BedDouble, FileBadge, FileText, Lock, NotebookPen, Pencil } from 'lucide-react'
import { MedAlertBanner } from './MedAlerts'
import type { InpatientFile } from '../lib/types'
import { FOLLOWUP_KIND } from '../lib/followups'
import { bedLabel } from './Inpatients'
import { useStore, type Chart } from '../lib/store'
import { Loading, StatusBadge } from '../components/ui'
import { PatientHeader } from '../components/PatientHeader'
import { age, BACKGROUND_GROUPS, bmi, date, time } from '../lib/format'
import { Attachments } from './Attachments'
import { AllergiesForm, BackgroundForm, IdentificationForm } from './PatientForms'
import type { Certificate, Consultation, Patient, Vitals } from '../lib/types'
import { CERT_KIND } from '../lib/certificates'
import { vitalLevel, type VitalKey } from '../lib/vitals'
import { stayPath, yearsOld } from '../lib/inpatient'

/** Signos de una preclínica. Resalta lo que está fuera de rango según la edad (`src/lib/vitals.ts`). */
export function VitalsGrid({ v, birthDate }: { v: Vitals; birthDate?: string }) {
  const ageYears = birthDate ? yearsOld(birthDate) : undefined
  const off = (k: VitalKey) => v[k] != null && vitalLevel(k, v[k]!, ageYears) !== 'ok'
  const warn = (x: boolean) => (x ? 'vital vital--warn' : 'vital')
  const cells = [
    v.systolic != null && v.diastolic != null && <div key="pa" className={warn(off('systolic') || off('diastolic'))}><span>Presión arterial</span><b>{v.systolic}/{v.diastolic}<small>mmHg</small></b></div>,
    v.heartRate != null && <div key="fc" className={warn(off('heartRate'))}><span>Frec. cardíaca</span><b>{v.heartRate}<small>lpm</small></b></div>,
    v.respRate != null && <div key="fr" className={warn(off('respRate'))}><span>Frec. respiratoria</span><b>{v.respRate}<small>rpm</small></b></div>,
    v.temperature != null && <div key="t" className={warn(off('temperature'))}><span>Temperatura</span><b>{v.temperature.toFixed(1)}<small>°C</small></b></div>,
    v.spo2 != null && <div key="spo2" className={warn(off('spo2'))}><span>Saturación</span><b>{v.spo2}<small>%</small></b></div>,
    (v.weightKg != null || v.heightCm != null) && <div key="peso" className="vital"><span>Peso / IMC</span><b>{v.weightKg ?? '—'}<small>kg</small>{v.weightKg && v.heightCm ? <small> (IMC {bmi(v.weightKg, v.heightCm)})</small> : null}</b></div>,
    v.glucose != null && <div key="glu" className={warn(off('glucose'))}><span>Glucometría</span><b>{v.glucose}<small>mg/dL</small></b></div>,
    v.painScale != null && <div key="dolor" className={warn(off('painScale'))}><span>Dolor</span><b>{v.painScale}<small>/10</small></b></div>,
  ].filter(Boolean)
  if (!cells.length) return <p className="muted">Sin signos registrados en esta preclínica.</p>
  return <div className="vitals">{cells}</div>
}

/** Carga el expediente clínico de un paciente. Cada carga queda en la bitácora del servidor. */
function HospAlerts({ id }: { id?: string }) {
  const { fetchInpatient } = useStore()
  const [file, setFile] = useState<InpatientFile | null>(null)
  useEffect(() => {
    if (!id) { setFile(null); return }
    fetchInpatient(id).then(setFile).catch(() => setFile(null))
  }, [id, fetchInpatient])
  if (!file) return null
  return <MedAlertBanner file={file} />
}

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

/** Antecedentes del paciente; `only` limita a ciertos grupos (p. ej. sólo los no patológicos). */
export function BackgroundView({ p, compact = false, only }: { p: Patient; compact?: boolean; only?: string[] }) {
  const b = p.background ?? {}
  const groups = BACKGROUND_GROUPS.filter((g) => (!g.female || p.sex === 'F') && (!only || only.includes(g.title)))
  const withConditions = groups.some((g) => g.title === 'Personales patológicos') && p.conditions.length > 0
  const any = groups.some((g) => g.fields.some((f) => b[f.key])) || withConditions
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
      {c.history && <div className="note__sec"><h4>Historia de la enfermedad actual</h4><p>{c.history}</p></div>}
      <div className="note__sec"><h4>Examen físico</h4>
        {vitals && <p className="note__vitals">{[
          vitals.systolic != null && vitals.diastolic != null && `PA ${vitals.systolic}/${vitals.diastolic} mmHg`,
          vitals.heartRate != null && `FC ${vitals.heartRate} lpm`,
          vitals.respRate != null && `FR ${vitals.respRate} rpm`,
          vitals.temperature != null && `T ${vitals.temperature.toFixed(1)} °C`,
          vitals.spo2 != null && `SpO₂ ${vitals.spo2}%`,
          vitals.weightKg != null && `Peso ${vitals.weightKg} kg`,
          vitals.glucose != null && `Glucometría ${vitals.glucose} mg/dL`,
        ].filter(Boolean).join(', ') || 'Sin signos en la preclínica.'}</p>}
        {c.exam ? <p>{c.exam}</p> : !vitals && <p className="muted">Sin registro.</p>}
      </div>
      {c.observations && <div className="note__sec"><h4>Observaciones</h4><p>{c.observations}</p></div>}
      <div className="note__sec"><h4>Impresión diagnóstica</h4>
        <ol className="note__list">{c.diagnoses.map((d) => <li key={d.code}>{d.label} <span className="muted">({d.code})</span></li>)}</ol>
      </div>
      {c.indications ? (<>
        <div className="note__sec"><h4>Indicaciones y plan</h4>
          {c.indications.length ? <ol className="note__list">{c.indications.map((o, i) => <li key={i}>{o}</li>)}</ol> : <p className="muted">Sin indicaciones.</p>}
        </div>
        <div className="note__sec"><h4>Medicamentos</h4>
          {c.orders.length > c.indications.length
            ? <ol className="note__list">{c.orders.slice(c.indications.length).map((o, i) => <li key={i}>{o}</li>)}</ol>
            : <p className="muted">Sin medicamentos.</p>}
        </div>
      </>) : (
        <div className="note__sec"><h4>Plan y manejo</h4>
          {c.orders.length
            ? <ol className="note__list">{c.orders.map((o, i) => <li key={i}>{o}</li>)}</ol>
            : <p>{c.plan || <span className="muted">Sin registro.</span>}</p>}
        </div>
      )}
    </div>
  )
}

type Tab = 'history' | 'consults' | 'hosp' | 'vitals' | 'rx' | 'certs' | 'files'

export default function PatientChart() {
  const { id } = useParams()
  const { patient, appointments, staffById, can, updatePatient, followups, bed, inpatientOf, stayOf, fetchCertificates } = useStore()
  const [certs, setCerts] = useState<Certificate[] | null>(null)
  const [tab, setTab] = useState<Tab>('history')
  const [editing, setEditing] = useState<null | 'id' | 'allergies' | 'background'>(null)
  const clinical = can('chart.view')
  const p = patient(id!)
  // Sólo se pide el expediente de pacientes de la propia clínica
  const { chart, reload } = useChart(id, clinical && !!p)
  useEffect(() => {
    if (!id || !clinical) return
    fetchCertificates(id).then(setCerts).catch(() => setCerts([]))
  }, [id, clinical, fetchCertificates])
  if (!p) return <div className="page"><div className="empty">Este expediente no existe. Vuelve a <Link to="/app/pacientes">Pacientes</Link>.</div></div>

  const cs = chart?.consultations ?? []
  const rxs = chart?.prescriptions ?? []
  const vs = chart?.vitals ?? []
  const hs = chart?.hospitalizations ?? []
  const pending = followups.filter((f) => f.patientId === p.id)
  const hospitalized = inpatientOf(p.id)
  const appts = appointments.filter((a) => a.patientId === p.id).sort((a, b) => b.start.localeCompare(a.start))
  // Mientras carga el expediente no se muestra "(0)", que parecería que no hay datos
  const n = (k: unknown[]) => (chart ? ` (${k.length})` : '')
  const tabs: [Tab, string, boolean][] = [
    ['history', 'Historia clínica', true], ['consults', `Consultas${n(cs)}`, clinical], ['hosp', `Hospitalizaciones${n(hs)}`, clinical && (!chart || hs.length > 0)],
    ['vitals', 'Signos vitales', clinical], ['rx', `Recetas${n(rxs)}`, clinical && can('rx.view')], ['certs', `Constancias${certs ? ` (${certs.length})` : ''}`, clinical], ['files', 'Archivos', clinical],
  ]
  const save = async (data: Partial<Patient>) => { if (await updatePatient(p.id, data)) { setEditing(null); reload() } }

  return (
    <div className="page page--chart">
      <div className="sticky-top">
        <PatientHeader p={p} clinical={clinical}>
          {hospitalized && <Link className="btn btn--soft btn--sm" to={stayPath(hospitalized)}><BedDouble size={15} />{hospitalized.kind === 'observation' ? 'En observación' : `Hospitalizado, ${bedLabel(bed(hospitalized.bedId))}`}</Link>}
          {!hospitalized && stayOf(p.id) && <span className="badge badge--ink">{stayOf(p.id) === 'observation' ? 'En observación' : 'Hospitalizado'}</span>}
        </PatientHeader>
        <div className="tabs tabs--scroll" role="tablist">
          {tabs.filter((t) => t[2]).map(([k, label]) => (
            <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>

      {clinical && <HospAlerts id={hospitalized?.id ?? hs[0]?.id} />}

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
              <div className="panel__body">{!chart ? <Loading /> : vs[0] ? <VitalsGrid v={vs[0]} birthDate={p.birthDate} /> : <p className="muted">Sin registros todavía.</p>}</div>
            </section>
          </>) : (
            <section className="panel"><div className="empty"><Lock size={20} style={{ margin: '0 auto 8px' }} />Alergias, antecedentes y consultas sólo están disponibles para médicos y enfermería.</div></section>
          )}

          {pending.length > 0 && (
            <section className="panel hc__sec">
              <div className="panel__head"><h2>Seguimientos programados</h2><Link className="btn btn--ghost btn--sm" to="/app/seguimientos">Ver todos</Link></div>
              <div className="rows">{pending.map((f) => (
                <div key={f.id} className="row" style={{ gridTemplateColumns: '120px 1fr' }}>
                  <span className="num" style={{ fontSize: 13.5 }}>{date(`${f.dueDate}T12:00:00`)}</span>
                  <div className="row__who"><strong>{f.title}</strong><span>{FOLLOWUP_KIND[f.kind].label}{f.everyDays ? `, control cada ${f.everyDays} días` : ''}</span></div>
                </div>
              ))}</div>
            </section>
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
                  {can('consult.write') && <Link className="btn btn--ghost btn--sm" to={`/app/constancia/${c.id}`}><FileBadge size={15} />Generar constancia</Link>}
                </div>
              </div>
              <div className="panel__body"><ConsultationBody c={c} vitals={vs.find((v) => v.id === c.vitalsId)} /></div>
            </article>
          )) : <section className="panel"><div className="empty">Este paciente aún no tiene consultas firmadas.</div></section>}
        </div>
      )}

      {tab === 'hosp' && chart && (
        <section className="panel">
          {hs[0] && (
            <div className="panel__head">
              <h2>Hospitalizaciones</h2>
              <Link className="btn btn--primary btn--sm" to={`${stayPath(hs[0])}/expediente`}><FileText size={15} />Expediente completo</Link>
            </div>
          )}
          {hs.length ? <div className="rows">{hs.map((h) => (
            <Link key={h.id} to={stayPath(h)} className="row" style={{ gridTemplateColumns: '150px 1fr auto' }}>
              <span className="num" style={{ fontSize: 13.5 }}>{date(h.admittedAt)}{h.dischargedAt ? ` al ${date(h.dischargedAt)}` : ''}</span>
              <div className="row__who"><strong>{h.diagnoses.map((d) => d.label).join('; ')}</strong><span>{h.kind === 'observation' ? 'Observación' : bedLabel(bed(h.bedId))}{h.observationAt ? ' (vino de observación)' : ''}, ingresó {staffById(h.admittedBy)?.name}</span></div>
              <span className={`badge ${h.status === 'active' ? 'badge--mint' : 'badge--done'}`}>{h.status === 'active' ? (h.kind === 'observation' ? 'En observación' : 'Hospitalizado') : 'Egresado'}</span>
            </Link>
          ))}</div> : <div className="empty">Sin hospitalizaciones.</div>}
        </section>
      )}

      {tab === 'vitals' && chart && (
        <section className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Fecha</th><th>PA</th><th>FC</th><th>FR</th><th>Temp.</th><th>SpO₂</th><th>Peso</th><th>Motivo</th><th>Tomó</th></tr></thead>
            <tbody>{vs.map((v) => (
              <tr key={v.id} className="num">
                <td style={{ whiteSpace: 'nowrap' }}>{date(v.takenAt)} {time(v.takenAt)}</td><td>{v.systolic != null ? `${v.systolic}/${v.diastolic}` : '—'}</td><td>{v.heartRate ?? '—'}</td><td>{v.respRate ?? '—'}</td>
                <td>{v.temperature != null ? `${v.temperature.toFixed(1)} °C` : '—'}</td><td>{v.spo2 != null ? `${v.spo2}%` : '—'}</td><td>{v.weightKg ? `${v.weightKg} kg` : '—'}</td><td style={{ minWidth: 180 }}>{v.chiefComplaint ?? '—'}</td><td>{staffById(v.takenBy)?.name}</td>
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

      {tab === 'certs' && clinical && (
        <section className="panel">
          {certs?.length ? <div className="rows">{certs.map((x) => (
            <Link key={x.id} to={`/app/constancias/${x.id}`} className="row" style={{ gridTemplateColumns: '120px 1fr auto' }}>
              <span className="num" style={{ fontSize: 13.5 }}>{date(x.issuedAt)}<br /><span style={{ color: 'var(--muted)' }}>{x.number}</span></span>
              <div className="row__who"><strong>{CERT_KIND[x.kind].title}</strong><span>{staffById(x.doctorId)?.name}{x.kind === 'rest' && x.data.restDays ? `, ${x.data.restDays} días de reposo` : ''}</span></div>
              {x.voidedAt ? <span className="badge badge--red">Anulada</span> : <span className="badge badge--mint">Vigente</span>}
            </Link>
          ))}</div> : <div className="empty">{certs ? 'Sin constancias emitidas. Se generan desde la nota de cada consulta.' : 'Cargando…'}</div>}
        </section>
      )}

      {tab === 'files' && clinical && <Attachments patientId={p.id} />}

      {editing === 'id' && <IdentificationForm title="Ficha de identificación" submitLabel="Guardar cambios" initial={p} onClose={() => setEditing(null)} onSave={save} />}
      {editing === 'allergies' && <AllergiesForm initial={p} onClose={() => setEditing(null)} onSave={save} />}
      {editing === 'background' && <BackgroundForm initial={p} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  )
}
