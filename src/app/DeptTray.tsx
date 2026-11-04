import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { DateField } from '../components/DateTimeField'
import { api } from '../lib/api'
import { Loading, PageHead } from '../components/ui'
import { Pagination, usePage } from '../components/Pagination'
import { age, dateTime, localISODate, shortStaff } from '../lib/format'
import { examLine, GROUP_LABEL, reportOptional } from '../lib/exams'
import { PAGE_SIZE } from '../lib/clinicalConfig'
import { ExamRow } from './ExamsTab'
import { AmbulatoryModal } from './Ambulatory'
import type { ExamGroup, ExamOrder } from '../lib/types'

type Item = ExamOrder & { patient: { id: string; name: string; birthDate: string; sex: string; record: string }; locationText: string }
type TabKey = 'todo' | 'process' | 'done' | 'notdone'

const TABS: Record<ExamGroup, { key: TabKey; label: string }[]> = {
  lab: [{ key: 'todo', label: 'Por tomar muestra' }, { key: 'process', label: 'En proceso' }, { key: 'done', label: 'Resultados de hoy' }, { key: 'notdone', label: 'No realizados' }],
  imaging: [{ key: 'todo', label: 'Por realizar' }, { key: 'process', label: 'Por informar' }, { key: 'done', label: 'Terminados hoy' }, { key: 'notdone', label: 'No realizados' }],
}

/** En qué pestaña va cada orden. Los Rayos X realizados no esperan informe (EX3): van a «Terminados». */
function tabOf(e: ExamOrder): TabKey | null {
  if (e.status === 'cancelled') return null
  if (e.notDone && ['ordered', 'sample', 'done'].includes(e.status)) return 'notdone'
  if (e.status === 'ordered') return 'todo'
  if (e.status === 'sample') return 'process'
  if (e.status === 'done') return reportOptional(e) ? 'done' : 'process'
  return 'done'
}

const waitText = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d`
}

/**
 * DP2 (ronda 11): bandeja de trabajo de Laboratorio o de Imágenes (un solo componente por tipo). Entran todas las órdenes «En la
 * clínica» del tipo (consulta externa, observación, hospitalización y ambulatorios); las «Externo», no. Cada fila: urgente,
 * paciente, ubicación, estudio armado (CA6), quién pidió, indicación, hora del pedido y espera; las acciones son las de la
 * pestaña Exámenes (la misma fuente de verdad). Urgentes primero, después los más antiguos. Se actualiza sola.
 */
export default function DeptTray({ group }: { group: ExamGroup }) {
  const { staffById, can, notify } = useStore()
  const [items, setItems] = useState<Item[] | null>(null)
  const [tab, setTab] = useState<TabKey>('todo')
  const [q, setQ] = useState('')
  const [where, setWhere] = useState('')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [day, setDay] = useState(() => localISODate(new Date()))
  const [ambulatory, setAmbulatory] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [now, setNow] = useState(() => Date.now())
  const load = useCallback(() => {
    api<{ items: Item[] }>(`/dept/tray?group=${group}&day=${day}`).then((r) => { setItems(r.items); setNow(Date.now()) }).catch(() => setItems((x) => x ?? []))
  }, [group, day])
  useEffect(() => { load() }, [load])
  // Se actualiza sola cuando entra una orden nueva (sin recargar)
  useEffect(() => { const t = setInterval(load, 20_000); return () => clearInterval(t) }, [load])
  const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const today = localISODate(new Date())
  const inTab = (e: Item, k: TabKey) => tabOf(e) === k && (k !== 'done' || (e.result?.at ?? e.statusAt ?? '').slice(0, 10) === day || (!e.result && (e.statusAt ?? '').slice(0, 10) === day))
  const filtered = useMemo(() => (items ?? []).filter((e) => (!where || e.locationText.startsWith(where)) && (!urgentOnly || e.priority === 'urgent')
    && (!q.trim() || fold(`${e.patient.name} ${e.patient.record} ${examLine(e)}`).includes(fold(q.trim())))), [items, where, urgentOnly, q])
  const list = filtered.filter((e) => inTab(e, tab))
    .sort((a, b) => (tab === 'done' ? (b.result?.at ?? b.statusAt ?? '').localeCompare(a.result?.at ?? a.statusAt ?? '')
      : Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || a.orderedAt.localeCompare(b.orderedAt)))
  const [page, setPage] = usePage(`${tab}|${q}|${where}|${urgentOnly}|${day}`)
  const paged = tab === 'done' ? list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : list
  const places = ['Consulta externa', 'Observación', 'Hospitalización', 'Ambulatorio']
  const sameTodo = (e: Item) => list.filter((x) => x.patientId === e.patientId && x.status === 'ordered' && !x.notDone)
  const [busyAll, setBusyAll] = useState(false)
  const takeAll = async (xs: Item[]) => {
    setBusyAll(true)
    const errors: string[] = []
    for (const x of xs) await api(`/exams/${x.id}/status`, { body: { status: 'sample' } }).catch((err: Error) => errors.push(`${x.name}: ${err.message}`))
    if (errors.length) notify(errors.join(' · '), 'error')
    setBusyAll(false); load()
  }
  return (
    <div className="page dept">
      <PageHead title={group === 'lab' ? 'Bandeja de laboratorio' : 'Bandeja de imágenes'} sub={`Órdenes «En la clínica» de ${GROUP_LABEL[group].toLowerCase()}. Lo que hagas aquí se ve al instante en la pestaña Exámenes del paciente.`}
        actions={can('ambulatory.register') ? <button className="btn btn--primary" onClick={() => setAmbulatory(true)}><UserPlus size={17} />Paciente ambulatorio</button> : undefined} />
      <div className="segmented dept__tabs" role="tablist" aria-label="Bandeja">
        {TABS[group].map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>{t.label} <span className="num">{filtered.filter((e) => inTab(e, t.key)).length}</span></button>)}
      </div>
      <div className="exam-tools dept__filters" role="search">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar paciente o estudio" aria-label="Buscar paciente o estudio" />
        <select className="select" value={where} onChange={(e) => setWhere(e.target.value)} aria-label="Ubicación"><option value="">Todas las ubicaciones</option>{places.map((p) => <option key={p}>{p}</option>)}</select>
        <label className="check-inline"><input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />Solo urgentes</label>
        <DateField value={day} max={today} onChange={(v) => setDay(v || today)} label="Fecha" />
      </div>
      {items === null ? <Loading label="Cargando la bandeja" /> : !list.length ? <section className="panel"><div className="empty">Nada en «{TABS[group].find((t) => t.key === tab)!.label}».</div></section> : (
        <div className="dept__list">
          {paged.map((e) => (
            <article key={e.id} className={`panel dept__item${e.priority === 'urgent' ? ' dept__item--urgent' : ''}`}>
              <header className="dept__who">
                {e.priority === 'urgent' && <span className="badge badge--red">Urgente</span>}
                <Link to={`/app/pacientes/${e.patient.id}`} className="dept__name">{e.patient.name}</Link>
                <span className="muted">{e.patient.birthDate ? age(e.patient.birthDate) : ''}{e.patient.sex ? `, ${e.patient.sex === 'F' ? 'femenino' : 'masculino'}` : ''} · Exp. {e.patient.record}</span>
                <span className="badge badge--ink">{e.locationText}</span>
                <span className="muted dept__wait">{dateTime(e.orderedAt)} · espera {waitText(e.orderedAt, now)}</span>
              </header>
              {/* DP2: «Muestra tomada» de una vez para todos los exámenes de este paciente que esperan muestra */}
              {group === 'lab' && tab === 'todo' && can('exams.process') && sameTodo(e).length > 1 && sameTodo(e)[0].id === e.id && (
                <button className="btn btn--soft btn--sm dept__all" disabled={busyAll} onClick={() => takeAll(sameTodo(e))}>Muestra tomada de los {sameTodo(e).length} exámenes de este paciente</button>)}
              <p className="muted dept__meta">Pidió {shortStaff(staffById(e.orderedBy)?.name)}{e.requestedById || e.requestedByName ? ` · Solicitado por ${e.requestedById ? staffById(e.requestedById)?.name : e.requestedByName}` : ''}{e.indication ? ` · Indicación: ${e.indication}` : ''}</p>
              <ExamRow e={e} reload={load} open expanded={!!open[e.id]} onToggle={() => setOpen((x) => ({ ...x, [e.id]: !x[e.id] }))} />
            </article>
          ))}
          {tab === 'done' && <Pagination page={page} pages={Math.ceil(list.length / PAGE_SIZE)} total={list.length} size={PAGE_SIZE} onPage={setPage} />}
        </div>
      )}
      {ambulatory && <AmbulatoryModal group={group} onClose={() => setAmbulatory(false)} onDone={() => { setAmbulatory(false); load() }} />}
    </div>
  )
}
