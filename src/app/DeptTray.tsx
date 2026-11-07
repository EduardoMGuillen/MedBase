import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { DateField } from '../components/DateTimeField'
import { api } from '../lib/api'
import { Loading, PageHead } from '../components/ui'
import { Pagination, usePage } from '../components/Pagination'
import { age, dateTime, localISODate } from '../lib/format'
import { examCatalog, examLine, finishedOn, GROUP_LABEL, reportOptional, trayCards } from '../lib/exams'
import { useExamCatalog } from '../lib/useExamCatalog'
import { PAGE_SIZE } from '../lib/clinicalConfig'
import { ExamRow, TakeAllButton, useCanTake } from './ExamsTab'
import { AmbulatoryModal } from './Ambulatory'
import type { ExamGroup, ExamOrder } from '../lib/types'

export type Item = ExamOrder & { patient: { id: string; name: string; birthDate: string; sex: string; record: string }; locationText: string }
type TabKey = 'todo' | 'process' | 'done' | 'notdone'

/** LB5 e IM1 (ronda 12): las tres áreas de la bandeja (consulta externa va con los ambulatorios: no están internados). */
export type DeptArea = 'outpatient' | 'observation' | 'hospital'
export const AREA_LABEL: Record<DeptArea, string> = { outpatient: 'Ambulatorio', observation: 'Observación', hospital: 'Hospitalización' }
export const AREA_SLUG: Record<DeptArea, string> = { outpatient: 'ambulatorio', observation: 'observacion', hospital: 'hospitalizacion' }
export const areaOf = (e: Pick<Item, 'locationText'>): DeptArea => (e.locationText.startsWith('Observación') ? 'observation' : e.locationText.startsWith('Hospitalización') ? 'hospital' : 'outpatient')
/** Dónde abre el paciente: el expediente de la estancia (si lo puede ver) o la página del paciente del departamento. */
export const patientLink = (e: Item, chart: boolean) => (chart && e.hospitalizationId && areaOf(e) !== 'outpatient' ? `/app/${areaOf(e) === 'observation' ? 'observacion' : 'hospitalizados'}/${e.hospitalizationId}?tab=examenes` : `/app/pacientes/${e.patient.id}`)

const TABS: Record<ExamGroup, { key: TabKey; label: string }[]> = {
  lab: [{ key: 'todo', label: 'Por tomar muestra' }, { key: 'process', label: 'En proceso' }, { key: 'done', label: 'Resultados de hoy' }, { key: 'notdone', label: 'No realizados' }],
  imaging: [{ key: 'todo', label: 'Por realizar' }, { key: 'process', label: 'Por informar' }, { key: 'done', label: 'Terminados hoy' }, { key: 'notdone', label: 'No realizados' }],
}

/** En qué pestaña va cada orden. Los Rayos X realizados no esperan informe (EX3): van a «Terminados». */
export function tabOf(e: ExamOrder): TabKey | null {
  if (e.status === 'cancelled') return null
  if (e.notDone && ['ordered', 'sample', 'done'].includes(e.status)) return 'notdone'
  if (e.status === 'ordered') return 'todo'
  if (e.status === 'sample') return 'process'
  if (e.status === 'done') return reportOptional(e) ? 'done' : 'process'
  return 'done'
}

export const waitText = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d`
}

/**
 * DP2 (ronda 11): bandeja de trabajo de Laboratorio o de Imágenes (un solo componente por tipo). Entran todas las órdenes «En la
 * clínica» del tipo (consulta externa, observación, hospitalización y ambulatorios); las «Externo», no. Cada fila: urgente,
 * paciente, ubicación, estudio armado (CA6), quién pidió, indicación, hora del pedido y espera; las acciones son las de la
 * pestaña Exámenes (la misma fuente de verdad). Urgentes primero, después los más antiguos. Se actualiza sola.
 * LB9 (ronda 17): Laboratorio e Imágenes, en sus tres áreas, usan la misma tarjeta por paciente (`trayCards`).
 */
export default function DeptTray({ group, area }: { group: ExamGroup; area?: DeptArea }) {
  const { can } = useStore()
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
  // RX1 (ronda 16): «Terminados hoy» por la fecha local, no por la fecha UTC (lo de después de las 18:00 se perdía)
  const inTab = (e: Item, k: TabKey) => tabOf(e) === k && (k !== 'done' || finishedOn(e, day))
  const filtered = useMemo(() => (items ?? []).filter((e) => (!area || areaOf(e) === area) && (!where || e.locationText.startsWith(where)) && (!urgentOnly || e.priority === 'urgent')
    && (!q.trim() || fold(`${e.patient.name} ${e.patient.record} ${examLine(e)}`).includes(fold(q.trim())))), [items, where, urgentOnly, q, area])
  const list = filtered.filter((e) => inTab(e, tab))
    .sort((a, b) => (tab === 'done' ? (b.result?.at ?? b.statusAt ?? '').localeCompare(a.result?.at ?? a.statusAt ?? '')
      : Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || a.orderedAt.localeCompare(b.orderedAt)))
  const [page, setPage] = usePage(`${tab}|${q}|${where}|${urgentOnly}|${day}|${area}`)
  const places = area === 'outpatient' ? ['Consulta externa', 'Ambulatorio'] : area ? [] : ['Consulta externa', 'Observación', 'Hospitalización', 'Ambulatorio']
  const canTake = useCanTake()
  const { exams: clinicExams } = useExamCatalog()
  const catalog = useMemo(() => examCatalog(clinicExams), [clinicExams])
  // LB8 (ronda 16): una tarjeta por paciente (y por ubicación), en el orden de la lista: los urgentes arriba.
  // LB9 (ronda 17): la misma tarjeta en Laboratorio y en Imágenes, y en las tres áreas; un botón general y uno por categoría
  // con pendientes, siempre (antes el de la categoría solo salía con dos o más categorías, por eso Observación no lo tenía)
  const cardList = trayCards(list, catalog, (x) => canTake(x))
  const pagedCards = tab === 'done' ? cardList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : cardList
  return (
    <div className="page dept">
      <PageHead title={area ? `${AREA_LABEL[area]} · ${group === 'lab' ? 'Laboratorio' : 'Imágenes'}` : group === 'lab' ? 'Bandeja de laboratorio' : 'Bandeja de imágenes'}
        sub={area === 'outpatient' ? 'Pacientes de consulta externa y los que vienen solo a hacerse exámenes.' : area ? `Pacientes en ${AREA_LABEL[area].toLowerCase()}: toma la muestra o realiza el estudio y sube el resultado; el médico lo ve al instante.` : `Órdenes «En la clínica» de ${GROUP_LABEL[group].toLowerCase()}. Lo que hagas aquí se ve al instante en la pestaña Exámenes del paciente.`}
        actions={can('ambulatory.register') && (!area || area === 'outpatient') ? <button className="btn btn--primary" onClick={() => setAmbulatory(true)}><UserPlus size={17} />Paciente ambulatorio</button> : undefined} />
      <div className="segmented dept__tabs" role="tablist" aria-label="Bandeja">
        {TABS[group].map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>{t.label} <span className="num">{filtered.filter((e) => inTab(e, t.key)).length}</span></button>)}
      </div>
      <div className="exam-tools dept__filters" role="search">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar paciente o estudio" aria-label="Buscar paciente o estudio" />
        {places.length > 0 && <select className="select" value={where} onChange={(e) => setWhere(e.target.value)} aria-label="Ubicación"><option value="">Todas las ubicaciones</option>{places.map((p) => <option key={p}>{p}</option>)}</select>}
        <label className="check-inline"><input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />Solo urgentes</label>
        <DateField value={day} max={today} onChange={(v) => setDay(v || today)} label="Fecha" />
      </div>
      {items === null ? <Loading label="Cargando la bandeja" /> : !list.length ? <section className="panel"><div className="empty">Nada en «{TABS[group].find((t) => t.key === tab)!.label}».</div></section> : (
        <div className="dept__list">
          {pagedCards.map(({ key, items: xs, urgent, oldest, takeable, cats }) => {
            const e = xs[0]
            return (
              <article key={key} className={`panel dept__item dept-card${urgent ? ' dept__item--urgent' : ''}`}>
                <header className="dept__who">
                  {urgent && <span className="badge badge--red">Urgente</span>}
                  <Link to={patientLink(e, can('chart.view'))} className="dept__name">{e.patient.name}</Link>
                  <span className="muted">{e.patient.birthDate ? age(e.patient.birthDate) : ''}{e.patient.sex ? `, ${e.patient.sex === 'F' ? 'femenino' : 'masculino'}` : ''} · Exp. {e.patient.record}</span>
                  <span className="badge badge--ink">{e.locationText}</span>
                  <span className="dept-card__count">{xs.length} {xs.length === 1 ? 'examen' : 'exámenes'}</span>
                  <span className="muted dept__wait">{dateTime(oldest)} · espera {waitText(oldest, now)}</span>
                </header>
                {/* DP2: «Muestra tomada» (o «Realizado») de una vez para todos los exámenes de este paciente que esperan */}
                {takeable.length > 0 && <div className="dept-card__all"><TakeAllButton list={takeable} reload={load} className="btn btn--primary btn--sm" /></div>}
                {cats.map((c) => (
                  <section key={c.title} className="dept-card__cat">
                    <h4>{c.title} <span className="muted">({c.items.length})</span>
                      <TakeAllButton list={c.takeable} reload={load} /></h4>
                    {c.items.map((x) => <ExamRow key={x.id} e={x} reload={load} open compact expanded={!!open[x.id]} onToggle={() => setOpen((o) => ({ ...o, [x.id]: !o[x.id] }))} />)}
                  </section>
                ))}
              </article>
            )
          })}
          {tab === 'done' && <Pagination page={page} pages={Math.ceil(cardList.length / PAGE_SIZE)} total={cardList.length} size={PAGE_SIZE} onPage={setPage} />}
        </div>
      )}
      {ambulatory && <AmbulatoryModal group={group} onClose={() => setAmbulatory(false)} onDone={() => { setAmbulatory(false); load() }} />}
    </div>
  )
}
