import { useState } from 'react'
import { Check, Minus, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Modal, PageHead } from '../components/ui'
import { PERMISSIONS, ROLE_LABEL, ROLE_PERMISSIONS, ROLE_SUMMARY, type Permission } from '../lib/permissions'
import { date, time } from '../lib/format'
import type { Role, Staff } from '../lib/types'

const ROLES: Role[] = ['admin', 'doctor', 'nurse', 'reception']
type Tab = 'people' | 'roles' | 'audit'

export default function StaffPage() {
  const { staff, updateStaff, resetStaffPassword, audit, staffById, user, demo, resetDemo } = useStore()
  const [tab, setTab] = useState<Tab>('people')
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<{ name: string; email: string; password: string } | null>(null)
  const [q, setQ] = useState('')
  const log = audit.filter((e) => !q || e.action.toLowerCase().includes(q.toLowerCase()) || staffById(e.userId)?.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="page">
      <PageHead title="Personal y roles" sub="Quién trabaja en la clínica, qué puede hacer cada rol y quién hizo qué."
        actions={<>
          {demo && <button className="btn btn--ghost" onClick={() => { if (confirm('Esto borra todos los cambios y vuelve a cargar la clínica de demo.')) resetDemo() }}>Restablecer demo</button>}
          <button className="btn btn--primary" onClick={() => setCreating(true)}><UserPlus size={17} />Nuevo usuario</button>
        </>} />
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
                <td><div className="cell-person"><Avatar name={s.name} color={s.color} /><span style={{ fontWeight: 600 }}>{s.name}<small>{[s.specialty, s.license].filter(Boolean).join(', ')}</small></span></div></td>
                <td>
                  {s.id === user?.id ? ROLE_LABEL[s.role] : (
                    <select className="select" style={{ height: 34, width: 'auto' }} value={s.role} aria-label={`Rol de ${s.name}`}
                      onChange={(e) => updateStaff(s.id, { role: e.target.value as Role })}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  )}
                </td>
                <td>{s.email}</td>
                <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{s.active ? <span className="badge badge--mint">Activo</span> : <span className="badge">Desactivado</span>}
                  {s.twoFactor && <span className="badge badge--ink">Dos pasos</span>}</div></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {s.id !== user?.id && <>
                    <button className="btn btn--ghost btn--sm" onClick={async () => {
                      if (!confirm(`Se generará una contraseña temporal para ${s.name} y se cerrarán sus sesiones abiertas.`)) return
                      const r = await resetStaffPassword(s.id)
                      if (r) setSecret({ name: s.name, email: s.email, password: r.password })
                    }}>Restablecer contraseña</button>{' '}
                    {s.twoFactor && <><button className="btn btn--ghost btn--sm" title="Por si perdió su teléfono" onClick={() => {
                      if (confirm(`¿Quitar la verificación en dos pasos de ${s.name}? Podrá entrar sólo con su contraseña hasta que la vuelva a activar.`)) updateStaff(s.id, { twoFactor: false })
                    }}>Quitar dos pasos</button>{' '}</>}
                    <button className="btn btn--ghost btn--sm" onClick={() => updateStaff(s.id, { active: !s.active })}>{s.active ? 'Desactivar' : 'Reactivar'}</button>
                  </>}
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

      {tab === 'audit' && (<>
        <input className="input" style={{ maxWidth: 420 }} placeholder="Filtrar por persona o acción" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar bitácora" />
        <section className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th></tr></thead>
            <tbody>{log.map((e) => (
              <tr key={e.id}><td className="num" style={{ whiteSpace: 'nowrap' }}>{date(e.at)} {time(e.at)}</td><td>{e.userId === 'online' ? 'Reserva en línea' : staffById(e.userId)?.name ?? 'Usuario eliminado'}</td><td>{e.action}</td></tr>
            ))}</tbody>
          </table>
          {!log.length && <div className="empty">{q ? 'Nada coincide con el filtro.' : 'La bitácora se llena a medida que el equipo usa el sistema.'}</div>}
        </section>
      </>)}

      {creating && <NewStaff onClose={() => setCreating(false)} onCreated={(s, password) => { setCreating(false); setSecret({ name: s.name, email: s.email, password }) }} />}

      {secret && (
        <Modal title="Contraseña temporal" onClose={() => setSecret(null)} footer={<button className="btn btn--primary" onClick={() => setSecret(null)}>Listo</button>}>
          <p>Entrega estos datos a <b>{secret.name}</b>. La contraseña sólo se muestra esta vez; pídele que la cambie al entrar, desde el ícono de llave junto a su nombre.</p>
          <div className="field"><span>Correo</span><div className="secret">{secret.email}</div></div>
          <div className="field"><span>Contraseña temporal</span><div className="secret">{secret.password}</div></div>
        </Modal>
      )}
    </div>
  )
}

function NewStaff({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Staff, password: string) => void }) {
  const { createStaff } = useStore()
  const [f, setF] = useState({ name: '', role: 'doctor' as Role, email: '', specialty: '', license: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const valid = f.name.trim().length >= 3 && /\S+@\S+\.\S+/.test(f.email) && (f.role !== 'doctor' || f.license.trim())
  return (
    <Modal title="Nuevo usuario" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        const r = await createStaff({ name: f.name.trim(), role: f.role, email: f.email.trim(), specialty: f.specialty.trim() || undefined, license: f.license.trim() || undefined })
        setBusy(false)
        if (r) onCreated(r.user, r.password)
      }}>Crear usuario</button>
    </>}>
      <label className="field"><span>Nombre completo, con título si aplica</span><input className="input" value={f.name} onChange={set('name')} placeholder="Ej. Dra. Ana López" /></label>
      <label className="field"><span>Rol</span>
        <select className="select" value={f.role} onChange={set('role')}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
      </label>
      <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: -6 }}>{ROLE_SUMMARY[f.role]}</p>
      <label className="field"><span>Correo de acceso</span><input className="input" type="email" value={f.email} onChange={set('email')} /></label>
      {f.role === 'doctor' && (
        <div className="form-grid">
          <label className="field"><span>Especialidad</span><input className="input" value={f.specialty} onChange={set('specialty')} /></label>
          <label className="field"><span>Número de colegiación</span><input className="input" value={f.license} onChange={set('license')} /></label>
        </div>
      )}
    </Modal>
  )
}
