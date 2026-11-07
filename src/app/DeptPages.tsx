import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading, PageHead } from '../components/ui'
import { ExamCatalogAdmin, LabProfilesAdmin } from './ExamCatalogAdmin'
import { Roster } from './Roster'
import { ExamList } from './ExamsTab'
import PatientChart from './PatientChart'
import { age, dmyTime } from '../lib/format'
import { isPending } from '../lib/exams'
import { TabRow } from '../components/TabRow'
import type { ExamGroup, ExamOrder } from '../lib/types'

/** DP1 (ronda 11): una pantalla de un departamento solo la abre ese departamento (Laboratorio o Imágenes). */
export function DeptOnly({ dept, children, view = false }: { dept: ExamGroup; children: ReactNode; view?: boolean }) {
  const { user, can } = useStore()
  // AD1 (ronda 17): administración de la clínica abre las bandejas en solo lectura (el servidor no le manda resultados ni la deja
  // tomar muestras, cargar resultados ni marcar «No se realizó»)
  if (view && user?.role !== dept && can('dept.view')) return <><DeptViewBar dept={dept} />{children}</>
  if (user?.role !== dept) return <div className="page"><section className="panel"><div className="empty"><b>Sin permiso.</b> Esta pantalla es de {dept === 'lab' ? 'Laboratorio' : 'Imágenes'}.</div></section></div>
  return children
}

/** AD1 (ronda 17): aviso de solo lectura y las áreas de la bandeja (todas, ambulatorio, observación, hospitalización). */
function DeptViewBar({ dept }: { dept: ExamGroup }) {
  const base = `/app/${dept === 'lab' ? 'laboratorio' : 'imagenes'}`
  const areas: [string, string][] = [['', 'Todas las áreas'], ['/ambulatorio', 'Ambulatorio'], ['/observacion', 'Observación'], ['/hospitalizacion', 'Hospitalización']]
  return (
    <div className="page dept-view-bar" style={{ paddingBottom: 0 }} data-testid="dept-view-bar">
      <p role="note" className="muted" style={{ margin: '0 0 12px', padding: '10px 14px', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13.5 }}>Solo lectura: ves los estudios, su estado, la espera y los urgentes. Las muestras y los resultados son de {dept === 'lab' ? 'Laboratorio' : 'Imágenes'}.</p>
      <nav className="segmented" aria-label="Área de la bandeja" style={{ flexWrap: 'wrap' }}>
        {areas.map(([slug, label]) => <NavLink key={slug} to={`${base}${slug}`} end className={({ isActive }) => (isActive ? 'is-active' : undefined)} aria-current={undefined}>{label}</NavLink>)}
      </nav>
    </div>
  )
}

/**
 * DP5 (ronda 11): «Configuración de laboratorio» (catálogo de Laboratorio con sus valores de referencia, perfiles de laboratorio y
 * umbrales críticos) y «Configuración de imágenes» (catálogo de Imagen y gabinete, con los campos que pide al ordenar). Son las
 * mismas tarjetas de Configuración de la clínica, filtradas. Editan el Microbiólogo y el Radiólogo; los técnicos solo ven.
 */
export function DeptConfig({ group }: { group: ExamGroup }) {
  const { can } = useStore()
  const edit = can('dept.config')
  return (
    <div className="page">
      <PageHead title={group === 'lab' ? 'Configuración de laboratorio' : 'Configuración de imágenes'}
        sub={edit ? 'Lo que cambies aquí lo ven los médicos al ordenar. Cada cambio queda en la bitácora, con el valor anterior y el nuevo.' : 'Solo lectura: la editan el microbiólogo o el radiólogo, y Administración.'} />
      <div className="hc">
        <ExamCatalogAdmin only={group} readOnly={!edit} />
        {group === 'lab' && <LabProfilesAdmin readOnly={!edit} />}
      </div>
    </div>
  )
}

/** DP6: «Rol de turnos» del menú de Laboratorio e Imágenes: solo su departamento; edita el jefe (de hoy en adelante). */
export function DeptRosterPage() {
  const { user, can } = useStore()
  if (user?.role !== 'lab' && user?.role !== 'imaging') return <Navigate to="/app" replace />
  return <div className="page"><Roster fixed={user.role} canEdit={can('dept.config')} /></div>
}

/**
 * EN1 (ronda 16): «Rol de turnos» del menú de Enfermería (bajo «Registros»): solo el de enfermería; lo edita la licenciada, de
 * hoy en adelante (el servidor también lo exige); las auxiliares lo ven sin editar.
 */
export function NurseRosterPage() {
  const { can } = useStore()
  return <div className="page"><Roster fixed="nursing" canEdit={can('roster.edit')} /></div>
}

interface DeptView {
  patient: { id: string; name: string; record: string; birthDate: string; sex: string; dni?: string; phone: string; allergies: string[] }
  location?: string; group: ExamGroup; exams: ExamOrder[]; creatinine?: { value: string; unit?: string; at: string; flag?: string; exam: string }
}

/**
 * DP4 (ronda 11): la página del paciente para Microbiólogo, Técnico de laboratorio y Técnico en imágenes: datos generales,
 * alergias, ubicación y los exámenes de su departamento (con sus acciones); Imágenes ve además la última creatinina. Nada de
 * notas, diagnósticos, medicamentos, signos vitales, anexos ni Caja (el servidor tampoco los entrega). El Radiólogo y los demás
 * roles con acceso al expediente ven la página de siempre.
 */
export function ChartOrDept() {
  const { user, can } = useStore()
  if ((user?.role === 'lab' || user?.role === 'imaging') && !can('chart.view')) return <DeptPatient />
  return <PatientChart />
}

/**
 * LB7 (ronda 12): para Laboratorio (y el técnico en imágenes) el expediente es parcial, en dos pestañas: «Datos generales»
 * (identificación, alergias, ubicación y, en imágenes, la última creatinina) y «Órdenes activas o pendientes», donde toman la
 * muestra o realizan el estudio y suben el resultado. Lo ya terminado queda en «Resultados».
 */
function DeptPatient() {
  const { id } = useParams()
  const { notify } = useStore()
  const [v, setV] = useState<DeptView | null>(null)
  const [tab, setTab] = useState<'data' | 'pending' | 'done' | null>(null)
  const load = () => { api<DeptView>(`/dept/patients/${id}`).then(setV).catch((e: Error) => notify(e.message, 'error')) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id])
  if (!v) return <Loading label="Abriendo el paciente" />
  const p = v.patient
  const pending = v.exams.filter((e) => isPending(e) && e.status !== 'cancelled')
  const done = v.exams.filter((e) => !isPending(e) && e.status !== 'cancelled')
  const shown = tab ?? (pending.length ? 'pending' : 'data')
  return (
    <div className="page page--chart">
      <div className="sticky-top">
        <section className="panel">
          <div className="panel__body dept-pt">
            <h1 className="ph__name">{p.name}</h1>
            <div className="ph__meta"><span><b>{p.birthDate ? age(p.birthDate) : '—'}</b>, {p.sex === 'F' ? 'femenino' : 'masculino'}</span><span>Exp. <b>{p.record}</b></span>{p.dni && <span>ID <b>{p.dni}</b></span>}</div>
            <div className="ph__clinical">
              {p.allergies.length ? <span className="ph__allergy"><TriangleAlert size={14} />Alergias: {p.allergies.join(', ')}</span> : <span className="ph__ok">Sin alergias conocidas</span>}
              {v.location && <span className="badge badge--ink">{v.location}</span>}
            </div>
          </div>
        </section>
        <TabRow>
          <button className="tab" role="tab" aria-selected={shown === 'data'} onClick={() => setTab('data')}>Datos generales</button>
          <button className="tab" role="tab" aria-selected={shown === 'pending'} onClick={() => setTab('pending')}>Órdenes activas o pendientes ({pending.length}){pending.some((e) => e.priority === 'urgent') && <span className="tab-alert tab-alert--critical">!</span>}</button>
          <button className="tab" role="tab" aria-selected={shown === 'done'} onClick={() => setTab('done')}>Resultados ({done.length})</button>
        </TabRow>
      </div>
      {shown === 'data' && (
        <section className="panel hc__sec">
          <div className="panel__head"><h2>Datos generales</h2></div>
          <div className="panel__body">
            <dl className="facts">
              <div><dt>Nombre</dt><dd>{p.name}</dd></div>
              <div><dt>Edad y sexo</dt><dd>{p.birthDate ? age(p.birthDate) : '—'}, {p.sex === 'F' ? 'femenino' : 'masculino'}</dd></div>
              <div><dt>Expediente</dt><dd>{p.record}</dd></div>
              <div><dt>Identidad</dt><dd>{p.dni || <span className="muted">Sin dato</span>}</dd></div>
              <div><dt>Teléfono</dt><dd>{p.phone || <span className="muted">Sin dato</span>}</dd></div>
              <div><dt>Ubicación</dt><dd>{v.location ?? 'Ambulatorio o consulta externa'}</dd></div>
              <div><dt>Alergias</dt><dd>{p.allergies.length ? p.allergies.join(', ') : 'Sin alergias conocidas'}</dd></div>
            </dl>
            {v.group === 'imaging' && (
              <p className="dept-pt__renal">{v.creatinine
                ? <>Última creatinina: <b>{v.creatinine.value} {v.creatinine.unit}</b> ({dmyTime(v.creatinine.at)}){v.creatinine.flag ? <b className="dept-pt__flag"> · {v.creatinine.flag === 'high' ? 'Alta' : 'Baja'}, fuera de rango</b> : ' · dentro de rango'}</>
                : 'Sin resultado de creatinina en el expediente.'}</p>
            )}
          </div>
        </section>
      )}
      {shown === 'pending' && (pending.length ? <ExamList exams={pending} patientId={p.id} reload={load} only={v.group} />
        : <section className="panel"><div className="empty">Sin órdenes pendientes de {v.group === 'lab' ? 'laboratorio' : 'imágenes'}.</div></section>)}
      {shown === 'done' && (done.length ? <ExamList exams={done} patientId={p.id} reload={load} only={v.group} />
        : <section className="panel"><div className="empty">Todavía no hay resultados.</div></section>)}
    </div>
  )
}
