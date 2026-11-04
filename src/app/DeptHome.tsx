import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BedDouble, BellRing, CircleAlert, Clock, Eye, FlaskConical, ScanLine, Stethoscope, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading, PageHead } from '../components/ui'
import { examLine } from '../lib/exams'
import { dateTime, localISODate, shortStaff } from '../lib/format'
import { AmbulatoryModal } from './Ambulatory'
import { AREA_LABEL, AREA_SLUG, areaOf, patientLink, tabOf, waitText, type DeptArea, type Item } from './DeptTray'
import type { ExamGroup } from '../lib/types'

/** Minutos de espera desde los que un pendiente de un paciente internado sale como alarma (sin urgencia marcada). */
const LATE_MIN = 60
const ICON: Record<DeptArea, typeof Eye> = { outpatient: Stethoscope, observation: Eye, hospital: BedDouble }

/**
 * LB5 e IM1 (ronda 12): «Inicio» de Laboratorio e Imágenes. Arriba, las alarmas de los pacientes internados (hospitalización y
 * observación): urgentes sin muestra o sin realizar y lo que lleva más de una hora esperando; después, una tarjeta por área
 * (Ambulatorio, Observación, Hospitalización) con lo pendiente, y los avisos del día («No se realizó», resultados cargados). Se
 * actualiza sola, como la bandeja.
 */
export default function DeptHome() {
  const { user, staffById, can } = useStore()
  const group: ExamGroup = user?.role === 'imaging' ? 'imaging' : 'lab'
  const base = group === 'lab' ? '/app/laboratorio' : '/app/imagenes'
  const [items, setItems] = useState<Item[] | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [ambulatory, setAmbulatory] = useState(false)
  const load = useCallback(() => {
    api<{ items: Item[] }>(`/dept/tray?group=${group}&day=${localISODate(new Date())}`).then((r) => { setItems(r.items); setNow(Date.now()) }).catch(() => setItems((x) => x ?? []))
  }, [group])
  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(load, 20_000); return () => clearInterval(t) }, [load])
  if (!items) return <Loading label="Cargando el inicio" />

  const pending = items.filter((e) => { const t = tabOf(e); return t === 'todo' || t === 'process' })
  const waitMin = (e: Item) => (now - new Date(e.orderedAt).getTime()) / 60_000
  // Alarmas: internados (observación y hospitalización) urgentes o con más de una hora de espera; los urgentes primero
  const alarms = pending.filter((e) => areaOf(e) !== 'outpatient' && (e.priority === 'urgent' || waitMin(e) >= LATE_MIN))
    .sort((a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || a.orderedAt.localeCompare(b.orderedAt))
  const notDone = items.filter((e) => tabOf(e) === 'notdone')
  const today = localISODate(new Date())
  const doneToday = items.filter((e) => tabOf(e) === 'done' && (e.result?.at ?? e.statusAt ?? '').slice(0, 10) === today)
  const word = group === 'lab' ? { todo: 'por tomar muestra', process: 'en proceso' } : { todo: 'por realizar', process: 'por informar' }
  const areas: DeptArea[] = ['outpatient', 'observation', 'hospital']

  return (
    <div className="page dept-home">
      <PageHead title={`Inicio · ${group === 'lab' ? 'Laboratorio' : 'Imágenes'}`} sub="Alarmas de los pacientes internados, lo pendiente de cada área y los avisos del día."
        actions={can('ambulatory.register') ? <button className="btn btn--primary" onClick={() => setAmbulatory(true)}><UserPlus size={17} />Paciente ambulatorio</button> : undefined} />

      <section className={`panel dept-home__alarms${alarms.length ? ' is-on' : ''}`} aria-live="polite">
        <div className="panel__head"><div><h2><BellRing size={18} />Alarmas de hospitalizados y observación</h2>
          <p>{alarms.length ? `${alarms.length} ${alarms.length === 1 ? 'estudio necesita' : 'estudios necesitan'} atención: urgentes o con más de ${LATE_MIN} minutos de espera.` : 'Sin alarmas: ningún paciente internado espera un estudio urgente ni lleva más de una hora esperando.'}</p></div></div>
        {alarms.length > 0 && <ul className="dept-home__list">{alarms.slice(0, 12).map((e) => (
          <li key={e.id} className={e.priority === 'urgent' ? 'is-urgent' : ''}>
            {e.priority === 'urgent' ? <CircleAlert size={16} className="dept-home__ic dept-home__ic--red" /> : <Clock size={16} className="dept-home__ic" />}
            <span className="dept-home__what"><b>{examLine(e)}</b>{e.priority === 'urgent' && <span className="badge badge--red">Urgente</span>}
              <small><Link to={patientLink(e, can('chart.view'))}>{e.patient.name}</Link> · {e.locationText} · pidió {shortStaff(staffById(e.orderedBy)?.name)} {dateTime(e.orderedAt)}</small></span>
            <span className="dept-home__wait">espera {waitText(e.orderedAt, now)}<small>{tabOf(e) === 'todo' ? word.todo : word.process}</small></span>
            <Link className="btn btn--soft btn--sm" to={`${base}/${AREA_SLUG[areaOf(e)]}`}>Atender</Link>
          </li>
        ))}</ul>}
      </section>

      <div className="dept-home__areas">
        {areas.map((a) => {
          const list = pending.filter((e) => areaOf(e) === a)
          const urgent = list.filter((e) => e.priority === 'urgent').length
          const todo = list.filter((e) => tabOf(e) === 'todo').length
          const oldest = [...list].sort((x, y) => x.orderedAt.localeCompare(y.orderedAt))[0]
          const Icon = ICON[a]
          return (
            <Link key={a} to={`${base}/${AREA_SLUG[a]}`} className={`panel dept-home__area${urgent ? ' has-urgent' : ''}`}>
              <span className="dept-home__area-head"><Icon size={18} /><b>{AREA_LABEL[a]}</b></span>
              <span className="dept-home__big num">{list.length}</span>
              <span className="muted">{list.length ? `${todo} ${word.todo} · ${list.length - todo} ${word.process}` : 'Nada pendiente'}</span>
              {urgent > 0 && <span className="badge badge--red">{urgent} urgente{urgent > 1 ? 's' : ''}</span>}
              {oldest && <small className="muted">El más antiguo espera {waitText(oldest.orderedAt, now)}</small>}
            </Link>
          )
        })}
      </div>

      <section className="panel">
        <div className="panel__head"><div><h2>{group === 'lab' ? <FlaskConical size={18} /> : <ScanLine size={18} />}Avisos de hoy</h2></div></div>
        <div className="panel__body dept-home__notes">
          {notDone.length > 0 ? <p><b>{notDone.length}</b> marcado{notDone.length > 1 ? 's' : ''} «No se realizó», esperando que el médico decida: {notDone.slice(0, 4).map((e) => `${examLine(e)} (${e.patient.name})`).join(', ')}{notDone.length > 4 ? '…' : ''}</p>
            : <p className="muted">Ningún estudio marcado «No se realizó».</p>}
          <p><b>{doneToday.length}</b> {group === 'lab' ? 'resultado' : 'estudio'}{doneToday.length === 1 ? '' : 's'} terminado{doneToday.length === 1 ? '' : 's'} hoy.</p>
        </div>
      </section>
      {ambulatory && <AmbulatoryModal group={group} onClose={() => setAmbulatory(false)} onDone={() => { setAmbulatory(false); load() }} />}
    </div>
  )
}
