import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, UserPlus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Modal, PageHead } from '../components/ui'
import { IdentificationForm } from './PatientForms'
import { age, date, dniDigits, fullName, localISODate } from '../lib/format'
import { useIsPhone } from '../lib/hooks'
import { yearsOld } from '../lib/inpatient'
import type { Patient, PatientIndex } from '../lib/types'

const PALETTE = ['#2335C9', '#0F8A6E', '#B4407A', '#C27A12', '#6A4BC4', '#2C7DA0']
export const patientColor = (id: string) => PALETTE[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length]

type SortKey = 'name' | 'age' | 'last' | 'next'

/** Filtros de la biblioteca. Viven en la URL para que se conserven al recargar o compartir el enlace. */
const FILTER_KEYS = ['sexo', 'edadMin', 'edadMax', 'fecha', 'desde', 'hasta', 'medico', 'seguimiento', 'cita', 'estado'] as const
type FilterKey = (typeof FILTER_KEYS)[number]
const DATE_FIELD = { registro: 'Fecha de registro', ultima: 'Última consulta', proxima: 'Próxima cita' } as const
const STATE_LABEL = { activo: 'Activos (sin internar)', hospitalizado: 'Hospitalizados', observacion: 'En observación' } as const
const dmy = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}` }

export default function Patients() {
  const { patients, appointments, discharges = [], staff, can, addPatient, fetchPatientIndex } = useStore()
  const nav = useNavigate()
  const phone = useIsPhone()
  const [params, setParams] = useSearchParams()
  // El estado local manda y se copia a la URL: dos cambios seguidos no se pisan
  const [values, setValues] = useState<Record<FilterKey | 'q', string>>(() => Object.fromEntries(['q', ...FILTER_KEYS].map((k) => [k, params.get(k) ?? ''])) as Record<FilterKey | 'q', string>)
  const q = values.q
  const f = values
  const [adding, setAdding] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [index, setIndex] = useState<Map<string, PatientIndex> | null>(null)

  // Última consulta, próxima cita, seguimientos y estado se calculan en el servidor sobre todo el historial
  useEffect(() => {
    let alive = true
    fetchPatientIndex().then((rows) => alive && setIndex(new Map(rows.map((r) => [r.patientId, r])))).catch(() => null)
    return () => { alive = false }
  }, [fetchPatientIndex, appointments.length, patients.length])

  const setParam = (changes: Partial<Record<FilterKey | 'q', string>>) => setValues((v) => ({ ...v, ...changes }))
  useEffect(() => {
    setParams(Object.fromEntries(Object.entries(values).filter(([, v]) => v)), { replace: true })
  }, [values, setParams])

  const lastVisit = (id: string) => index?.get(id)?.lastConsultAt ?? appointments
    .filter((a) => a.patientId === id && a.status === 'done')
    .sort((a, b) => b.start.localeCompare(a.start))[0]?.start
  const dischargeOf = (id: string) => discharges.find((d) => d.patientId === id)?.at
  const nextAppt = (id: string) => appointments
    .filter((a) => a.patientId === id && new Date(a.start) > new Date() && ['scheduled', 'confirmed'].includes(a.status))
    .sort((a, b) => a.start.localeCompare(b.start))[0]
  const lastStamp = (id: string) => [lastVisit(id), dischargeOf(id)].filter(Boolean).sort().at(-1) ?? ''

  // Los pacientes agendados por teléfono que no han completado su registro no cuentan en la biblioteca
  const registered = useMemo(() => patients.filter((p) => !p.pending), [patients])
  const chronicTitles = useMemo(() => [...new Set([...(index?.values() ?? [])].flatMap((x) => x.followups.filter((y) => y.kind === 'chronic').map((y) => y.title)))].sort(), [index])
  const doctors = staff.filter((x) => x.role === 'doctor')

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    // La identidad se encuentra con o sin guiones
    const sd = dniDigits(s)
    const dateField = f.fecha || (f.desde || f.hasta ? 'ultima' : '')
    const filtered = registered.filter((p) => {
      if (s && !(fullName(p).toLowerCase().includes(s) || p.record.toLowerCase().includes(s) || p.phone.includes(s) || (sd.length >= 3 && dniDigits(p.dni).includes(sd)))) return false
      const ix = index?.get(p.id)
      if (f.sexo && p.sex !== f.sexo) return false
      if (f.edadMin || f.edadMax) {
        const y = p.birthDate ? yearsOld(p.birthDate) : NaN
        if (f.edadMin && !(y >= Number(f.edadMin))) return false
        if (f.edadMax && !(y <= Number(f.edadMax))) return false
      }
      if (dateField && (f.desde || f.hasta)) {
        const raw = dateField === 'registro' ? p.createdAt : dateField === 'ultima' ? lastVisit(p.id) : ix?.nextApptAt ?? nextAppt(p.id)?.start
        if (!raw) return false
        const d = raw.length === 10 ? raw : localISODate(new Date(raw))
        if (f.desde && d < f.desde) return false
        if (f.hasta && d > f.hasta) return false
      }
      if (f.medico && ix?.lastDoctorId !== f.medico && ix?.nextDoctorId !== f.medico) return false
      if (f.seguimiento) {
        const fu = ix?.followups ?? []
        if (f.seguimiento === 'cualquiera' && !fu.length) return false
        if (f.seguimiento === 'recordatorio' && !fu.some((x) => x.kind === 'reminder')) return false
        if (f.seguimiento === 'procedimiento' && !fu.some((x) => x.kind === 'procedure')) return false
        if (f.seguimiento.startsWith('cronico:') && !fu.some((x) => x.kind === 'chronic' && x.title === f.seguimiento.slice(8))) return false
      }
      if (f.cita === 'con' && !(ix?.nextApptAt ?? nextAppt(p.id))) return false
      if (f.cita === 'sin' && (ix?.nextApptAt ?? nextAppt(p.id))) return false
      if (f.estado) {
        const st = ix?.status ?? 'active'
        if ({ activo: 'active', hospitalizado: 'hospital', observacion: 'observation' }[f.estado] !== st) return false
      }
      return true
    })
    const cmp = (a: Patient, b: Patient) => {
      if (sort.key === 'name') return fullName(a).localeCompare(fullName(b), 'es') * sort.dir
      if (sort.key === 'age') return a.birthDate.localeCompare(b.birthDate) * -sort.dir
      const emptyLast = (av: string, bv: string) => {
        if (!av && !bv) return 0
        if (!av) return 1
        if (!bv) return -1
        return av.localeCompare(bv) * sort.dir
      }
      if (sort.key === 'last') return emptyLast(lastStamp(a.id), lastStamp(b.id))
      return emptyLast(nextAppt(a.id)?.start ?? '', nextAppt(b.id)?.start ?? '')
    }
    return [...filtered].sort(cmp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registered, values, sort, appointments, discharges, index])

  // Un chip por filtro activo; la X quita ese filtro
  const chips: { label: string; clear: Partial<Record<FilterKey, string>> }[] = []
  if (f.sexo) chips.push({ label: f.sexo === 'F' ? 'Mujeres' : 'Hombres', clear: { sexo: '' } })
  if (f.edadMin || f.edadMax) chips.push({ label: f.edadMin && f.edadMax ? `Edad ${f.edadMin} a ${f.edadMax} años` : f.edadMin ? `Desde ${f.edadMin} años` : `Hasta ${f.edadMax} años`, clear: { edadMin: '', edadMax: '' } })
  if (f.desde || f.hasta) {
    const field = DATE_FIELD[(f.fecha || 'ultima') as keyof typeof DATE_FIELD]
    chips.push({ label: `${field}: ${f.desde ? `desde ${dmy(f.desde)}` : ''}${f.desde && f.hasta ? ' ' : ''}${f.hasta ? `hasta ${dmy(f.hasta)}` : ''}`, clear: { fecha: '', desde: '', hasta: '' } })
  }
  if (f.medico) chips.push({ label: `Médico: ${staff.find((x) => x.id === f.medico)?.name ?? 'otro'}`, clear: { medico: '' } })
  if (f.seguimiento) chips.push({ label: f.seguimiento === 'cualquiera' ? 'Con seguimiento activo' : f.seguimiento === 'recordatorio' ? 'Con recordatorio' : f.seguimiento === 'procedimiento' ? 'Con procedimiento programado' : `Crónico: ${f.seguimiento.slice(8)}`, clear: { seguimiento: '' } })
  if (f.cita) chips.push({ label: f.cita === 'con' ? 'Con próxima cita' : 'Sin próxima cita', clear: { cita: '' } })
  if (f.estado) chips.push({ label: STATE_LABEL[f.estado as keyof typeof STATE_LABEL] ?? f.estado, clear: { estado: '' } })
  const clearAll = () => setParam(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))

  const toggle = (key: SortKey) => setSort((s) => s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 })
  const mark = (key: SortKey) => sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''

  const filterFields = (
    <div className="form-grid form-grid--4 filters">
      <label className="field"><span>Sexo</span>
        <select className="select" value={f.sexo} onChange={(e) => setParam({ sexo: e.target.value })}>
          <option value="">Todos</option><option value="F">Femenino</option><option value="M">Masculino</option></select></label>
      <div className="field"><span>Edad (años)</span>
        <div className="range-pair">
          <input className="input num" inputMode="numeric" placeholder="Desde" aria-label="Edad desde" value={f.edadMin} onChange={(e) => setParam({ edadMin: e.target.value.replace(/\D/g, '') })} />
          <input className="input num" inputMode="numeric" placeholder="Hasta" aria-label="Edad hasta" value={f.edadMax} onChange={(e) => setParam({ edadMax: e.target.value.replace(/\D/g, '') })} />
        </div></div>
      <label className="field"><span>Médico tratante</span>
        <select className="select" value={f.medico} onChange={(e) => setParam({ medico: e.target.value })}>
          <option value="">Todos</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="field"><span>Estado</span>
        <select className="select" value={f.estado} onChange={(e) => setParam({ estado: e.target.value })}>
          <option value="">Todos</option>{Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="field"><span>Filtrar por fecha de</span>
        <select className="select" value={f.fecha || 'ultima'} onChange={(e) => setParam({ fecha: e.target.value })}>
          {Object.entries(DATE_FIELD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <div className="field"><span>Entre</span>
        <div className="range-pair">
          <input className="input" type="date" aria-label="Desde la fecha" value={f.desde} onChange={(e) => setParam({ desde: e.target.value })} />
          <input className="input" type="date" aria-label="Hasta la fecha" value={f.hasta} onChange={(e) => setParam({ hasta: e.target.value })} />
        </div></div>
      <label className="field"><span>Crónicos y seguimientos</span>
        <select className="select" value={f.seguimiento} onChange={(e) => setParam({ seguimiento: e.target.value })}>
          <option value="">Todos</option><option value="cualquiera">Con seguimiento activo</option>
          {chronicTitles.map((t) => <option key={t} value={`cronico:${t}`}>Crónico: {t}</option>)}
          <option value="recordatorio">Con recordatorio</option><option value="procedimiento">Con procedimiento programado</option></select></label>
      <label className="field"><span>Próxima cita</span>
        <select className="select" value={f.cita} onChange={(e) => setParam({ cita: e.target.value })}>
          <option value="">Todos</option><option value="con">Con próxima cita</option><option value="sin">Sin próxima cita</option></select></label>
    </div>
  )

  return (
    <div className="page">
      <PageHead title="Pacientes" sub={`${registered.length} expedientes en la clínica`}
        actions={can('patients.manage') && <button className="btn btn--primary" onClick={() => setAdding(true)}><UserPlus size={17} />Registrar paciente</button>} />

      <div className="lib-bar">
        <label className="suggest lib-bar__search">
          <Search size={17} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--faint)' }} />
          <input className="input" style={{ paddingLeft: 38 }} placeholder="Buscar por nombre, expediente o teléfono" value={q} onChange={(e) => setParam({ q: e.target.value })} aria-label="Buscar pacientes" />
        </label>
        <button className={`btn ${showFilters ? 'btn--soft' : 'btn--ghost'}`} aria-expanded={showFilters} onClick={() => setShowFilters((x) => !x)}>
          <SlidersHorizontal size={16} />Filtros{chips.length ? ` (${chips.length})` : ''}</button>
        <span className="lib-bar__count num">{list.length === registered.length ? `${registered.length} expedientes` : `${list.length} de ${registered.length} expedientes`}</span>
      </div>

      {showFilters && !phone && <section className="panel"><div className="panel__body">{filterFields}</div></section>}
      {showFilters && phone && (
        <Modal title="Filtros" onClose={() => setShowFilters(false)} footer={<>
          {chips.length > 0 && <button className="btn btn--ghost" onClick={clearAll}>Limpiar filtros</button>}
          <button className="btn btn--primary" onClick={() => setShowFilters(false)}>Ver {list.length} de {registered.length}</button>
        </>}>{filterFields}</Modal>
      )}

      {chips.length > 0 && (
        <div className="chips filter-chips" aria-label="Filtros activos">
          {chips.map((c) => (
            <span key={c.label} className="chip chip--filter">{c.label}
              <button className="icon-btn" aria-label={`Quitar filtro ${c.label}`} onClick={() => setParam(c.clear)}><X size={13} /></button></span>
          ))}
          <button className="btn btn--ghost btn--sm" onClick={clearAll}>Limpiar filtros</button>
        </div>
      )}

      <section className="panel table-wrap">
        <table className="table">
          <thead><tr>
            <th><button className="th-sort" onClick={() => toggle('name')}>Paciente{mark('name')}</button></th>
            <th><button className="th-sort" onClick={() => toggle('age')}>Edad{mark('age')}</button></th>
            <th>Teléfono</th>
            <th><button className="th-sort" onClick={() => toggle('last')}>Última consulta{mark('last')}</button></th>
            <th><button className="th-sort" onClick={() => toggle('next')}>Próxima cita{mark('next')}</button></th>
          </tr></thead>
          <tbody>
            {list.map((p) => {
              const nx = nextAppt(p.id)
              const lv = lastVisit(p.id)
              const eg = dischargeOf(p.id)
              const st = index?.get(p.id)?.status
              return (
                <tr key={p.id}>
                  <td>
                    <div className="cell-person">
                      <Avatar name={fullName(p)} color={patientColor(p.id)} />
                      <Link to={`/app/pacientes/${p.id}`}>{fullName(p)}<small>{p.record}{st === 'hospital' ? ' · Hospitalizado' : st === 'observation' ? ' · En observación' : ''}</small></Link>
                    </div>
                  </td>
                  <td className="num">{age(p.birthDate)}</td>
                  <td className="num">{p.phone}</td>
                  <td>
                    {lv && <div>Consulta {date(lv)}</div>}
                    {eg && <div>Egreso {date(eg)}</div>}
                    {!lv && !eg && <span style={{ color: 'var(--faint)' }}>Sin consultas</span>}
                  </td>
                  <td>{nx ? date(nx.start, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : <span style={{ color: 'var(--faint)' }}>Sin agendar</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!list.length && <div className="empty">{q ? `Ningún paciente coincide con “${q}”${chips.length ? ' y los filtros elegidos' : ''}.` : 'Ningún paciente cumple los filtros elegidos.'} {chips.length > 0 && <button className="linklike" onClick={clearAll}>Limpiar filtros</button>}</div>}
      </section>

      {adding && <IdentificationForm title="Registrar paciente" submitLabel="Registrar paciente" withAllergies onClose={() => setAdding(false)} onSave={async (p) => {
        const r = await addPatient(p as Omit<Patient, 'id' | 'record' | 'createdAt'>)
        if (r) { setAdding(false); nav(`/app/pacientes/${r.id}`) }
      }} />}
    </div>
  )
}
