import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Building2, ChevronLeft, ExternalLink, Plus, UserPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Loading, Modal, PageHead } from '../components/ui'
import { date, time } from '../lib/format'
import { ROLE_LABEL, ROLE_SUMMARY } from '../lib/permissions'
import type { Clinic, ClinicRole, Staff } from '../lib/types'

const CLINIC_ROLES: ClinicRole[] = ['admin', 'doctor', 'nurse', 'reception']
const slugify = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const bookingUrl = (slug: string) => `${window.location.origin}/reservar/${slug}`

interface Secret { title: string; name: string; email: string; password: string; extra?: React.ReactNode }

/** Credenciales temporales: se muestran una sola vez. */
function SecretModal({ s, onClose }: { s: Secret; onClose: () => void }) {
  return (
    <Modal title={s.title} onClose={onClose} footer={<button className="btn btn--primary" onClick={onClose}>Listo</button>}>
      <p>Entrega estos datos a <b>{s.name}</b>. La contraseña sólo se muestra esta vez; pídele que la cambie al entrar, en <i>Mi cuenta</i>.</p>
      <div className="field"><span>Correo</span><div className="secret">{s.email}</div></div>
      <div className="field"><span>Contraseña temporal</span><div className="secret">{s.password}</div></div>
      {s.extra}
    </Modal>
  )
}

export default function Platform() {
  const { fetchClinics, fetchPlatformActivity, createClinic, demo, resetDemo, notify } = useStore()
  const [clinics, setClinics] = useState<Clinic[] | null>(null)
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof fetchPlatformActivity>>>([])
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<Secret | null>(null)
  const load = useCallback(() => {
    fetchClinics().then(setClinics).catch((e: Error) => notify(e.message, 'error'))
    fetchPlatformActivity().then(setActivity).catch(() => null)
  }, [fetchClinics, fetchPlatformActivity, notify])
  useEffect(load, [load])

  const active = (clinics ?? []).filter((c) => c.active)
  const sum = (k: 'staff' | 'patients' | 'consultations30') => active.reduce((n, c) => n + (c.stats?.[k] ?? 0), 0)

  return (
    <div className="page">
      <PageHead title="Clínicas" sub="Administración de la plataforma Clinara. Desde aquí no se ven expedientes de pacientes."
        actions={<>
          {demo && <button className="btn btn--ghost" onClick={async () => { if (confirm('Esto borra todos los cambios de todas las clínicas y vuelve a cargar la demostración.') && await resetDemo()) load() }}>Restablecer demo</button>}
          <button className="btn btn--primary" onClick={() => setCreating(true)}><Plus size={17} />Nueva clínica</button>
        </>} />

      {!clinics ? <Loading /> : (<>
        <div className="stats">
          <div className="stat"><b className="num">{active.length}</b><span>Clínicas activas</span>{clinics.length > active.length && <small style={{ color: 'var(--muted)' }}>{clinics.length - active.length} desactivadas</small>}</div>
          <div className="stat"><b className="num">{sum('staff')}</b><span>Usuarios</span></div>
          <div className="stat"><b className="num">{sum('patients')}</b><span>Pacientes registrados</span></div>
          <div className="stat"><b className="num">{sum('consultations30')}</b><span>Consultas, últimos 30 días</span></div>
        </div>

        <section className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Clínica</th><th>Estado</th><th style={{ textAlign: 'right' }}>Usuarios</th><th style={{ textAlign: 'right' }}>Pacientes</th><th style={{ textAlign: 'right' }}>Citas 30 días</th><th>Última actividad</th></tr></thead>
            <tbody>{clinics.map((c) => (
              <tr key={c.id} style={c.active ? undefined : { opacity: 0.6 }}>
                <td><div className="cell-person"><span className="clinic-ico"><Building2 size={18} /></span>
                  <Link to={`/app/clinicas/${c.id}`}>{c.name}<small>/reservar/{c.slug}</small></Link></div></td>
                <td>{c.active ? <span className="badge badge--mint">Activa</span> : <span className="badge">Desactivada</span>}</td>
                <td className="num" style={{ textAlign: 'right' }}>{c.stats?.staff ?? 0}</td>
                <td className="num" style={{ textAlign: 'right' }}>{c.stats?.patients ?? 0}</td>
                <td className="num" style={{ textAlign: 'right' }}>{c.stats?.appointments30 ?? 0}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{c.stats?.lastActivity ? `${date(c.stats.lastActivity)} ${time(c.stats.lastActivity)}` : 'Sin actividad'}</td>
              </tr>
            ))}</tbody>
          </table>
          {!clinics.length && <div className="empty">Aún no hay clínicas. Crea la primera con <b>Nueva clínica</b>.</div>}
        </section>

        <section className="panel">
          <div className="panel__head"><div><h2>Actividad de la plataforma</h2><p>Acciones de la administración de Clinara</p></div></div>
          {activity.length ? <div className="rows">{activity.slice(0, 12).map((e) => (
            <div key={e.id} className="row" style={{ gridTemplateColumns: '120px 1fr' }}>
              <span className="num" style={{ color: 'var(--muted)', fontSize: 13 }}>{date(e.at, { day: 'numeric', month: 'short' })} {time(e.at)}</span>
              <div className="row__who"><strong>{e.action}</strong><span>{e.clinicName ?? 'Plataforma'}</span></div>
            </div>
          ))}</div> : <div className="empty">Todavía no hay acciones registradas.</div>}
        </section>
      </>)}

      {creating && <NewClinic onClose={() => setCreating(false)} onCreated={(r) => {
        setCreating(false); load()
        setSecret({ title: 'Clínica creada', name: r.admin.name, email: r.admin.email, password: r.password, extra: (
          <div className="field"><span>Reserva en línea de la clínica</span><div className="secret" style={{ fontSize: 14 }}>{bookingUrl(r.clinic.slug)}</div></div>
        ) })
      }} create={createClinic} />}
      {secret && <SecretModal s={secret} onClose={() => setSecret(null)} />}
    </div>
  )
}

function NewClinic({ onClose, onCreated, create }: {
  onClose: () => void; onCreated: (r: { clinic: Clinic; admin: Staff; password: string }) => void
  create: ReturnType<typeof useStore>['createClinic']
}) {
  const [f, setF] = useState({ name: '', slug: '', address: '', phone: '', email: '', adminName: '', adminEmail: '' })
  const [slugTouched, setSlugTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value, ...(k === 'name' && !slugTouched ? { slug: slugify(e.target.value) } : {}) })
  const valid = f.name.trim().length >= 3 && /^[a-z0-9-]{3,40}$/.test(f.slug) && f.adminName.trim().length >= 3 && /\S+@\S+\.\S+/.test(f.adminEmail)
  return (
    <Modal title="Nueva clínica" wide onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        const r = await create({ name: f.name.trim(), slug: f.slug, address: f.address.trim(), phone: f.phone.trim(), email: f.email.trim(), admin: { name: f.adminName.trim(), email: f.adminEmail.trim() } })
        setBusy(false)
        if (r) onCreated(r)
      }}>Crear clínica</button>
    </>}>
      <fieldset className="fs"><legend>Clínica</legend>
        <div className="form-grid">
          <label className="field span-2"><span>Nombre</span><input className="input" value={f.name} onChange={set('name')} placeholder="Ej. Clínica Médica La Esperanza" autoFocus /></label>
          <label className="field span-2"><span>Dirección de reserva en línea</span>
            <div className="slug-input"><span>/reservar/</span><input className="input" value={f.slug} onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: slugify(e.target.value) || e.target.value.toLowerCase() }) }} /></div></label>
          <label className="field span-2"><span>Dirección</span><input className="input" value={f.address} onChange={set('address')} /></label>
          <label className="field"><span>Teléfono</span><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
          <label className="field"><span>Correo (opcional)</span><input className="input" type="email" value={f.email} onChange={set('email')} /></label>
        </div>
      </fieldset>
      <fieldset className="fs"><legend>Quién la administrará</legend>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: -4 }}>Esta persona podrá crear médicos, enfermería y recepción de su clínica. Recibirás una contraseña temporal para entregársela.</p>
        <div className="form-grid">
          <label className="field"><span>Nombre completo</span><input className="input" value={f.adminName} onChange={set('adminName')} /></label>
          <label className="field"><span>Correo de acceso</span><input className="input" type="email" value={f.adminEmail} onChange={set('adminEmail')} /></label>
        </div>
      </fieldset>
    </Modal>
  )
}

export function ClinicDetail() {
  const { id } = useParams()
  const { fetchClinics, fetchClinicStaff, updateClinic, createClinicStaff, updatePlatformStaff, resetPlatformStaffPassword, notify } = useStore()
  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [staff, setStaff] = useState<Staff[] | null>(null)
  const [f, setF] = useState<Partial<Clinic>>({})
  const [adding, setAdding] = useState(false)
  const [secret, setSecret] = useState<Secret | null>(null)
  const load = useCallback(() => {
    if (!id) return
    fetchClinics().then((cs) => { const c = cs.find((x) => x.id === id) ?? null; setClinic(c); if (c) setF(c) }).catch((e: Error) => notify(e.message, 'error'))
    fetchClinicStaff(id).then(setStaff).catch((e: Error) => notify(e.message, 'error'))
  }, [id, fetchClinics, fetchClinicStaff, notify])
  useEffect(load, [load])
  if (!clinic) return <Loading />
  const dirty = (['name', 'slug', 'address', 'phone', 'email', 'currency'] as const).some((k) => f[k] !== clinic[k])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/app" className="back-link"><ChevronLeft size={15} />Clínicas</Link>
          <h1>{clinic.name}</h1>
          <p>{clinic.active ? <span className="badge badge--mint">Activa</span> : <span className="badge">Desactivada</span>} Creada el {date(clinic.createdAt)}</p>
        </div>
        <div className="page-head__actions">
          <a className="btn btn--ghost" href={`/reservar/${clinic.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={16} />Reserva en línea</a>
          {clinic.active
            ? <button className="btn btn--danger" onClick={async () => {
              if (confirm(`Al desactivar ${clinic.name}, su personal no podrá entrar y la reserva en línea dejará de funcionar. Los datos se conservan.`) && await updateClinic(clinic.id, { active: false }, 'Clínica desactivada')) load()
            }}>Desactivar clínica</button>
            : <button className="btn btn--primary" onClick={async () => { if (await updateClinic(clinic.id, { active: true }, 'Clínica reactivada')) load() }}>Reactivar clínica</button>}
        </div>
      </div>

      <div className="stats">
        <div className="stat"><b className="num">{clinic.stats?.staff ?? 0}</b><span>Usuarios</span></div>
        <div className="stat"><b className="num">{clinic.stats?.patients ?? 0}</b><span>Pacientes</span></div>
        <div className="stat"><b className="num">{clinic.stats?.appointments30 ?? 0}</b><span>Citas, 30 días</span></div>
        <div className="stat"><b className="num">{clinic.stats?.consultations30 ?? 0}</b><span>Consultas, 30 días</span></div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(340px, 1fr)' }}>
        <section className="panel table-wrap">
          <div className="panel__head"><h2>Personal</h2><button className="btn btn--primary btn--sm" onClick={() => setAdding(true)}><UserPlus size={15} />Nuevo usuario</button></div>
          {!staff ? <Loading /> : (
            <table className="table">
              <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th /></tr></thead>
              <tbody>{staff.map((s) => (
                <tr key={s.id} style={s.active ? undefined : { opacity: 0.6 }}>
                  <td><div className="cell-person"><Avatar name={s.name} color={s.color} /><span style={{ fontWeight: 600 }}>{s.name}<small>{s.email}</small></span></div></td>
                  <td>
                    <select className="select" style={{ height: 34, width: 'auto' }} value={s.role} aria-label={`Rol de ${s.name}`}
                      onChange={async (e) => { if (await updatePlatformStaff(s.id, { role: e.target.value as ClinicRole })) load() }}>
                      {CLINIC_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{s.active ? <span className="badge badge--mint">Activo</span> : <span className="badge">Desactivado</span>}
                    {s.twoFactor && <span className="badge badge--ink">Dos pasos</span>}</div></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn--ghost btn--sm" onClick={async () => {
                      if (!confirm(`Se generará una contraseña temporal para ${s.name} y se cerrarán sus sesiones.`)) return
                      const r = await resetPlatformStaffPassword(s.id)
                      if (r) setSecret({ title: 'Contraseña temporal', name: s.name, email: s.email, password: r.password })
                    }}>Restablecer contraseña</button>{' '}
                    {s.twoFactor && <><button className="btn btn--ghost btn--sm" onClick={async () => { if (await updatePlatformStaff(s.id, { twoFactor: false })) load() }}>Quitar dos pasos</button>{' '}</>}
                    <button className="btn btn--ghost btn--sm" onClick={async () => { if (await updatePlatformStaff(s.id, { active: !s.active })) load() }}>{s.active ? 'Desactivar' : 'Reactivar'}</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {staff && !staff.length && <div className="empty">Esta clínica aún no tiene usuarios.</div>}
        </section>

        <section className="panel">
          <div className="panel__head"><h2>Datos de la clínica</h2></div>
          <div className="panel__body" style={{ display: 'grid', gap: 12 }}>
            <label className="field"><span>Nombre</span><input className="input" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="field"><span>Dirección de reserva en línea</span>
              <div className="slug-input"><span>/reservar/</span><input className="input" value={f.slug ?? ''} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) || e.target.value.toLowerCase() })} /></div></label>
            <label className="field"><span>Dirección</span><input className="input" value={f.address ?? ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
            <div className="form-grid">
              <label className="field"><span>Teléfono</span><input className="input" value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
              <label className="field"><span>Moneda</span><input className="input" maxLength={4} value={f.currency ?? ''} onChange={(e) => setF({ ...f, currency: e.target.value })} /></label>
            </div>
            <label className="field"><span>Correo</span><input className="input" type="email" value={f.email ?? ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" disabled={!dirty} onClick={async () => {
                if (await updateClinic(clinic.id, { name: f.name, slug: f.slug, address: f.address, phone: f.phone, email: f.email, currency: f.currency })) load()
              }}>Guardar cambios</button>
              {dirty && <button className="btn btn--ghost" onClick={() => setF(clinic)}>Descartar</button>}
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Precios, horarios y la plantilla de recordatorios los ajusta la administración de la clínica en su Configuración.</p>
          </div>
        </section>
      </div>

      {adding && <NewMember clinicName={clinic.name} onClose={() => setAdding(false)} onCreate={async (m) => {
        const r = await createClinicStaff(clinic.id, m)
        if (r) { setAdding(false); load(); setSecret({ title: 'Usuario creado', name: r.user.name, email: r.user.email, password: r.password }) }
      }} />}
      {secret && <SecretModal s={secret} onClose={() => setSecret(null)} />}
    </div>
  )
}

function NewMember({ clinicName, onClose, onCreate }: { clinicName: string; onClose: () => void; onCreate: (m: { name: string; role: ClinicRole; email: string; specialty?: string; license?: string }) => Promise<void> }) {
  const [f, setF] = useState({ name: '', role: 'doctor' as ClinicRole, email: '', specialty: '', license: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const valid = f.name.trim().length >= 3 && /\S+@\S+\.\S+/.test(f.email) && (f.role !== 'doctor' || f.license.trim())
  return (
    <Modal title={`Nuevo usuario en ${clinicName}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!valid || busy} onClick={async () => {
        setBusy(true)
        await onCreate({ name: f.name.trim(), role: f.role, email: f.email.trim(), specialty: f.specialty.trim() || undefined, license: f.license.trim() || undefined })
        setBusy(false)
      }}>Crear usuario</button>
    </>}>
      <label className="field"><span>Nombre completo, con título si aplica</span><input className="input" value={f.name} onChange={set('name')} placeholder="Ej. Dra. Ana López" autoFocus /></label>
      <label className="field"><span>Rol</span><select className="select" value={f.role} onChange={set('role')}>{CLINIC_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
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
