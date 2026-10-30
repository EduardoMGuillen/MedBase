import { useState } from 'react'
import { Download, Plus, Upload } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Modal, PageHead } from '../components/ui'
import { DrugForm } from '../components/DrugForm'
import { drugProvider } from '../lib/drugProvider'
import { normalize } from '../lib/patients'
import { download, parseCsv, toCsv } from '../lib/csv'
import { CriticalThresholds } from './CriticalThresholds'
import { clinicWhatsapp, contactLine, date, fillTemplate, fullName, METHOD_LABEL, money } from '../lib/format'
import { ContactsEditor } from '../components/Contacts'
import type { Bed, ClinicDrug, ClinicSettings, PaymentMethod, Service, Staff } from '../lib/types'
import { ScheduleEditor } from './ScheduleEditor'
import { Roster } from './Roster'
import { features, hasRole } from '../lib/permissions'

type Tab = 'clinic' | 'services' | 'payments' | 'areas' | 'schedules' | 'roster' | 'beds' | 'drugs'

export default function Settings() {
  const [tab, setTab] = useState<Tab>('clinic')
  const { settings } = useStore()
  const f = features(settings)
  return (
    <div className="page">
      <PageHead title="Configuración" sub={f.office ? 'Datos que aparecen en tus recetas y recibos, precios, tu horario y lo que usa tu consultorio.' : 'Datos que aparecen en recetas y recibos, precios, horarios de atención y camas.'} />
      <div className="tabs tabs--sticky" role="tablist">
        <button className="tab" role="tab" data-tour="tab:clinica" aria-selected={tab === 'clinic'} onClick={() => setTab('clinic')}>{f.office ? 'Consultorio' : 'Clínica'}</button>
        <button className="tab" role="tab" data-tour="tab:servicios" aria-selected={tab === 'services'} onClick={() => setTab('services')}>Servicios y precios</button>
        <button className="tab" role="tab" data-tour="tab:pagos" aria-selected={tab === 'payments'} onClick={() => setTab('payments')}>Formas de pago</button>
        <button className="tab" role="tab" data-tour="tab:areas" aria-selected={tab === 'areas'} onClick={() => setTab('areas')}>Áreas de servicio</button>
        <button className="tab" role="tab" data-tour="tab:horarios" aria-selected={tab === 'schedules'} onClick={() => setTab('schedules')}>{f.office ? 'Mi horario' : 'Horarios de médicos'}</button>
        {/* AD3 (ronda 5): qué médico trabaja cada día; un consultorio tiene un solo médico */}
        {!f.office && <button className="tab" role="tab" data-tour="tab:turnos" aria-selected={tab === 'roster'} onClick={() => setTab('roster')}>Rol de turnos</button>}
        {f.hospital && <button className="tab" role="tab" data-tour="tab:camas" aria-selected={tab === 'beds'} onClick={() => setTab('beds')}>Camas</button>}
        <button className="tab" role="tab" data-tour="tab:vademecum" aria-selected={tab === 'drugs'} onClick={() => setTab('drugs')}>Vademécum</button>
      </div>
      {tab === 'clinic' && <ClinicForm />}
      {tab === 'services' && <Services />}
      {tab === 'payments' && <PaymentMethods />}
      {tab === 'areas' && <ServiceAreas />}
      {tab === 'schedules' && <Schedules />}
      {tab === 'roster' && !f.office && <Roster />}
      {tab === 'beds' && f.hospital && <Beds />}
      {tab === 'drugs' && <ClinicDrugs />}
    </div>
  )
}

const IMPORT_COLUMNS = ['nombre_generico', 'nombre_comercial', 'presentacion', 'concentracion', 'via', 'dosis_habitual', 'indicaciones'] as const
const IMPORT_FIELDS: Record<(typeof IMPORT_COLUMNS)[number], string> = {
  nombre_generico: 'name', nombre_comercial: 'brand', presentacion: 'presentation', concentracion: 'concentration', via: 'route', dosis_habitual: 'usualDose', indicaciones: 'usualUse',
}

/**
 * AD4: el vademécum completo de la clínica (el catálogo base y lo que agregó la clínica), con buscador. Lo agregado se
 * edita (quien lo agregó o administración) y se desactiva; el catálogo base no se edita. Se puede importar una lista.
 */
function ClinicDrugs() {
  const { clinicDrugs = [], staffById, user, can, importClinicDrugs } = useStore()
  const [editing, setEditing] = useState<ClinicDrug | null>(null)
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [onlyClinic, setOnlyClinic] = useState(false)
  const [result, setResult] = useState<{ added: number; skipped: { row: number; name: string; reason: string }[] } | null>(null)
  const n = normalize(q)
  // El catálogo base viene del proveedor (AD4), sin los de la clínica: esos se listan aparte, con sus acciones
  const DRUGS = drugProvider.catalog([])
  const added = clinicDrugs.filter((d) => !n || normalize(`${d.name} ${d.brand ?? ''} ${d.presentation ?? ''}`).includes(n))
  const base = onlyClinic ? [] : DRUGS.filter((d) => !n || normalize(`${d.name} ${d.presentation}`).includes(n))
  const canEdit = (d: ClinicDrug) => can('drugs.manage') || d.createdBy === user?.id
  const importFile = async (file: File) => {
    const rows = parseCsv(await file.text())
    if (rows.length < 2) return setResult({ added: 0, skipped: [{ row: 1, name: '', reason: 'El archivo no tiene filas debajo del encabezado.' }] })
    const head = rows[0].map((h) => normalize(h).replace(/\s+/g, '_'))
    const idx = (c: string) => head.indexOf(c)
    if (idx('nombre_generico') < 0) return setResult({ added: 0, skipped: [{ row: 1, name: '', reason: 'Falta la columna nombre_generico. Usa la plantilla.' }] })
    const list = rows.slice(1).map((r) => Object.fromEntries(IMPORT_COLUMNS.filter((c) => idx(c) >= 0 && r[idx(c)]?.trim()).map((c) => [IMPORT_FIELDS[c], r[idx(c)].trim()])))
    const r = await importClinicDrugs(list)
    if (r) setResult(r)
  }
  return (
    <section className="panel table-wrap">
      <div className="panel__head"><div><h2>Vademécum</h2><p>{DRUGS.length} del catálogo base y {clinicDrugs.filter((d) => d.active).length} agregados por la clínica. Un medicamento desactivado ya no se ofrece al recetar.</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn--ghost btn--sm" onClick={() => download('plantilla-vademecum.csv', toCsv([[...IMPORT_COLUMNS], ['Ademetionina', 'Heptral', 'Tabletas', '400 mg', 'Oral', '1 tableta cada 12 horas', 'Colestasis intrahepática']]))}>
            <Download size={15} />Plantilla</button>
          <label className="btn btn--ghost btn--sm"><Upload size={15} />Importar CSV
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f) }} /></label>
          <button className="btn btn--primary btn--sm" onClick={() => setAdding(true)}><Plus size={15} />Agregar medicamento</button>
        </div></div>
      <div className="panel__body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 0 }}>
        <input className="input" style={{ maxWidth: 360 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre genérico, comercial o presentación" aria-label="Buscar medicamento" />
        <label className="check-inline"><input type="checkbox" checked={onlyClinic} onChange={(e) => setOnlyClinic(e.target.checked)} />Sólo agregados por la clínica</label>
      </div>
      {result && (
        <div className={`alert-strip ${result.added ? 'alert-strip--calm' : 'alert-strip--amber'}`} style={{ margin: '12px 22px 0', flexDirection: 'column', alignItems: 'stretch' }}>
          <span>Se importaron {result.added} medicamento(s).{result.skipped.length ? ` ${result.skipped.length} fila(s) no se importaron:` : ''}</span>
          {result.skipped.length > 0 && <ul className="note__list" style={{ margin: 0, fontWeight: 400 }}>{result.skipped.slice(0, 8).map((x) => <li key={x.row}>Fila {x.row}{x.name ? ` (${x.name})` : ''}: {x.reason}</li>)}</ul>}
          <button className="linklike" style={{ alignSelf: 'flex-start' }} onClick={() => setResult(null)}>Cerrar</button>
        </div>
      )}
      <table className="table table--sticky">
        <thead><tr><th>Nombre genérico</th><th>Comercial</th><th>Presentación</th><th>Vía</th><th>Origen</th><th /></tr></thead>
        <tbody>
          {added.map((d) => (
            <tr key={d.id} style={d.active ? undefined : { opacity: 0.55 }}>
              <td><b>{d.name}</b>{d.usualUse && <small className="muted" style={{ display: 'block' }}>{d.usualUse}</small>}</td><td>{d.brand ?? '—'}</td>
              <td>{[d.presentation, d.concentration].filter(Boolean).join(' ') || '—'}</td><td>{d.route ?? '—'}</td>
              <td>Agregado por {staffById(d.createdBy)?.name ?? 'la clínica'}<br /><small className="muted">{date(d.createdAt)}{d.active ? '' : ' · desactivado'}</small></td>
              <td style={{ textAlign: 'right' }}>{canEdit(d) && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(d)}>Editar</button>}</td>
            </tr>
          ))}
          {base.slice(0, n ? 200 : 60).map((d) => (
            <tr key={`${d.name}|${d.presentation}`}>
              <td><b>{d.name}</b></td><td>{d.brand ?? '—'}</td><td>{d.presentation}</td><td>{d.usual?.route ?? '—'}</td><td className="muted">Catálogo base</td><td />
            </tr>
          ))}
        </tbody>
      </table>
      {!n && !onlyClinic && base.length > 60 && <p className="muted" style={{ padding: '10px 22px', fontSize: 13.5 }}>Mostrando 60 del catálogo base. Escribe para buscar.</p>}
      {!added.length && !base.length && <div className="empty">{onlyClinic ? 'La clínica todavía no ha agregado medicamentos.' : 'Ningún medicamento coincide.'}</div>}
      {editing && <DrugForm drug={editing} onClose={() => setEditing(null)} />}
      {adding && <DrugForm onClose={() => setAdding(false)} />}
    </section>
  )
}

/**
 * Camas (AD3): sin especialidad fija. El estado sale solo de los pacientes hospitalizados (Libre u Ocupada, con el
 * paciente y la especialidad de su ingreso); "Fuera de servicio" es lo único que se marca a mano (mantenimiento).
 */
function Beds() {
  const { beds, bedStays = [], patient, createBed, updateBed } = useStore()
  const [room, setRoom] = useState('')
  const [label, setLabel] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const sorted = [...beds].sort((a, b) => a.room.localeCompare(b.room, 'es', { numeric: true }) || a.label.localeCompare(b.label))
  const stayIn = (id: string) => bedStays.find((h) => h.bedId === id)
  const counts = { free: sorted.filter((b) => b.active && !stayIn(b.id)).length, busy: sorted.filter((b) => stayIn(b.id)).length, off: sorted.filter((b) => !b.active).length }
  return (
    <section className="panel table-wrap">
      <div className="panel__head"><div><h2>Camas</h2><p>{counts.free} libres · {counts.busy} ocupadas{counts.off ? ` · ${counts.off} fuera de servicio` : ''}. Se ocupan al ingresar a un paciente y se liberan al darle de alta o trasladarlo.</p></div></div>
      <table className="table table--sticky">
        <thead><tr><th>Cuarto</th><th>Cama</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {sorted.map((b) => {
            const h = stayIn(b.id)
            const p = h && patient(h.patientId)
            return (
              <tr key={b.id} style={b.active ? undefined : { opacity: 0.7 }}>
                {editing === b.id ? <BedRename b={b} onDone={() => setEditing(null)} /> : <><td className="num">{b.room}</td><td>{b.label || '—'}</td></>}
                <td>{!b.active ? <><span className="badge badge--amber">Fuera de servicio</span>{b.outOfServiceNote && <small className="muted" style={{ display: 'block' }}>{b.outOfServiceNote}</small>}</>
                  : h ? <><span className="badge badge--ink">Ocupada</span> <span style={{ fontSize: 14 }}>{p ? fullName(p) : 'Paciente'}{h.specialty ? ` · ${h.specialty}` : ''}</span></>
                    : <span className="badge badge--mint">Libre</span>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {editing !== b.id && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(b.id)}>Renombrar</button>}{' '}
                  {b.active
                    ? <button className="btn btn--ghost btn--sm" disabled={!!h} title={h ? 'Tiene un paciente: dale de alta o trasládalo primero' : undefined} onClick={() => {
                      const note = prompt('Motivo (por ejemplo, mantenimiento):', 'Mantenimiento')
                      if (note !== null) updateBed(b.id, { active: false, outOfServiceNote: note.trim() || undefined }, 'Cama fuera de servicio')
                    }}>Fuera de servicio</button>
                    : <button className="btn btn--soft btn--sm" onClick={() => updateBed(b.id, { active: true }, 'Cama en servicio')}>Volver a servicio</button>}
                </td>
              </tr>
            )
          })}
          <tr>
            <td><input className="input" placeholder="Ej. 106" value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Cuarto" /></td>
            <td><input className="input" placeholder="Opcional, ej. A" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Cama" /></td>
            <td />
            <td style={{ textAlign: 'right' }}><button className="btn btn--soft btn--sm" disabled={!room.trim()} onClick={async () => {
              if (await createBed({ room: room.trim(), label: label.trim(), active: true })) { setRoom(''); setLabel('') }
            }}><Plus size={14} />Agregar cama</button></td>
          </tr>
        </tbody>
      </table>
      {!beds.length && <div className="empty">Agrega las camas de la clínica con su número de cuarto.</div>}
    </section>
  )
}

function BedRename({ b, onDone }: { b: Bed; onDone: () => void }) {
  const { updateBed } = useStore()
  const [room, setRoom] = useState(b.room)
  const [label, setLabel] = useState(b.label)
  const save = async () => { if (room.trim() && (room !== b.room || label !== b.label)) { if (!(await updateBed(b.id, { room: room.trim(), label: label.trim() }, 'Cama renombrada'))) return } onDone() }
  return (<>
    <td><input className="input" value={room} autoFocus onChange={(e) => setRoom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone() }} aria-label="Cuarto" /></td>
    <td><div style={{ display: 'flex', gap: 6 }}><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone() }} aria-label="Cama" />
      <button className="btn btn--primary btn--sm" onClick={save}>Guardar</button></div></td>
  </>)
}

/** Reduce el logo a 240 px de alto como máximo para que no pese en cada carga. */
function shrinkLogo(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 240 / img.height, 480 / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    img.src = URL.createObjectURL(file)
  })
}

function ClinicForm() {
  const { settings, saveSettings } = useStore()
  const [f, setF] = useState<ClinicSettings>(settings)
  const [busy, setBusy] = useState(false)
  const [converting, setConverting] = useState(false)
  const office = features(settings).office
  const set = <K extends keyof ClinicSettings>(k: K, v: ClinicSettings[K]) => setF({ ...f, [k]: v })
  const preview = fillTemplate(f.reminderTemplate, {
    paciente: 'María José', clinica: f.name, medico: 'Dra. Lucía Herrera', fecha: 'martes 20 de octubre', hora: '09:30', telefono: clinicWhatsapp(f),
  })
  const dirty = JSON.stringify(f) !== JSON.stringify(settings)
  return (
    <div className="grid-2">
      <section className="panel">
        <div className="panel__head"><h2>{office ? 'Datos del consultorio' : 'Datos de la clínica'}</h2></div>
        <div className="panel__body form-grid">
          <label className="field span-2"><span>Nombre</span><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="field span-2"><span>Dirección</span><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
          <div className="field span-2"><span>Teléfonos y WhatsApp</span>
            <ContactsEditor value={f.contacts ?? []} onChange={(contacts) => setF({ ...f, contacts, phone: contacts.find((c) => c.primary)?.number ?? '' })} />
            <label className="check-line"><input type="checkbox" checked={!!f.docsWhatsapp} onChange={(e) => set('docsWhatsapp', e.target.checked)} />
              <span><b>Poner también el WhatsApp en recetas, constancias y recibos</b><small>{f.docsWhatsapp ? contactLine(f) : `Tel. ${f.phone} · WhatsApp ${clinicWhatsapp(f)}`}</small></span></label>
          </div>
          <label className="field"><span>Correo</span><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
          <label className="field"><span>Símbolo de moneda</span><input className="input" value={f.currency} maxLength={4} onChange={(e) => set('currency', e.target.value)} /></label>
          <label className="field span-2" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={f.recordUsesDni} onChange={(e) => set('recordUsesDni', e.target.checked)} />
            <span style={{ margin: 0 }}>Usar el número de identidad como número de expediente en recetas y constancias</span></label>
          <label className="field span-2"><span>Formato del documento de identidad</span>
            <input className="input num" value={f.dniMask ?? '0000-0000-00000'} maxLength={30} onChange={(e) => set('dniMask', e.target.value.replace(/[^0\- /.]/g, ''))} />
            <small className="muted">Cada 0 es un dígito; los guiones se ponen solos. El de Honduras es 0000-0000-00000. Déjalo vacío si la clínica registra otro tipo de documento con letras.</small></label>
          {office && <>
            <label className="field"><span>Especialidad (encabezado de recetas)</span><input className="input" value={f.specialty ?? ''} onChange={(e) => set('specialty', e.target.value)} /></label>
            <label className="field"><span>Número de colegiación</span><input className="input" value={f.license ?? ''} onChange={(e) => set('license', e.target.value)} /></label>
            <label className="check-line span-2"><input type="checkbox" checked={f.observationEnabled !== false} onChange={(e) => set('observationEnabled', e.target.checked)} />
              <span><b>Uso observación</b><small>Para aplicar medicamentos o hidratar en el consultorio, con su hoja de medicamentos. Si la apagas, la consulta sólo emite receta.</small></span></label>
          </>}
          {(!office || f.observationEnabled !== false) && <label className="field"><span>Observación: resaltar después de (horas)</span>
            <input className="input num" type="number" min={1} max={240} value={f.obsAlertHours ?? 24} onChange={(e) => set('obsAlertHours', Math.max(1, Number(e.target.value) || 24))} /></label>}
          {!office && <label className="field" style={{ alignContent: 'end' }}><span>Órdenes en observación</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 42 }}><input type="checkbox" checked={!!f.obsOrderChecklist} onChange={(e) => set('obsOrderChecklist', e.target.checked)} />
              Enfermería las revisa como checklist</span></label>}
          {(!office || f.observationEnabled !== false) && <>
            <label className="field"><span>Curva térmica: temperatura normal desde (°C)</span>
              <input className="input num" type="number" step={0.1} min={34} max={38} value={f.tempLow ?? 36} onChange={(e) => set('tempLow', Math.round(Number(e.target.value) * 10) / 10)} />
              <small className="muted">Por debajo es hipotermia (azul en la curva).</small></label>
            <label className="field"><span>Fiebre desde (°C)</span>
              <input className="input num" type="number" step={0.1} min={36} max={41} value={f.tempHigh ?? 38} onChange={(e) => set('tempHigh', Math.round(Number(e.target.value) * 10) / 10)} />
              <small className="muted">Desde este valor es fiebre (rojo en la curva y alerta del expediente).</small></label>
          </>}
          <div className="field span-2"><span>Logo (aparece en recetas y constancias)</span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {f.logo ? <img src={f.logo} alt="Logo de la clínica" style={{ height: 48, maxWidth: 160, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 8, padding: 4 }} />
                : <span className="muted">Sin logo; se usa el de Clinara.</span>}
              <label className="btn btn--soft btn--sm">{f.logo ? 'Cambiar' : 'Subir logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) set('logo', await shrinkLogo(file).catch(() => f.logo))
                }} /></label>
              {f.logo && <button className="btn btn--ghost btn--sm" onClick={() => set('logo', undefined)}>Quitar</button>}
            </div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel__head"><div><h2>Recordatorio por WhatsApp</h2><p>Variables: {'{paciente} {clinica} {medico} {fecha} {hora} {telefono}'}</p></div></div>
        <div className="panel__body" style={{ display: 'grid', gap: 14 }}>
          <textarea className="textarea" rows={5} value={f.reminderTemplate} onChange={(e) => set('reminderTemplate', e.target.value)} aria-label="Plantilla del recordatorio" />
          <div className="wa-preview"><span>Ejemplo con una cita ficticia</span><p>{preview}</p></div>
        </div>
      </section>
      <div className="span-all" style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--primary" disabled={!dirty || busy} onClick={async () => { setBusy(true); await saveSettings({ ...f, logo: f.logo ?? '' }); setBusy(false) }}>Guardar cambios</button>
        {dirty && <button className="btn btn--ghost" onClick={() => setF(settings)}>Descartar</button>}
      </div>
      {office && (
        <section className="panel span-all">
          <div className="panel__head"><div><h2>¿El consultorio crece?</h2><p>Si vas a sumar a otro médico, conviértelo en clínica: aparecen enfermería, recepción, administración y hospitalización. No se pierde ni se mueve ningún dato.</p></div>
            <button className="btn btn--ghost" onClick={() => setConverting(true)}>Convertir en clínica</button></div>
        </section>
      )}
      {converting && <ConvertToClinic onClose={() => setConverting(false)} />}
    </div>
  )
}

/**
 * Consultorio → clínica. Se elige quién administrará la clínica (con otro correo) y a qué pasa cada asistente.
 * Al terminar se muestra la contraseña temporal de administración y todos vuelven a iniciar sesión.
 */
function ConvertToClinic({ onClose }: { onClose: () => void }) {
  const { staff, convertToClinic, signOut } = useStore()
  const assistants = staff.filter((s) => hasRole(s, 'assistant'))
  const [admin, setAdmin] = useState({ name: '', email: '' })
  const [roles, setRoles] = useState<Record<string, 'reception' | 'nurse'>>(() => Object.fromEntries(assistants.map((a) => [a.id, 'reception'])))
  const [sure, setSure] = useState(false)
  const [done, setDone] = useState<{ email: string; password: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (done) {
    return (
      <Modal title="Ya es una clínica" onClose={async () => { await signOut() }} footer={<button className="btn btn--primary" onClick={async () => { await signOut() }}>Volver a iniciar sesión</button>}>
        <p>Entrega estos datos a quien administrará la clínica. La contraseña sólo se muestra esta vez.</p>
        <div className="field"><span>Correo</span><div className="secret">{done.email}</div></div>
        <div className="field"><span>Contraseña temporal</span><div className="secret">{done.password}</div></div>
        <p className="muted" style={{ fontSize: 13.5 }}>Los permisos cambiaron: todos vuelven a iniciar sesión.</p>
      </Modal>
    )
  }
  return (
    <Modal title="Convertir el consultorio en clínica" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!sure || admin.name.trim().length < 3 || !/\S+@\S+\.\S+/.test(admin.email) || busy} onClick={async () => {
        setBusy(true)
        const r = await convertToClinic({ admin: { name: admin.name.trim(), email: admin.email.trim() }, assistants: roles })
        setBusy(false)
        if (r) setDone({ email: r.admin.email, password: r.password })
      }}>Convertir</button>
    </>}>
      <p>Tú sigues como médico. Una clínica la administra un usuario de administración (personal, precios, configuración y reportes); créalo con otro correo, aunque seas tú.</p>
      <div className="form-grid">
        <label className="field"><span>Nombre de quien administrará</span><input className="input" value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} /></label>
        <label className="field"><span>Correo de acceso (distinto al tuyo)</span><input className="input" type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} /></label>
      </div>
      {assistants.length > 0 && <fieldset className="fs"><legend>Tus asistentes pasan a</legend>
        {assistants.map((a) => (
          <label key={a.id} className="field"><span>{a.name}</span>
            <select className="select" value={roles[a.id]} onChange={(e) => setRoles({ ...roles, [a.id]: e.target.value as 'reception' | 'nurse' })}>
              <option value="reception">Recepción (agenda, llegadas, caja)</option><option value="nurse">Enfermería (preclínica, medicamentos, notas)</option>
            </select></label>
        ))}</fieldset>}
      <label className="check-line"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        <span><b>Entiendo que no se puede volver a consultorio</b><small>Queda en la bitácora. Ningún dato se borra.</small></span></label>
    </Modal>
  )
}

/**
 * EX1: áreas de servicio. Si la clínica tiene laboratorio o imágenes propios, los exámenes se dirigen a esa área; si no
 * (por omisión), los atiende enfermería. Hoy la app no tiene esos roles: las alertas siguen yendo a enfermería hasta que
 * se creen y se asignen. También los umbrales críticos de laboratorio, por grupo (fuera de ellos, alerta crítica al médico).
 */
function ServiceAreas() {
  const { settings, saveExamAreas } = useStore()
  const [lab, setLab] = useState(!!settings.hasLab)
  const [img, setImg] = useState(!!settings.hasImaging)
  return (
    <div className="grid-2">
      <section className="panel">
        <div className="panel__head"><div><h2>Áreas de servicio</h2><p>¿Quién realiza los exámenes en {features(settings).office ? 'el consultorio' : 'la clínica'}?</p></div></div>
        <div className="panel__body" style={{ display: 'grid', gap: 10 }}>
          <label className="check-line"><input type="checkbox" checked={lab} onChange={(e) => setLab(e.target.checked)} />
            <span><b>Laboratorio propio</b><small>Los exámenes de laboratorio quedan dirigidos al laboratorio. Sin él, enfermería toma la muestra.</small></span></label>
          <label className="check-line"><input type="checkbox" checked={img} onChange={(e) => setImg(e.target.checked)} />
            <span><b>Imágenes propias</b><small>Rayos X, ultrasonido, EKG… quedan dirigidos al área de imágenes. Sin ella, enfermería los coordina o realiza.</small></span></label>
          <p className="muted" style={{ fontSize: 13.5 }}>Mientras no haya personas con rol de laboratorio o de imágenes, los pendientes siguen llegando a la bandeja de enfermería. Cuando se agreguen esos roles, bastará con asignarlos.</p>
          <button className="btn btn--primary" style={{ justifySelf: 'start' }} disabled={lab === !!settings.hasLab && img === !!settings.hasImaging} onClick={() => saveExamAreas({ hasLab: lab, hasImaging: img })}>Guardar áreas</button>
        </div>
      </section>
      {/* AD1 (ronda 5): umbrales por grupo, con analitos propios */}
      <CriticalThresholds />
    </div>
  )
}

/** AD9: formas de pago que acepta la clínica. Al cobrar sólo aparecen éstas. Al menos una queda activa. */
function PaymentMethods() {
  const { settings, savePaymentMethods } = useStore()
  const all: PaymentMethod[] = ['cash', 'transfer', 'card', 'deposit', 'insurance', 'other']
  const [on, setOn] = useState<PaymentMethod[]>(settings.paymentMethods ?? ['cash', 'transfer'])
  const hint: Record<PaymentMethod, string> = {
    cash: 'Con cálculo del cambio y arqueo al cierre.', transfer: 'Se anota el banco y, si la dan, la referencia.', card: 'Sólo si la clínica tiene terminal (POS). Pide el número de autorización.',
    deposit: 'Depósito en la cuenta de la clínica, con banco y referencia.', insurance: 'Pagos que cubre la aseguradora, con número de póliza o autorización.', other: 'Cualquier otra forma, con una nota.',
  }
  const same = on.length === (settings.paymentMethods ?? ['cash', 'transfer']).length && on.every((m) => (settings.paymentMethods ?? ['cash', 'transfer']).includes(m))
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Formas de pago</h2><p>Marca las que acepta {features(settings).office ? 'el consultorio' : 'la clínica'}. Al cobrar sólo aparecen éstas.</p></div></div>
      <div className="panel__body" style={{ display: 'grid', gap: 8, maxWidth: 640 }}>
        {all.map((m) => (
          <label key={m} className="check-line"><input type="checkbox" checked={on.includes(m)} disabled={on.length === 1 && on.includes(m)}
            onChange={(e) => setOn(e.target.checked ? all.filter((x) => x === m || on.includes(x)) : on.filter((x) => x !== m))} />
            <span><b>{METHOD_LABEL[m]}</b><small>{hint[m]}</small></span></label>
        ))}
        <p className="muted" style={{ fontSize: 13.5 }}>Al menos una queda activa.</p>
        <button className="btn btn--primary" style={{ justifySelf: 'start' }} disabled={same} onClick={() => savePaymentMethods(on)}>Guardar formas de pago</button>
      </div>
    </section>
  )
}

function Services() {
  const { services, settings, createService } = useStore()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  return (
    <section className="panel table-wrap">
      <table className="table table--sticky">
        <thead><tr><th>Servicio</th><th style={{ width: 160 }}>Precio ({settings.currency})</th><th style={{ width: 130 }}>Estado</th><th>Origen</th><th style={{ width: 120 }} /></tr></thead>
        <tbody>
          {services.map((s) => <ServiceRow key={s.id} s={s} />)}
          <tr>
            <td><input className="input" placeholder="Nuevo servicio, p. ej. Retiro de puntos" value={name} onChange={(e) => setName(e.target.value)} /></td>
            <td><input className="input num" type="number" min={0} step="0.01" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} /></td>
            <td />
            <td />
            <td style={{ textAlign: 'right' }}>
              <button className="btn btn--soft btn--sm" disabled={name.trim().length < 2 || price === ''} onClick={async () => {
                if (await createService({ name: name.trim(), price: Number(price), active: true })) { setName(''); setPrice('') }
              }}><Plus size={15} />Agregar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function ServiceRow({ s }: { s: Service }) {
  const { updateService, settings, staffById } = useStore()
  const [name, setName] = useState(s.name)
  const [price, setPrice] = useState(String(s.price))
  const dirty = name !== s.name || Number(price) !== s.price
  return (
    <tr style={s.active ? undefined : { opacity: 0.55 }}>
      <td><input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del servicio" /></td>
      <td><input className="input num" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} aria-label={`Precio de ${s.name}`} title={money(s.price, settings.currency)} /></td>
      <td>{s.active ? <span className="badge badge--mint">Activo</span> : <span className="badge">Oculto en caja</span>}</td>
      <td style={{ fontSize: 13.5 }}>{s.createdBy ? <>Agregado al cobrar por {staffById(s.createdBy)?.name ?? '—'}<br /><small className="muted">{s.createdAt ? date(s.createdAt) : ''}</small></> : <span className="muted">Configuración</span>}</td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {dirty
          ? <button className="btn btn--primary btn--sm" onClick={() => updateService(s.id, { name: name.trim(), price: Number(price) })}>Guardar</button>
          : <button className="btn btn--ghost btn--sm" onClick={() => updateService(s.id, { active: !s.active })}>{s.active ? 'Ocultar' : 'Activar'}</button>}
      </td>
    </tr>
  )
}

const LAST_DOCTOR = 'clinara.horarios.medico'

/**
 * AD2 (ronda 5): un médico a la vez. Se elige en la lista (con buscador) y se ve sólo su horario, con el mismo
 * formulario. Si hay cambios sin guardar, se pregunta antes de cambiar. Se recuerda el último consultado. En un
 * consultorio (un solo médico) no hay lista.
 */
function Schedules() {
  const { staff, settings } = useStore()
  const office = features(settings).office
  const doctors = staff.filter((s) => hasRole(s, 'doctor')).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'))
  const [q, setQ] = useState('')
  const [id, setId] = useState<string>(() => { try { return localStorage.getItem(LAST_DOCTOR) ?? '' } catch { return '' } })
  const [unsaved, setUnsaved] = useState<(() => Promise<boolean>) | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const current = doctors.find((d) => d.id === id) ?? doctors[0]
  const n = normalize(q)
  const list = doctors.filter((d) => !n || normalize(`${d.name} ${d.specialty ?? ''}`).includes(n))
  const select = (next: string) => {
    setId(next)
    setUnsaved(null)
    try { localStorage.setItem(LAST_DOCTOR, next) } catch { /* sin almacenamiento */ }
  }
  const choose = (next: string) => { if (next !== current?.id) { if (unsaved) setAsking(next); else select(next) } }
  if (!current) return <div className="empty">No hay médicos en {office ? 'el consultorio' : 'la clínica'}.</div>
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ color: 'var(--muted)' }}>Cada día puede tener una o más franjas (por ejemplo, de 08:00 AM a 12:00 PM y de 02:00 PM a 05:00 PM). La agenda y la reserva en línea solo ofrecen horas dentro del horario. Cada médico también puede cambiar el suyo en <i>Mi configuración</i>.</p>
      <div className={office || doctors.length < 2 ? '' : 'sched-pick'}>
        {!office && doctors.length > 1 && (
          <nav className="panel sched-pick__list" aria-label="Médicos">
            <div className="panel__body" style={{ paddingBottom: 8 }}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar médico por nombre" aria-label="Buscar médico por nombre" />
            </div>
            <ul role="listbox" aria-label="Elige un médico">
              {list.map((d) => (
                <li key={d.id}>
                  <button type="button" role="option" aria-selected={d.id === current.id} className={`sched-pick__item${d.id === current.id ? ' is-on' : ''}`} onClick={() => choose(d.id)}>
                    <Avatar name={d.name} color={d.color} /><span><b>{d.name}</b><small>{[d.specialty, d.active ? '' : 'desactivado'].filter(Boolean).join(' · ')}</small></span>
                  </button>
                </li>
              ))}
              {!list.length && <li className="muted" style={{ padding: '8px 16px' }}>Ningún médico coincide.</li>}
            </ul>
          </nav>
        )}
        <ScheduleCard key={current.id} d={current} onDirty={(save) => setUnsaved(() => save)} />
      </div>
      {asking && (
        <Modal title="Hay cambios sin guardar" onClose={() => setAsking(null)} footer={<>
          <button className="btn btn--ghost" onClick={() => setAsking(null)}>Cancelar</button>
          <button className="btn btn--soft" onClick={() => { select(asking); setAsking(null) }}>Descartar</button>
          <button className="btn btn--primary" onClick={async () => { if (unsaved && await unsaved()) { select(asking); setAsking(null) } }}>Guardar</button>
        </>}>
          <p>Hay cambios sin guardar en el horario de {current.name}. ¿Guardar antes de cambiar?</p>
        </Modal>
      )}
    </div>
  )
}

function ScheduleCard({ d, onDirty }: { d: Staff; onDirty?: (save: (() => Promise<boolean>) | null) => void }) {
  const { services, updateStaff } = useStore()
  return (
    <section className="panel">
      <div className="panel__head">
        <div className="cell-person"><Avatar name={d.name} color={d.color} /><div><h2 style={{ fontSize: 16 }}>{d.name}</h2><p>{d.specialty}{d.active ? '' : ', desactivado'}</p></div></div>
      </div>
      <div className="panel__body">
        <ScheduleEditor d={d} onDirty={onDirty} extra={
          <label className="field"><span>Se cobra por defecto</span>
            <select className="select" value={d.serviceId ?? ''} onChange={(e) => updateStaff(d.id, { serviceId: e.target.value }, 'Servicio por defecto guardado')}>
              <option value="">Ninguno</option>{services.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        } />
      </div>
    </section>
  )
}
