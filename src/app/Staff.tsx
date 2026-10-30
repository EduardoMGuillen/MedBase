import { useState } from 'react'
import { Check, Minus, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Modal, PageHead } from '../components/ui'
import { CLINIC_PERMISSIONS, features, PERMISSIONS, permissionsFor, ROLE_LABEL, ROLE_SUMMARY, ROLES_BY_KIND } from '../lib/permissions'
import { AuditLog } from './Activity'
import type { Role, Staff } from '../lib/types'

type Tab = 'people' | 'roles' | 'audit'

export default function StaffPage() {
  const { staff, updateStaff, resetStaffPassword, user, settings } = useStore()
  // Un consultorio sólo tiene a su médico titular y sus asistentes
  const office = features(settings).office
  const ROLES = ROLES_BY_KIND[settings.kind ?? 'clinic']
  const assistants = staff.filter((s) => s.role === 'assistant' && s.active).length
  const full = office && assistants >= (settings.maxAssistants ?? 2)
  const [tab, setTab] = useState<Tab>('people')
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<{ name: string; email: string; password: string } | null>(null)
  const [rolesOf, setRolesOf] = useState<Staff | null>(null)

  return (
    <div className="page">
      <PageHead title={office ? 'Asistentes' : 'Personal y roles'}
        sub={office ? `Quién te ayuda en el consultorio (hasta ${settings.maxAssistants ?? 2}), qué puede hacer y quién hizo qué.` : 'Quién trabaja en la clínica, qué puede hacer cada rol y quién hizo qué.'}
        actions={<>
          <button className="btn btn--primary" disabled={full} title={full ? 'Ya tienes el máximo de asistentes activos' : undefined} onClick={() => setCreating(true)}><UserPlus size={17} />{office ? 'Agregar asistente' : 'Nuevo usuario'}</button>
        </>} />
      <div className="tabs tabs--sticky" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'people'} onClick={() => setTab('people')}>Personal</button>
        <button className="tab" role="tab" aria-selected={tab === 'roles'} onClick={() => setTab('roles')}>Permisos por rol</button>
        <button className="tab" role="tab" aria-selected={tab === 'audit'} onClick={() => setTab('audit')}>Bitácora</button>
      </div>

      {tab === 'people' && (
        <section className="panel table-wrap">
          <table className="table table--sticky">
            <thead><tr><th>Nombre</th><th>Rol</th><th>Correo</th><th>Estado</th><th /></tr></thead>
            <tbody>{staff.map((s) => (
              <tr key={s.id}>
                <td><div className="cell-person"><Avatar name={s.name} color={s.color} /><span style={{ fontWeight: 600 }}>{s.name}<small>{[s.specialty, s.license].filter(Boolean).join(', ')}</small></span></div></td>
                <td>
                  <div className="role-picks">
                    {s.id === settings.ownerId && <span className="badge badge--ink">Médico titular</span>}
                    {(s.roles ?? [s.role]).filter((r) => s.id !== settings.ownerId || r !== 'doctor').map((r) => <span key={r} className="badge">{ROLE_LABEL[r]}</span>)}
                    {(!office || s.id !== settings.ownerId) && <button className="btn btn--ghost btn--sm" aria-label={`Cambiar los roles de ${s.name}`} onClick={() => setRolesOf(s)}>Roles</button>}
                  </div>
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
          <table className="table matrix table--sticky">
            <thead><tr><th>Permiso</th>{ROLES.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>{CLINIC_PERMISSIONS.map((p) => (
              <tr key={p}>
                <td>{PERMISSIONS[p]}</td>
                {ROLES.map((r) => <td key={r}>{permissionsFor(r, settings.kind).includes(p)
                  ? <Check className="yes" size={18} aria-label="Permitido" />
                  : <Minus className="no" size={18} aria-label="Sin acceso" />}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {tab === 'audit' && <AuditLog />}

      {rolesOf && <RolesModal s={rolesOf} roles={ROLES} self={rolesOf.id === user?.id} onClose={() => setRolesOf(null)} />}
      {creating && <NewStaff roles={ROLES.filter((r) => !office || r === 'assistant')} onClose={() => setCreating(false)} onCreated={(s, password) => { setCreating(false); setSecret({ name: s.name, email: s.email, password }) }} />}

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

/**
 * AD5: una persona puede tener varios roles (por ejemplo, médico y administración). Si tiene más de uno, elige su vista
 * en Inicio. Siempre queda al menos una persona con Administración; nadie se quita a sí mismo ese rol.
 */
function RolesModal({ s, roles, self, onClose }: { s: Staff; roles: Role[]; self: boolean; onClose: () => void }) {
  const { updateStaff } = useStore()
  const [picked, setPicked] = useState<Role[]>(s.roles ?? [s.role])
  const [license, setLicense] = useState(s.license ?? '')
  const [specialty, setSpecialty] = useState(s.specialty ?? '')
  const [busy, setBusy] = useState(false)
  const was = s.roles ?? [s.role]
  const addsDoctor = picked.includes('doctor') && !was.includes('doctor')
  const lockedAdmin = self && was.includes('admin')
  const toggle = (r: Role) => setPicked(picked.includes(r) ? picked.filter((x) => x !== r) : roles.filter((x) => x === r || picked.includes(x)))
  const valid = picked.length > 0 && (!addsDoctor || license.trim().length >= 3)
  const same = picked.length === was.length && picked.every((r) => was.includes(r))
  return (
    <Modal title={`Roles de ${s.name}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || same || busy} onClick={async () => {
        setBusy(true)
        const ok = await updateStaff(s.id, { roles: picked, ...(addsDoctor ? { license: license.trim(), specialty: specialty.trim() || undefined } : {}) }, 'Roles guardados')
        setBusy(false)
        if (ok) onClose()
      }}>Guardar roles</button>
    </>}>
      <p className="muted" style={{ fontSize: 14 }}>Marca uno o varios. Con más de un rol, la persona cambia entre sus vistas desde Inicio o desde el pie del menú; sus permisos son los de la vista en la que esté.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {roles.map((r) => (
          <label key={r} className="check-line">
            <input type="checkbox" checked={picked.includes(r)} disabled={r === 'admin' && lockedAdmin} onChange={() => toggle(r)} />
            <span><b>{ROLE_LABEL[r]}</b><small>{r === 'admin' && lockedAdmin ? 'No puedes quitarte a ti mismo el rol de Administración.' : ROLE_SUMMARY[r]}</small></span>
          </label>
        ))}
      </div>
      {addsDoctor && (
        <div className="form-grid">
          <label className="field"><span>Número de colegiación</span><input className="input" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="CMH-00000" /></label>
          <label className="field"><span>Especialidad</span><input className="input" value={specialty} onChange={(e) => setSpecialty(e.target.value)} /></label>
        </div>
      )}
      {!picked.length && <p className="field__msg field__msg--error">Asigna al menos un rol.</p>}
    </Modal>
  )
}

function NewStaff({ roles, onClose, onCreated }: { roles: Role[]; onClose: () => void; onCreated: (s: Staff, password: string) => void }) {
  const { createStaff } = useStore()
  const [f, setF] = useState({ name: '', role: (roles.includes('doctor') ? 'doctor' : roles[0]) as Role, email: '', specialty: '', license: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const valid = f.name.trim().length >= 3 && /\S+@\S+\.\S+/.test(f.email) && (f.role !== 'doctor' || f.license.trim())
  return (
    <Modal title={roles.length === 1 && roles[0] === 'assistant' ? 'Nueva asistente' : 'Nuevo usuario'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        const r = await createStaff({ name: f.name.trim(), role: f.role, email: f.email.trim(), specialty: f.specialty.trim() || undefined, license: f.license.trim() || undefined })
        setBusy(false)
        if (r) onCreated(r.user, r.password)
      }}>Crear usuario</button>
    </>}>
      <label className="field"><span>Nombre completo, con título si aplica</span><input className="input" value={f.name} onChange={set('name')} placeholder="Ej. Dra. Ana López" /></label>
      {roles.length > 1 && <label className="field"><span>Rol</span>
        <select className="select" value={f.role} onChange={set('role')}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
      </label>}
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
