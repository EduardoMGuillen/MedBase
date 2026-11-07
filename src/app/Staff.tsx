import { DEPT_POSITIONS } from '../lib/clinicalConfig'
import { positionFor, type DeptKey } from '../lib/positions'
import { useState } from 'react'
import { normalize } from '../lib/patients'
import { Check, Minus, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Modal, PageHead } from '../components/ui'
import { CLINIC_PERMISSIONS, features, PERMISSIONS, permissionsFor, ROLE_LABEL, ROLE_SUMMARY, ROLES_BY_KIND } from '../lib/permissions'
import { AuditLog } from './Activity'
import { Pagination, paginate, usePage } from '../components/Pagination'
import type { Role, Staff } from '../lib/types'
import { TabRow } from '../components/TabRow'
import { TopScrollbar } from '../components/TopScrollbar'

type Tab = 'people' | 'roles' | 'audit'

export default function StaffPage() {
  const { staff, updateStaff, resetStaffPassword, user, settings } = useStore()
  // Un consultorio sólo tiene a su médico titular y sus asistentes
  const office = features(settings).office
  const ROLES = ROLES_BY_KIND[settings.kind ?? 'clinic']
  const [tab, setTab] = useState<Tab>('people')
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<{ name: string; email: string; password: string } | null>(null)
  const [rolesOf, setRolesOf] = useState<Staff | null>(null)
  // GE5 (ronda 10): el personal por páginas (la página en la dirección)
  // Ronda 17: filtros del personal (buscar, rol, estado); la página vuelve a 1 al cambiarlos
  const [q, setQ] = useState('')
  const [roleF, setRoleF] = useState<Role | ''>('')
  const [stateF, setStateF] = useState<'' | 'active' | 'inactive' | 'twofactor'>('')
  const nq = normalize(q)
  const shown = staff.filter((s) => (!nq || normalize([s.name, s.email, s.specialty, s.license].filter(Boolean).join(' ')).includes(nq))
    && (!roleF || (s.roles ?? [s.role]).includes(roleF))
    && (!stateF || (stateF === 'active' ? s.active : stateF === 'inactive' ? !s.active : !!s.twoFactor)))
  const filtered = !!(nq || roleF || stateF)
  const [staffPageNo, setStaffPage] = usePage(`${tab}|${nq}|${roleF}|${stateF}`)
  const staffPage = paginate(shown, staffPageNo)

  return (
    <div className="page">
      <PageHead title="Personal y roles"
        sub={office ? `Quién te ayuda en el consultorio: asistentes (hasta ${settings.maxAssistants ?? 2}) y enfermería; qué puede hacer cada rol y quién hizo qué.` : 'Quién trabaja en la clínica, qué puede hacer cada rol y quién hizo qué.'}
        actions={<>
          <button className="btn btn--primary" onClick={() => setCreating(true)}><UserPlus size={17} />{office ? 'Agregar personal' : 'Nuevo usuario'}</button>
        </>} />
      <TabRow className="tabs--sticky">
        <button className="tab" role="tab" data-tour="tab:personal" aria-selected={tab === 'people'} onClick={() => setTab('people')}>Personal</button>
        <button className="tab" role="tab" data-tour="tab:permisos" aria-selected={tab === 'roles'} onClick={() => setTab('roles')}>Permisos por rol</button>
        <button className="tab" role="tab" data-tour="tab:bitacora" aria-selected={tab === 'audit'} onClick={() => setTab('audit')}>Bitácora</button>
      </TabRow>

      {tab === 'people' && (
        // UI1 (ronda 17): sin encabezado fijo (dentro del recuadro con desplazamiento a lo ancho quedaba corrido hacia abajo,
        // tapaba las primeras filas y dejaba una barra blanca arriba). La tabla crece con la página; a 720 px o menos, tarjetas.
        <section className="panel staff-list">
          <div className="panel__body staff-filters">
            <label className="field staff-filters__q"><span>Buscar</span>
              <input className="input" type="search" data-nocap value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, correo, especialidad o colegiación" /></label>
            <label className="field"><span>Rol</span>
              <select className="select" value={roleF} onChange={(e) => setRoleF(e.target.value as Role | '')}>
                <option value="">Todos los roles</option>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select></label>
            <label className="field"><span>Estado</span>
              <select className="select" value={stateF} onChange={(e) => setStateF(e.target.value as typeof stateF)}>
                <option value="">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Desactivados</option>
                <option value="twofactor">Con verificación en dos pasos</option>
              </select></label>
            <p className="muted staff-filters__count" aria-live="polite">{filtered ? `${shown.length} de ${staff.length} personas` : `${staff.length} personas`}
              {filtered && <> · <button type="button" className="linklike" onClick={() => { setQ(''); setRoleF(''); setStateF('') }}>Quitar filtros</button></>}</p>
          </div>
          {shown.length === 0 ? <p className="empty">Nadie coincide con los filtros.</p> : <div className="table-wrap">
          <table className="table table--cards staff-table">
            <thead><tr><th>Nombre</th><th>Rol</th><th>Correo</th><th>Estado</th><th /></tr></thead>
            <tbody>{staffPage.rows.map((s) => (
              <tr key={s.id}>
                <td className="tc-full staff-table__name"><div className="cell-person"><Avatar name={s.name} color={s.color} /><span style={{ fontWeight: 600 }}>{s.name}<small>{[s.specialty, s.license].filter(Boolean).join(', ')}</small></span></div></td>
                <td data-label="Rol" className="tc-full">
                  <div className="role-picks">
                    {s.id === settings.ownerId && <span className="badge badge--ink">Médico titular</span>}
                    {(s.roles ?? [s.role]).filter((r) => s.id !== settings.ownerId || r !== 'doctor').map((r) => <span key={r} className="badge">{ROLE_LABEL[r]}{positionFor(s, r) ? ` · ${positionFor(s, r)!.label}` : ''}</span>)}
                    {(!office || s.id !== settings.ownerId) && <button className="btn btn--ghost btn--sm" aria-label={`Cambiar los roles de ${s.name}`} onClick={() => setRolesOf(s)}>Roles</button>}
                  </div>
                </td>
                <td data-label="Correo" className="staff-table__mail">{s.email}</td>
                <td data-label="Estado"><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{s.active ? <span className="badge badge--mint">Activo</span> : <span className="badge">Desactivado</span>}
                  {s.twoFactor && <span className="badge badge--ink">Dos pasos</span>}</div></td>
                <td className="tc-actions staff-table__actions">
                  {s.id !== user?.id && <div className="staff-actions">
                    <button className="btn btn--ghost btn--sm" onClick={async () => {
                      if (!confirm(`Se generará una contraseña temporal para ${s.name} y se cerrarán sus sesiones abiertas.`)) return
                      const r = await resetStaffPassword(s.id)
                      if (r) setSecret({ name: s.name, email: s.email, password: r.password })
                    }}>Restablecer contraseña</button>
                    {s.twoFactor && <button className="btn btn--ghost btn--sm" title="Por si perdió su teléfono" onClick={() => {
                      if (confirm(`¿Quitar la verificación en dos pasos de ${s.name}? Podrá entrar sólo con su contraseña hasta que la vuelva a activar.`)) updateStaff(s.id, { twoFactor: false })
                    }}>Quitar dos pasos</button>}
                    <button className="btn btn--ghost btn--sm" onClick={() => updateStaff(s.id, { active: !s.active })}>{s.active ? 'Desactivar' : 'Reactivar'}</button>
                  </div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
          </div>}
          <Pagination {...staffPage} onPage={setStaffPage} label="Páginas del personal" />
        </section>
      )}

      {tab === 'roles' && (
        // UI1 (ronda 17): la matriz crece con la página (sin alto fijo); si no cabe a lo ancho se desplaza con una barra
        // también arriba (TopScrollbar) y la columna «Permiso» queda fija a la izquierda.
        <section className="panel staff-matrix">
          <TopScrollbar>{(ref) => <div className="table-wrap" ref={ref as React.RefObject<HTMLDivElement>}>
          <table className="table matrix">
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
          </div>}</TopScrollbar>
        </section>
      )}

      {tab === 'audit' && <AuditLog />}

      {rolesOf && <RolesModal s={rolesOf} roles={ROLES.filter((r) => !office || r !== 'doctor')} self={rolesOf.id === user?.id} onClose={() => setRolesOf(null)} />}
      {creating && <NewStaff roles={ROLES.filter((r) => !office || r === 'assistant' || r === 'nurse')} onClose={() => setCreating(false)} onCreated={(s, password) => { setCreating(false); setSecret({ name: s.name, email: s.email, password }) }} />}

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
  // DP1 (ronda 11): cargo dentro de Laboratorio o Imágenes. EN1 (ronda 16): o el puesto en Enfermería
  const [position, setPosition] = useState(s.position ?? '')
  const [busy, setBusy] = useState(false)
  const was = s.roles ?? [s.role]
  const addsDoctor = picked.includes('doctor') && !was.includes('doctor')
  const lockedAdmin = self && was.includes('admin')
  // Laboratorio e Imágenes no van juntos: una persona trabaja en un solo departamento
  const toggle = (r: Role) => setPicked(picked.includes(r) ? picked.filter((x) => x !== r) : roles.filter((x) => x === r || (picked.includes(x) && !(isDept(r) && isDept(x)))))
  const dept = deptOf(picked)
  const deptOk = !dept || positionValid(dept, position, license)
  const valid = picked.length > 0 && (!addsDoctor || license.trim().length >= 3) && deptOk
  const same = picked.length === was.length && picked.every((r) => was.includes(r)) && (position || '') === (s.position ?? '') && license === (s.license ?? '')
  return (
    <Modal title={`Roles de ${s.name}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || same || busy} onClick={async () => {
        setBusy(true)
        const ok = await updateStaff(s.id, { roles: picked, ...(addsDoctor ? { license: license.trim(), specialty: specialty.trim() || undefined } : {}),
          ...(dept ? { position, ...(dept !== 'nursing' ? { license: license.trim() || undefined } : {}) } : s.position ? { position: null } : {}) }, 'Roles guardados')
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
      {dept && <PositionFields dept={dept} position={position} license={license} onPosition={setPosition} onLicense={setLicense} />}
      {!picked.length && <p className="field__msg field__msg--error">Asigna al menos un rol.</p>}
    </Modal>
  )
}

function NewStaff({ roles, onClose, onCreated }: { roles: Role[]; onClose: () => void; onCreated: (s: Staff, password: string) => void }) {
  const { createStaff } = useStore()
  const [f, setF] = useState({ name: '', role: (roles.includes('doctor') ? 'doctor' : roles[0]) as Role, email: '', specialty: '', license: '', position: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const newDept = deptOf([f.role])
  const valid = f.name.trim().length >= 3 && /\S+@\S+\.\S+/.test(f.email) && (f.role !== 'doctor' || f.license.trim()) && (!newDept || positionValid(newDept, f.position, f.license))
  return (
    <Modal title={roles.length === 1 && roles[0] === 'assistant' ? 'Nueva asistente' : 'Nuevo usuario'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        const r = await createStaff({ name: f.name.trim(), role: f.role, email: f.email.trim(), specialty: f.specialty.trim() || undefined, license: f.license.trim() || undefined, ...(newDept ? { position: f.position } : {}) })
        setBusy(false)
        if (r) onCreated(r.user, r.password)
      }}>Crear usuario</button>
    </>}>
      <label className="field"><span>Nombre completo, con título si aplica</span><input className="input" value={f.name} onChange={set('name')} placeholder="Ej. Dra. Isabel Pacheco" /></label>
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
      {newDept && <PositionFields dept={newDept} position={f.position} license={f.license} onPosition={(v) => setF({ ...f, position: v })} onLicense={(v) => setF({ ...f, license: v })} />}
    </Modal>
  )
}

const isDept = (r: Role) => r === 'lab' || r === 'imaging'
/** El departamento cuyo cargo se pide: Laboratorio o Imágenes; si no, Enfermería (EN1, ronda 16: Licenciado(a) o Auxiliar). */
const deptOf = (roles: Role[]): DeptKey | undefined => (roles.find(isDept) as 'lab' | 'imaging' | undefined) ?? (roles.includes('nurse') ? 'nursing' : undefined)
const positionsOf = (dept: DeptKey): readonly { key: string; label: string; license: boolean; licenseBody: string }[] => DEPT_POSITIONS[dept]
function positionValid(dept: DeptKey, position: string, license: string) {
  const pos = positionsOf(dept).find((x) => x.key === position)
  return !!pos && (!pos.license || license.trim().length >= 2)
}

/**
 * DP1 (ronda 11): «Cargo» (obligatorio) y, para Microbiólogo o Radiólogo, «N.º de colegiación» (obligatorio). El mismo diseño
 * de PE1: un rol con cargos.
 */
function PositionFields({ dept, position, license, onPosition, onLicense }: { dept: DeptKey; position: string; license: string; onPosition: (v: string) => void; onLicense: (v: string) => void }) {
  const pos = positionsOf(dept).find((x) => x.key === position)
  // EN1 (ronda 16): en enfermería se llama «Puesto»
  const word = dept === 'nursing' ? 'puesto' : 'cargo'
  return (
    <div className="form-grid">
      <label className="field"><span>{dept === 'nursing' ? 'Puesto en enfermería' : 'Cargo'}</span>
        <select className="select" value={position} onChange={(e) => onPosition(e.target.value)} aria-required="true">
          <option value="">Elige el {word}</option>{positionsOf(dept).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
        {!pos && <small className="field__msg field__msg--warn">El {word} es obligatorio.</small>}
        {dept === 'nursing' && <small className="muted">La licenciada edita el rol de turnos de enfermería; la auxiliar lo ve.</small>}</label>
      {pos?.license && <label className="field"><span>N.º de colegiación</span><input className="input" value={license} onChange={(e) => onLicense(e.target.value)} aria-required="true" />
        <small className="muted">{pos.licenseBody}</small></label>}
    </div>
  )
}
