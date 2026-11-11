import { useState } from 'react'
import { useStore } from '../../lib/store'
import { Modal } from '../../components/ui'
import { clinicWhatsapp, contactLine, fillTemplate } from '../../lib/format'
import { ContactsEditor } from '../../components/Contacts'
import { features, hasRole } from '../../lib/permissions'
import { Panel } from './Panel'
import { useSettingsDraft } from './section'

// Configuración: datos de la clínica, recordatorios, observación y conversión de consultorio a clínica.
/** Reduce el logo a 240 px de alto como máximo para que no pese en cada carga. */
export function shrinkLogo(file: File) {
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

/** CF1: Datos de la clínica (o del consultorio): lo que sale en recetas, constancias y recibos. */
export function ClinicDataForm() {
  const { settings } = useStore()
  const { v: f, set, setMany } = useSettingsDraft('datos')
  const [converting, setConverting] = useState(false)
  const office = features(settings).office
  return (
    <div className="cfg-grid">
      <section className="panel">
        <div className="panel__head"><h2>Nombre y contactos</h2></div>
        <div className="panel__body form-grid">
          <label className="field span-2"><span>Nombre</span><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="field span-2"><span>Dirección</span><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
          <div className="field span-2"><span>Teléfonos y WhatsApp</span>
            <ContactsEditor value={f.contacts ?? []} onChange={(contacts) => setMany({ contacts, phone: contacts.find((c) => c.primary)?.number ?? '' })} />
            <label className="check-line"><input type="checkbox" checked={!!f.docsWhatsapp} onChange={(e) => set('docsWhatsapp', e.target.checked)} />
              <span><b>Poner también el WhatsApp en recetas, constancias y recibos</b><small>{f.docsWhatsapp ? contactLine(f) : `Tel. ${f.phone} · WhatsApp ${clinicWhatsapp(f)}`}</small></span></label>
          </div>
          <label className="field span-2"><span>Correo</span><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
        </div>
      </section>
      <section className="panel">
        <div className="panel__head"><div><h2>Recetas, constancias y recibos</h2><p>El encabezado, la moneda y cómo se escribe el documento de identidad.</p></div></div>
        <div className="panel__body form-grid">
          {office && <>
            <label className="field"><span>Especialidad (encabezado de recetas)</span><input className="input" value={f.specialty ?? ''} onChange={(e) => set('specialty', e.target.value)} /></label>
            <label className="field"><span>Número de colegiación</span><input className="input" value={f.license ?? ''} onChange={(e) => set('license', e.target.value)} /></label>
          </>}
          <label className="field"><span>Símbolo de moneda</span><input className="input" value={f.currency} maxLength={4} onChange={(e) => set('currency', e.target.value)} /></label>
          <label className="field span-2" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={f.recordUsesDni} onChange={(e) => set('recordUsesDni', e.target.checked)} />
            <span className="m-0">Usar el número de identidad como número de expediente en recetas y constancias</span></label>
          <label className="field span-2"><span>Formato del documento de identidad</span>
            <input className="input num" value={f.dniMask ?? '0000-0000-00000'} maxLength={30} onChange={(e) => set('dniMask', e.target.value.replace(/[^0\- /.]/g, ''))} />
            <small className="muted">Cada 0 es un dígito; los guiones se ponen solos. El de Honduras es 0000-0000-00000. Déjalo vacío si la clínica registra otro tipo de documento con letras.</small></label>
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

/** CF1: el mensaje de recordatorio por WhatsApp (sección Agenda y recordatorios), con un ejemplo. */
export function ReminderForm() {
  const { v: f, set } = useSettingsDraft('recordatorio')
  const preview = fillTemplate(f.reminderTemplate, {
    paciente: 'María José', clinica: f.name, medico: 'Dra. Valeria Solórzano', fecha: 'martes 20 de octubre', hora: '09:30', telefono: clinicWhatsapp(f),
  })
  return (
    <Panel title="Recordatorio por WhatsApp" sub={<>El mensaje que se envía antes de cada cita. Variables: {'{paciente} {clinica} {medico} {fecha} {hora} {telefono}'}</>}>
      <div className="panel__body cfg-reminder">
        <textarea className="textarea" rows={5} value={f.reminderTemplate} onChange={(e) => set('reminderTemplate', e.target.value)} aria-label="Plantilla del recordatorio" />
        <div className="wa-preview"><span>Ejemplo con una cita ficticia</span><p>{preview}</p></div>
      </div>
    </Panel>
  )
}

/**
 * CF1: Hospitalización y observación (en el consultorio, Observación): horas para resaltar, checklist de órdenes (OB1),
 * curva térmica y fiebre. En el consultorio, si usa observación.
 */
export function ObservationForm() {
  const { settings } = useStore()
  const { v: f, set } = useSettingsDraft('observacion')
  const office = features(settings).office
  const on = !office || f.observationEnabled !== false
  return (
    <div className="cfg-grid">
      <Panel title="Observación" sub={office ? 'Para aplicar medicamentos o hidratar en el consultorio.' : 'Pacientes en observación corta, sin cama.'}>
        <div className="panel__body form-grid">
          {office && <label className="check-line span-2"><input type="checkbox" checked={f.observationEnabled !== false} onChange={(e) => set('observationEnabled', e.target.checked)} />
            <span><b>Uso observación</b><small>Para aplicar medicamentos o hidratar en el consultorio, con su hoja de medicamentos. Si la apagas, la consulta sólo emite receta.</small></span></label>}
          {on && <label className="field span-2"><span>Resaltar después de (horas)</span>
            <input className="input num" style={{ maxWidth: 160 }} type="number" min={1} max={240} value={f.obsAlertHours ?? 24} onChange={(e) => set('obsAlertHours', Math.max(1, Number(e.target.value) || 24))} />
            <small className="muted">Quien lleva más tiempo que esto en observación se resalta en la lista.</small></label>}
          {/* OB1 (ronda 17): viene activado; la migración v90 lo activó una vez en las clínicas que ya existían */}
          {!office && <label className="check-line span-2"><input type="checkbox" checked={!!f.obsOrderChecklist} onChange={(e) => set('obsOrderChecklist', e.target.checked)} />
            <span><b>Órdenes en observación: enfermería las revisa como checklist</b><small>Enfermería revisa una por una las órdenes de cada nota de observación, como en hospitalización.</small></span></label>}
        </div>
      </Panel>
      {on && (
        <Panel title="Curva térmica y fiebre" sub="Los colores de la curva y la alerta de fiebre del expediente.">
          <div className="panel__body form-grid">
            <label className="field"><span>Temperatura normal desde (°C)</span>
              <input className="input num" type="number" step={0.1} min={34} max={38} value={f.tempLow ?? 36} onChange={(e) => set('tempLow', Math.round(Number(e.target.value) * 10) / 10)} />
              <small className="muted">Por debajo es hipotermia (azul en la curva).</small></label>
            <label className="field"><span>Fiebre desde (°C)</span>
              <input className="input num" type="number" step={0.1} min={36} max={41} value={f.tempHigh ?? 38} onChange={(e) => set('tempHigh', Math.round(Number(e.target.value) * 10) / 10)} />
              <small className="muted">Desde este valor es fiebre (rojo en la curva y alerta del expediente).</small></label>
          </div>
        </Panel>
      )}
    </div>
  )
}

/**
 * Consultorio → clínica. Se elige quién administrará la clínica (con otro correo) y a qué pasa cada asistente.
 * Al terminar se muestra la contraseña temporal de administración y todos vuelven a iniciar sesión.
 */
export function ConvertToClinic({ onClose }: { onClose: () => void }) {
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
        <p className="c-muted fs-md">Los permisos cambiaron: todos vuelven a iniciar sesión.</p>
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
