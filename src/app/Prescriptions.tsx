import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, FileText, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { Loading, PageHead } from '../components/ui'
import { age, date, fullName, identityLine, recordNumber, time } from '../lib/format'
import { yearsOld } from '../lib/inpatient'
import { LogoMark } from '../components/Logo'
import type { ClinicSettings } from '../lib/types'

/** Logo de la clínica en recetas y constancias; si no hay uno cargado, el de Clinara. */
export function ClinicLogo({ settings, size = 26 }: { settings: ClinicSettings; size?: number }) {
  return settings.logo ? <img src={settings.logo} alt="" style={{ height: size * 1.6, maxWidth: 160, objectFit: 'contain' }} /> : <LogoMark size={size} />
}

export default function Prescriptions() {
  const { prescriptions, patient, staffById, user } = useStore()
  const [mine, setMine] = useState(user?.role === 'doctor')
  const list = prescriptions
    .filter((r) => !mine || r.doctorId === user?.id)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  return (
    <div className="page">
      <PageHead title="Recetas" sub={`${list.length} recetas emitidas`}
        actions={user?.role === 'doctor' && (
          <div className="tabs" role="tablist" style={{ border: 0 }}>
            <button className="tab" role="tab" aria-selected={mine} onClick={() => setMine(true)}>Mías</button>
            <button className="tab" role="tab" aria-selected={!mine} onClick={() => setMine(false)}>Toda la clínica</button>
          </div>
        )} />
      <section className="panel">
        {list.length ? <div className="rows">{list.map((r) => {
          const p = patient(r.patientId)!
          return (
            <Link key={r.id} to={`/app/recetas/${r.id}`} className="row" style={{ gridTemplateColumns: '120px 1fr auto' }}>
              <span className="num" style={{ fontSize: 13.5 }}>{date(r.issuedAt)}<br /><span style={{ color: 'var(--muted)' }}>{r.folio}</span></span>
              <div className="row__who"><strong>{fullName(p)}</strong><span>{r.items.map((i) => i.drug).join(', ')}, por {staffById(r.doctorId)?.name}</span></div>
              <FileText size={18} color="var(--faint)" />
            </Link>
          )
        })}</div> : <div className="empty">Las recetas que firmes desde una consulta aparecerán aquí.</div>}
      </section>
    </div>
  )
}

export function PrescriptionSheet() {
  const { id } = useParams()
  const { staffById, fetchPrescription, settings } = useStore()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPrescription>> | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    if (id) fetchPrescription(id).then(setData).catch(() => setMissing(true))
  }, [id, fetchPrescription])
  if (missing) return <div className="page"><div className="empty">Esta receta no existe. Vuelve a <Link to="/app/recetas">Recetas</Link>.</div></div>
  if (!data) return <Loading label="Cargando receta" />
  const { prescription: rx, consultation: c, hospitalization: h, patient: p } = data
  const doc = staffById(rx.doctorId)!
  const dx = c?.diagnoses ?? []

  return (
    <div className="page">
      <div className="page-head no-print">
        <Link className="btn btn--ghost" to={h ? `/app/hospitalizados/${h.id}` : `/app/pacientes/${p.id}`}><ChevronLeft size={16} />Expediente de {p.firstName}</Link>
        <button className="btn btn--primary" onClick={() => window.print()}><Printer size={16} />Imprimir receta (media carta)</button>
      </div>
      <article className="rx-sheet rx-sheet--half">
        <header className="rx-sheet__head">
          <div className="rx-sheet__doc">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><ClinicLogo settings={settings} /><b>{settings.name}</b></div>
            <h2>{doc.name}</h2>
            <p>{doc.specialty}, colegiación {doc.license}</p>
            <p>{settings.address}, tel. {settings.phone}</p>
          </div>
          <div className="rx-sheet__folio">Folio<b>{rx.folio}</b>{date(rx.issuedAt)}, {time(rx.issuedAt)}{h && <><br />Receta de egreso</>}</div>
        </header>
        <div className="rx-sheet__pt">
          <div style={{ gridColumn: '1 / -1' }}><span>Nombre completo</span>{fullName(p)}</div>
          <div style={!p.dni && p.guardianName ? { gridColumn: '1 / -1' } : undefined}><span>Identidad</span>{identityLine(p, yearsOld(p.birthDate) < 18)}</div>
          <div><span>Edad</span>{age(p.birthDate)}</div>
          <div><span>Expediente</span>{recordNumber(p, settings)}</div>
          {p.allergies.length > 0 && <div><span>Alergias</span>{p.allergies.join(', ')}</div>}
          {dx.length > 0 && <div style={{ gridColumn: '1 / -1' }}><span>Diagnóstico</span>{dx.map((d) => d.label).join('; ')}</div>}
        </div>
        <div className="rx-sheet__rx" aria-hidden="true">Rx</div>
        <ol>
          {rx.items.map((it, i) => (
            <li key={i}>
              <strong>{it.drug}</strong> <span style={{ color: 'var(--muted)' }}>{it.presentation}</span>
              <p>{it.dose}{it.route ? ` vía ${it.route.toLowerCase()}` : ''}, {it.frequency.toLowerCase()}{it.duration ? `, durante ${it.duration}` : ''}.{it.instructions ? ` ${it.instructions}` : ''}{it.quantity ? ` Cantidad: ${it.quantity}.` : ''}</p>
            </li>
          ))}
        </ol>
        {(() => {
          // Indicaciones: las que el médico escribió aparte o, en consultas anteriores, las órdenes que no son medicamentos
          const notes = c?.indications ?? (c?.orders.length ? c.orders.filter((o) => !rx.items.some((it) => o.startsWith(it.drug))) : c?.plan ? [c.plan] : [])
          return notes.length > 0 && (
            <div style={{ marginTop: 24, fontSize: 14 }}><b>Indicaciones generales</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
          )
        })()}
        <div className="rx-sheet__sign"><div><em>{doc.name.replace(/^Dra?\.\s*/, '')}</em>{doc.name}<br /><span style={{ color: 'var(--muted)' }}>{doc.license}</span></div></div>
        <footer className="rx-sheet__foot"><span>Receta válida por {settings.rxValidityDays} días a partir de su emisión.</span><span>Emitida con Clinara</span></footer>
      </article>
    </div>
  )
}
