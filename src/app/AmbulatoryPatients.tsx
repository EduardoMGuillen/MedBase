import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading, PageHead } from '../components/ui'
import { DateField } from '../components/DateTimeField'
import { localISODate, time } from '../lib/format'
import { GROUP_LABEL } from '../lib/exams'
import { STAGE_LABEL, type AmbulatoryPatient, type AmbulatoryStage } from '../lib/ambulatory'
import { AmbulatoryModal } from './Ambulatory'

const STAGE_TONE: Record<AmbulatoryStage, string> = { ordered: 'neutral', sample: 'amber', process: 'amber', ready: 'mint', not_done: 'red' }

/** AD1 (ronda 17): cuántos pacientes ambulatorios hay hoy (para la tarjeta del Inicio). */
export function useAmbulatoryToday(enabled: boolean) {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled) return
    api<{ patients: AmbulatoryPatient[] }>(`/dept/ambulatory?day=${localISODate(new Date())}`).then((r) => setN(r.patients.length)).catch(() => null)
  }, [enabled])
  return n
}

/**
 * AD1 (ronda 17): «Pacientes ambulatorios» de administración y recepción (grupo «Laboratorio e imágenes»). El botón «Paciente
 * ambulatorio» abre la misma ventana de siempre (AmbulatoryModal) y la lista muestra los que vinieron solo a hacerse exámenes en el
 * día, con el nombre de cada estudio y su etapa. Solo lectura y sin resultados: nunca valores ni informes.
 */
export default function AmbulatoryPatients() {
  const { staffById } = useStore()
  const today = localISODate(new Date())
  const [day, setDay] = useState(today)
  const [list, setList] = useState<AmbulatoryPatient[] | null>(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(() => {
    api<{ patients: AmbulatoryPatient[] }>(`/dept/ambulatory?day=${day}`).then((r) => setList(r.patients)).catch(() => setList((x) => x ?? []))
  }, [day])
  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(load, 30_000); return () => clearInterval(t) }, [load])
  return (
    <div className="page">
      <PageHead title="Pacientes ambulatorios" sub="Quienes vienen solo a hacerse exámenes de laboratorio o imágenes, sin consulta. Aquí ves el estado de sus estudios; los resultados los entrega el departamento."
        actions={<button className="btn btn--primary" data-tour="ambulatorio-nuevo" onClick={() => setAdding(true)}><FlaskConical size={17} />Paciente ambulatorio</button>} />
      <div className="exam-tools" role="search" style={{ marginBottom: 16 }}>
        <DateField value={day} max={today} onChange={(v) => setDay(v || today)} label="Fecha" />
      </div>
      {list === null ? <Loading label="Cargando los pacientes ambulatorios" /> : !list.length ? (
        <section className="panel"><div className="empty">{day === today ? 'Hoy todavía no hay pacientes ambulatorios.' : 'Ese día no hubo pacientes ambulatorios.'}</div></section>
      ) : (
        <section className="panel" data-testid="ambulatory-list">
          <div className="rows">{list.map((x) => (
            <div key={x.patient.id} className="row row--plain" style={{ gridTemplateColumns: '1fr' }}>
              <div className="row__who">
                <strong><Link to={`/app/pacientes/${x.patient.id}`}>{x.patient.name}</Link> <span className="muted" style={{ fontWeight: 500 }}>· Exp. {x.patient.record}{x.patient.phone ? ` · Tel. ${x.patient.phone}` : ''}</span></strong>
                <span>Llegó a las {time(x.firstAt)}</span>
                <ul className="amb-exams" style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 4 }}>
                  {x.exams.map((e) => (
                    <li className="hstack hstack--center" key={e.id}>
                      <span className={`badge badge--${STAGE_TONE[e.stage]}`}>{STAGE_LABEL[e.stage]}</span>
                      <span>{e.name}</span>
                      <span className="muted">{GROUP_LABEL[e.group]}{e.priority === 'urgent' ? ' · urgente' : ''}{e.requestedById ? ` · solicita ${staffById(e.requestedById)?.name ?? 'un médico'}` : e.requestedBy ? ` · solicita ${e.requestedBy}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}</div>
        </section>
      )}
      {adding && <AmbulatoryModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); load() }} />}
    </div>
  )
}
