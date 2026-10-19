import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FileText, Lock, TriangleAlert, ShieldCheck } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, StatusBadge } from '../components/ui'
import { age, bmi, date, fullName, time } from '../lib/format'
import { patientColor } from './Patients'
import type { Vitals } from '../lib/types'

export function VitalsGrid({ v }: { v: Vitals }) {
  const warn = (x: boolean) => (x ? 'vital vital--warn' : 'vital')
  return (
    <div className="vitals">
      <div className={warn(v.systolic >= 140 || v.diastolic >= 90)}><span>Presión arterial</span><b>{v.systolic}/{v.diastolic}<small>mmHg</small></b></div>
      <div className={warn(v.heartRate > 100 || v.heartRate < 60)}><span>Frecuencia cardíaca</span><b>{v.heartRate}<small>lpm</small></b></div>
      <div className={warn(v.temperature >= 37.6)}><span>Temperatura</span><b>{v.temperature.toFixed(1)}<small>°C</small></b></div>
      <div className={warn(v.spo2 < 94)}><span>Saturación</span><b>{v.spo2}<small>%</small></b></div>
      <div className="vital"><span>Peso</span><b>{v.weightKg || '—'}<small>kg</small></b></div>
      <div className="vital"><span>IMC</span><b>{v.weightKg && v.heightCm ? bmi(v.weightKg, v.heightCm) : '—'}</b></div>
    </div>
  )
}

type Tab = 'summary' | 'consults' | 'rx' | 'vitals'

export default function PatientChart() {
  const { id } = useParams()
  const { patient, consultations, prescriptions, vitals, appointments, staffById, can } = useStore()
  const [tab, setTab] = useState<Tab>('summary')
  const p = patient(id!)
  if (!p) return <div className="page"><div className="empty">Este expediente no existe. Vuelve a <Link to="/app/pacientes">Pacientes</Link>.</div></div>

  const clinical = can('chart.view')
  const cs = consultations.filter((c) => c.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date))
  const rxs = prescriptions.filter((r) => r.patientId === p.id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  const vs = vitals.filter((v) => v.patientId === p.id).sort((a, b) => b.takenAt.localeCompare(a.takenAt))
  const appts = appointments.filter((a) => a.patientId === p.id).sort((a, b) => b.start.localeCompare(a.start))
  const tabs: [Tab, string, boolean][] = [
    ['summary', 'Resumen', true], ['consults', `Consultas (${cs.length})`, clinical],
    ['rx', `Recetas (${rxs.length})`, can('rx.view')], ['vitals', 'Signos vitales', clinical],
  ]

  return (
    <div className="page">
      <div className="chart-head">
        <Avatar name={fullName(p)} color={patientColor(p.id)} />
        <div>
          <h1>{fullName(p)}</h1>
          <div className="chart-meta">
            <span>Expediente <b>{p.record}</b></span>
            <span><b>{age(p.birthDate)}</b>, {p.sex === 'F' ? 'femenino' : 'masculino'}</span>
            {p.bloodType && <span>Sangre <b>{p.bloodType}</b></span>}
            <span>Tel. <b className="num">{p.phone}</b></span>
            {p.insurance && <span>Seguro <b>{p.insurance}</b></span>}
          </div>
        </div>
        <div />
      </div>

      {clinical && (p.allergies.length
        ? <div className="alert-strip"><TriangleAlert size={18} />Alergias: {p.allergies.join(', ')}</div>
        : <div className="alert-strip alert-strip--calm"><ShieldCheck size={18} />Sin alergias conocidas</div>)}

      <div className="tabs" role="tablist">
        {tabs.filter((t) => t[2]).map(([k, label]) => (
          <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="grid-2">
          <div style={{ display: 'grid', gap: 24 }}>
            {clinical ? (
              <section className="panel">
                <div className="panel__head"><h2>Últimos signos vitales</h2>{vs[0] && <p>{date(vs[0].takenAt)}, {time(vs[0].takenAt)}</p>}</div>
                <div className="panel__body">{vs[0] ? <VitalsGrid v={vs[0]} /> : <div className="empty">Sin registros todavía.</div>}</div>
              </section>
            ) : (
              <section className="panel"><div className="empty"><Lock size={20} style={{ margin: '0 auto 8px' }} />El expediente clínico sólo está disponible para médicos y enfermería.</div></section>
            )}
            <section className="panel">
              <div className="panel__head"><h2>Citas</h2></div>
              {appts.length ? <div className="rows">{appts.map((a) => (
                <div key={a.id} className="row" style={{ gridTemplateColumns: '110px 1fr auto' }}>
                  <span className="num" style={{ fontSize: 13.5 }}>{date(a.start, { day: 'numeric', month: 'short' })} {time(a.start)}</span>
                  <div className="row__who"><strong>{a.reason}</strong><span>{staffById(a.doctorId)?.name}</span></div>
                  <StatusBadge status={a.status} />
                </div>
              ))}</div> : <div className="empty">Sin citas registradas.</div>}
            </section>
          </div>
          {clinical && (
            <section className="panel">
              <div className="panel__head"><h2>Problemas activos</h2></div>
              <div className="panel__body">
                {p.conditions.length ? <div className="chips">{p.conditions.map((c) => <span key={c} className="chip">{c}</span>)}</div> : <p style={{ color: 'var(--muted)' }}>Sin padecimientos crónicos registrados.</p>}
                {cs[0] && (<>
                  <h3 style={{ fontSize: 15, margin: '22px 0 8px' }}>Último diagnóstico</h3>
                  <div className="tl__dx">{cs[0].diagnoses.map((d) => <span key={d.code} className="dx"><code>{d.code}</code>{d.label}</span>)}</div>
                  <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 10 }}>{cs[0].plan}</p>
                </>)}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'consults' && (
        <section className="panel timeline">
          {cs.length ? cs.map((c) => (
            <article key={c.id} className="tl">
              <div className="tl__date"><b>{date(c.date, { day: 'numeric', month: 'short' })}</b>{new Date(c.date).getFullYear()}<br />{staffById(c.doctorId)?.name}</div>
              <div>
                <h3>{c.reason}</h3>
                {c.symptoms.length > 0 && <div className="chips" style={{ margin: '6px 0' }}>{c.symptoms.map((s) => <span key={s} className="chip">{s}</span>)}</div>}
                <p><b style={{ color: 'var(--petrol)' }}>Padecimiento:</b> {c.history}</p>
                {c.exam && <p><b style={{ color: 'var(--petrol)' }}>Exploración:</b> {c.exam}</p>}
                <p><b style={{ color: 'var(--petrol)' }}>Plan:</b> {c.plan}</p>
                <div className="tl__dx">{c.diagnoses.map((d) => <span key={d.code} className="dx"><code>{d.code}</code>{d.label}</span>)}</div>
                {c.prescriptionId && can('rx.view') && <Link className="btn btn--ghost btn--sm" style={{ marginTop: 12 }} to={`/app/recetas/${c.prescriptionId}`}><FileText size={15} />Ver receta</Link>}
              </div>
            </article>
          )) : <div className="empty">Este paciente aún no tiene consultas firmadas.</div>}
        </section>
      )}

      {tab === 'rx' && (
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

      {tab === 'vitals' && (
        <section className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Fecha</th><th>PA</th><th>FC</th><th>Temp.</th><th>SpO₂</th><th>Peso</th><th>Tomó</th></tr></thead>
            <tbody>{vs.map((v) => (
              <tr key={v.id} className="num">
                <td>{date(v.takenAt)} {time(v.takenAt)}</td><td>{v.systolic}/{v.diastolic}</td><td>{v.heartRate}</td>
                <td>{v.temperature.toFixed(1)} °C</td><td>{v.spo2}%</td><td>{v.weightKg ? `${v.weightKg} kg` : '—'}</td><td>{staffById(v.takenBy)?.name}</td>
              </tr>
            ))}</tbody>
          </table>
          {!vs.length && <div className="empty">Sin registros todavía.</div>}
        </section>
      )}
    </div>
  )
}
