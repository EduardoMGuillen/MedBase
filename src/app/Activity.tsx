import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading } from '../components/ui'
import { date, localISODate, time } from '../lib/format'
import { AUDIT_KINDS, type AuditKind } from '../lib/audit'
import { ROLE_LABEL, ROLES_BY_KIND } from '../lib/permissions'
import { download, toCsv } from '../lib/csv'
import { PatientPicker } from './Inpatients'
import type { Role } from '../lib/types'

interface Row { id: string; at: string; userId: string; action: string; role?: Role; kind: AuditKind; patientId?: string; patientName?: string }
interface Filters { userId: string; role: string; kind: string; patientId: string; q: string; from: string; to: string }

const EMPTY: Filters = { userId: '', role: '', kind: '', patientId: '', q: '', from: '', to: '' }

/**
 * AD7: bitácora. `mine`: lo que hizo quien la mira (todos los roles, en Mi configuración). Si no, la de todos
 * (administración, en Personal y roles), con filtros por persona, rol, tipo de acción, paciente y fechas. Sólo se lee:
 * nadie la edita ni la borra. Se exporta a Excel (CSV).
 */
export function AuditLog({ mine = false }: { mine?: boolean }) {
  const { staff, staffById, settings, user, notify } = useStore()
  const [f, setF] = useState<Filters>(() => {
    const from = new Date(); from.setDate(from.getDate() - 30)
    return { ...EMPTY, from: localISODate(from), to: localISODate(new Date()) }
  })
  const [rows, setRows] = useState<Row[] | null>(null)
  const set = (k: keyof Filters) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  useEffect(() => {
    let alive = true
    const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][])
    const t = setTimeout(() => {
      api<Row[]>(`/audit${mine ? '/mine' : ''}?${params}`).then((r) => { if (alive) setRows(r) }).catch((e: Error) => notify(e.message, 'error'))
    }, f.q ? 300 : 0)
    return () => { alive = false; clearTimeout(t) }
  }, [f, mine, notify])
  const who = (id: string) => (id === 'online' ? 'Reserva en línea' : id === 'sistema' ? 'Sistema' : staffById(id)?.name ?? 'Administración de Clinara')
  const exportCsv = () => rows && download(`bitacora${mine ? `-${user?.name.replace(/\W+/g, '-').toLowerCase()}` : ''}-${f.from || 'inicio'}-a-${f.to || 'hoy'}.csv`, toCsv([
    ['Fecha', 'Hora', ...(mine ? [] : ['Persona']), 'Rol', 'Tipo', 'Acción', 'Paciente'],
    ...rows.map((r) => [localISODate(new Date(r.at)), time(r.at), ...(mine ? [] : [who(r.userId)]), r.role ? ROLE_LABEL[r.role] : '', AUDIT_KINDS[r.kind], r.action, r.patientName ?? '']),
  ]))
  const roles = ROLES_BY_KIND[settings.kind ?? 'clinic']
  return (
    <section className="panel table-wrap">
      <div className="panel__head"><div><h2>{mine ? 'Mi actividad' : 'Bitácora'}</h2><p>{mine ? 'Todo lo que has hecho en el sistema, con fecha y hora. No se edita ni se borra.' : 'Quién hizo qué y cuándo, con qué rol. No se edita ni se borra.'}</p></div>
        <button className="btn btn--ghost btn--sm" disabled={!rows?.length} onClick={exportCsv}><Download size={15} />Exportar a Excel</button></div>
      <div className="panel__body audit-filters">
        {!mine && <label className="field"><span>Persona</span><select className="select" value={f.userId} onChange={(e) => set('userId')(e.target.value)}>
          <option value="">Todas</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
        <label className="field"><span>Rol</span><select className="select" value={f.role} onChange={(e) => set('role')(e.target.value)}>
          <option value="">Todos</option>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
        <label className="field"><span>Tipo de acción</span><select className="select" value={f.kind} onChange={(e) => set('kind')(e.target.value)}>
          <option value="">Todas</option>{(Object.keys(AUDIT_KINDS) as AuditKind[]).map((k) => <option key={k} value={k}>{AUDIT_KINDS[k]}</option>)}</select></label>
        <label className="field"><span>Desde</span><input className="input" type="date" value={f.from} max={f.to || undefined} onChange={(e) => set('from')(e.target.value)} /></label>
        <label className="field"><span>Hasta</span><input className="input" type="date" value={f.to} min={f.from || undefined} onChange={(e) => set('to')(e.target.value)} /></label>
        <label className="field audit-filters__q"><span>Buscar en la acción</span><input className="input" value={f.q} onChange={(e) => set('q')(e.target.value)} placeholder="Ej. receta, cobro, constancia" /></label>
        <div className="audit-filters__patient"><PatientPicker value={f.patientId} onChange={set('patientId')} autoFocus={false} /></div>
      </div>
      {!rows ? <Loading /> : (<>
        <table className="table table--sticky">
          <thead><tr><th>Fecha y hora</th>{!mine && <th>Persona</th>}<th>Rol</th><th>Acción</th><th>Paciente</th></tr></thead>
          <tbody>{rows.map((e) => (
            <tr key={e.id}>
              <td className="num" style={{ whiteSpace: 'nowrap' }}>{date(e.at)} {time(e.at)}</td>
              {!mine && <td>{who(e.userId)}</td>}
              <td>{e.role ? ROLE_LABEL[e.role] : <span className="muted">—</span>}</td>
              <td>{e.action}<small className="muted" style={{ display: 'block' }}>{AUDIT_KINDS[e.kind]}</small></td>
              <td>{e.patientName ?? <span className="muted">—</span>}</td>
            </tr>
          ))}</tbody>
        </table>
        {!rows.length && <div className="empty">Nada en la bitácora con esos filtros.</div>}
        {rows.length >= 2000 && <p className="muted" style={{ padding: '10px 22px', fontSize: 13.5 }}>Se muestran las 2000 más recientes. Acota las fechas para ver más.</p>}
      </>)}
    </section>
  )
}

export const MyActivity = () => <AuditLog mine />
