import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, ScanLine, TriangleAlert } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { dateTime, fullName, shortStaff } from '../lib/format'
import { examLine, GROUP_LABEL, NEXT_ACTION } from '../lib/exams'
import type { ExamGroup, ExamOrder } from '../lib/types'

/** A dónde lleva un examen: al expediente de la estancia (pestaña Exámenes) o al historial del paciente. */
const examPath = (e: ExamOrder, stays: { id: string; kind: string }[]) => {
  const stay = stays.find((s) => s.id === e.hospitalizationId)
  return stay ? `/app/${stay.kind === 'observation' ? 'observacion' : 'hospitalizados'}/${stay.id}?tab=examenes` : `/app/pacientes/${e.patientId}?tab=examenes`
}

/**
 * EX1: bandeja de exámenes pendientes de enfermería (y, cuando existan, de laboratorio e imágenes), separada en
 * Laboratorio e Imagen y gabinete; los urgentes primero y después por hora.
 */
export function ExamTray() {
  const { patient, inpatients, notify } = useStore()
  const [list, setList] = useState<ExamOrder[] | null>(null)
  useEffect(() => { api<ExamOrder[]>('/exams/tray').then(setList).catch((e: Error) => notify(e.message, 'error')) }, [notify, inpatients.length])
  if (!list) return null
  return (
    <section className="panel" data-tour="bandeja-examenes">
      <div className="panel__head"><div><h2>Exámenes pendientes</h2><p>{list.length ? `${list.length} por atender; los urgentes primero.` : 'No hay exámenes pendientes.'}</p></div></div>
      {list.length > 0 && <div className="tray-groups">{(['lab', 'imaging'] as ExamGroup[]).map((g) => {
        const items = list.filter((e) => e.group === g)
        return (
          <div key={g} className="tray-group">
            <h3>{g === 'lab' ? <FlaskConical size={15} /> : <ScanLine size={15} />}{GROUP_LABEL[g]} <span className="muted">({items.length})</span></h3>
            {items.length ? <div className="rows">{items.map((e) => {
              const p = patient(e.patientId)
              return (
                <Link key={e.id} to={examPath(e, inpatients)} className={`row tray-row${e.priority === 'urgent' ? ' tray-row--urgent' : ''}`}>
                  <div className="row__who"><strong>{examLine(e)}{e.priority === 'urgent' && <span className="badge badge--red" style={{ marginLeft: 6 }}>Urgente</span>}</strong>
                    <span>{p ? fullName(p) : ''} · {dateTime(e.orderedAt)}{e.indication ? ` · ${e.indication}` : ''}</span></div>
                  <span className="badge badge--amber">{NEXT_ACTION[e.group][e.status] ?? 'Pendiente'}</span>
                </Link>
              )
            })}</div> : <div className="empty">Nada pendiente.</div>}
          </div>
        )
      })}</div>}
    </section>
  )
}

/** EX1: resultados nuevos (sin revisar) de los exámenes que pidió el médico; los críticos primero. */
export function NewResults() {
  const { patient, inpatients, staffById, notify } = useStore()
  const [list, setList] = useState<ExamOrder[] | null>(null)
  useEffect(() => { api<ExamOrder[]>('/exams/new-results').then(setList).catch((e: Error) => notify(e.message, 'error')) }, [notify])
  if (!list?.length) return null
  return (
    <section className="panel" data-tour="resultados-nuevos">
      <div className="panel__head"><div><h2>Resultados nuevos</h2><p>{list.length} sin revisar. Ábrelos y márcalos como revisados.</p></div></div>
      <div className="rows">{list.map((e) => {
        const p = patient(e.patientId)
        return (
          <Link key={e.id} to={examPath(e, inpatients)} className={`row${e.critical ? ' tray-row--urgent' : ''}`}>
            <div className="row__who"><strong>{e.critical && <TriangleAlert size={14} style={{ verticalAlign: '-2px', color: 'var(--red-ink)', marginRight: 4 }} />}{examLine(e)} · {p ? fullName(p) : ''}</strong>
              <span>{GROUP_LABEL[e.group]} · resultado {e.result ? dateTime(e.result.at) : ''} por {shortStaff(staffById(e.result?.by ?? '')?.name)}
                {e.result?.values?.some((v) => v.flag) ? ` · ${e.result.values.filter((v) => v.flag).map((v) => `${v.analyte} ${v.flag === 'high' ? 'alto' : 'bajo'}`).join(', ')}` : ''}</span></div>
            <span className={`badge ${e.critical ? 'badge--red' : 'badge--mint'}`}>{e.critical ? 'Crítico' : 'Resultado nuevo'}</span>
          </Link>
        )
      })}</div>
    </section>
  )
}
