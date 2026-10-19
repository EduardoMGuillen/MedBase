import { useState } from 'react'
import { Check, Minus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, PageHead } from '../components/ui'
import { PERMISSIONS, ROLE_LABEL, ROLE_PERMISSIONS, type Permission } from '../lib/permissions'
import { date, time } from '../lib/format'
import type { Role } from '../lib/types'

const ROLES: Role[] = ['admin', 'doctor', 'nurse', 'reception']
type Tab = 'people' | 'roles' | 'audit'

export default function StaffPage() {
  const { staff, toggleStaff, audit, staffById, user, reset } = useStore()
  const [tab, setTab] = useState<Tab>('people')

  return (
    <div className="page">
      <PageHead title="Personal y roles" sub="Quién trabaja en la clínica, qué puede hacer cada rol y quién hizo qué."
        actions={<button className="btn btn--ghost" onClick={() => { if (confirm('Esto borra los cambios de la demo y vuelve a los datos iniciales.')) reset() }}>Restablecer demo</button>} />
      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'people'} onClick={() => setTab('people')}>Personal</button>
        <button className="tab" role="tab" aria-selected={tab === 'roles'} onClick={() => setTab('roles')}>Permisos por rol</button>
        <button className="tab" role="tab" aria-selected={tab === 'audit'} onClick={() => setTab('audit')}>Bitácora</button>
      </div>

      {tab === 'people' && (
        <section className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Nombre</th><th>Rol</th><th>Correo</th><th>Estado</th><th /></tr></thead>
            <tbody>{staff.map((s) => (
              <tr key={s.id}>
                <td><div className="cell-person"><Avatar name={s.name} color={s.color} /><span style={{ fontWeight: 600 }}>{s.name}<small>{s.specialty ?? (s.license ? s.license : '')}</small></span></div></td>
                <td>{ROLE_LABEL[s.role]}</td>
                <td>{s.email}</td>
                <td>{s.active ? <span className="badge badge--mint">Activo</span> : <span className="badge">Desactivado</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  {s.id !== user?.id && <button className="btn btn--ghost btn--sm" onClick={() => toggleStaff(s.id)}>{s.active ? 'Desactivar' : 'Reactivar'}</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {tab === 'roles' && (
        <section className="panel table-wrap">
          <table className="table matrix">
            <thead><tr><th>Permiso</th>{ROLES.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>{(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
              <tr key={p}>
                <td>{PERMISSIONS[p]}</td>
                {ROLES.map((r) => <td key={r}>{ROLE_PERMISSIONS[r].includes(p)
                  ? <Check className="yes" size={18} aria-label="Permitido" />
                  : <Minus className="no" size={18} aria-label="Sin acceso" />}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {tab === 'audit' && (
        <section className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th></tr></thead>
            <tbody>{audit.map((e) => (
              <tr key={e.id}><td className="num">{date(e.at)} {time(e.at)}</td><td>{staffById(e.userId)?.name}</td><td>{e.action}</td></tr>
            ))}</tbody>
          </table>
          {!audit.length && <div className="empty">La bitácora se llena a medida que el equipo usa el sistema.</div>}
        </section>
      )}
    </div>
  )
}
