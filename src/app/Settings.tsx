import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, PageHead } from '../components/ui'
import { DAY_NAMES, fillTemplate, money } from '../lib/format'
import type { ClinicSettings, Schedule, Service, Staff } from '../lib/types'

type Tab = 'clinic' | 'services' | 'schedules' | 'beds'

export default function Settings() {
  const [tab, setTab] = useState<Tab>('clinic')
  return (
    <div className="page">
      <PageHead title="Configuración" sub="Datos que aparecen en recetas y recibos, precios, horarios de atención y camas." />
      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'clinic'} onClick={() => setTab('clinic')}>Clínica</button>
        <button className="tab" role="tab" aria-selected={tab === 'services'} onClick={() => setTab('services')}>Servicios y precios</button>
        <button className="tab" role="tab" aria-selected={tab === 'schedules'} onClick={() => setTab('schedules')}>Horarios de médicos</button>
        <button className="tab" role="tab" aria-selected={tab === 'beds'} onClick={() => setTab('beds')}>Camas</button>
      </div>
      {tab === 'clinic' && <ClinicForm />}
      {tab === 'services' && <Services />}
      {tab === 'schedules' && <Schedules />}
      {tab === 'beds' && <Beds />}
    </div>
  )
}

/** Camas de hospitalización. Cada cama tiene especialidad; cualquier médico puede atender a quien esté en ella. */
function Beds() {
  const { beds, createBed, updateBed } = useStore()
  const [room, setRoom] = useState('')
  const [label, setLabel] = useState('')
  const [specialty, setSpecialty] = useState(beds[0]?.specialty ?? 'Medicina interna')
  const specialties = [...new Set(['Medicina interna', 'Cirugía', 'Pediatría', 'Ginecología y obstetricia', 'Observación', ...beds.map((b) => b.specialty)])]
  const sorted = [...beds].sort((a, b) => a.room.localeCompare(b.room, 'es', { numeric: true }) || a.label.localeCompare(b.label))
  return (
    <section className="panel table-wrap">
      <table className="table">
        <thead><tr><th>Cuarto</th><th>Cama</th><th>Especialidad</th><th>Estado</th></tr></thead>
        <tbody>
          {sorted.map((b) => (
            <tr key={b.id}>
              <td className="num">{b.room}</td><td>{b.label || '—'}</td>
              <td><select className="select" value={b.specialty} onChange={(e) => updateBed(b.id, { specialty: e.target.value })}>{specialties.map((s) => <option key={s}>{s}</option>)}</select></td>
              <td><button className={`btn btn--sm ${b.active ? 'btn--ghost' : 'btn--soft'}`} onClick={() => updateBed(b.id, { active: !b.active })}>{b.active ? 'Desactivar' : 'Activar'}</button>
                {!b.active && <span className="muted" style={{ marginLeft: 8 }}>Inactiva</span>}</td>
            </tr>
          ))}
          <tr>
            <td><input className="input" placeholder="Ej. 106" value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Cuarto" /></td>
            <td><input className="input" placeholder="Opcional, ej. A" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Cama" /></td>
            <td><input className="input" list="bed-specialties" value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="Especialidad" />
              <datalist id="bed-specialties">{specialties.map((s) => <option key={s} value={s} />)}</datalist></td>
            <td><button className="btn btn--soft btn--sm" disabled={!room.trim() || specialty.trim().length < 2} onClick={async () => {
              if (await createBed({ room: room.trim(), label: label.trim(), specialty: specialty.trim(), active: true })) { setRoom(''); setLabel('') }
            }}><Plus size={14} />Agregar cama</button></td>
          </tr>
        </tbody>
      </table>
      {!beds.length && <div className="empty">Agrega las camas de la clínica con su número de cuarto y especialidad.</div>}
    </section>
  )
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
  const set = <K extends keyof ClinicSettings>(k: K, v: ClinicSettings[K]) => setF({ ...f, [k]: v })
  const preview = fillTemplate(f.reminderTemplate, {
    paciente: 'María José', clinica: f.name, medico: 'Dra. Lucía Herrera', fecha: 'martes 20 de octubre', hora: '09:30', telefono: f.phone,
  })
  const dirty = JSON.stringify(f) !== JSON.stringify(settings)
  return (
    <div className="grid-2">
      <section className="panel">
        <div className="panel__head"><h2>Datos de la clínica</h2></div>
        <div className="panel__body form-grid">
          <label className="field span-2"><span>Nombre</span><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="field span-2"><span>Dirección</span><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
          <label className="field"><span>Teléfono</span><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
          <label className="field"><span>Correo</span><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
          <label className="field"><span>Símbolo de moneda</span><input className="input" value={f.currency} maxLength={4} onChange={(e) => set('currency', e.target.value)} /></label>
          <label className="field"><span>Vigencia de recetas (días)</span><input className="input num" type="number" min={1} max={365} value={f.rxValidityDays} onChange={(e) => set('rxValidityDays', Number(e.target.value))} /></label>
          <label className="field span-2" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={f.recordUsesDni} onChange={(e) => set('recordUsesDni', e.target.checked)} />
            <span style={{ margin: 0 }}>Usar el número de identidad como número de expediente en recetas y constancias</span></label>
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
    </div>
  )
}

function Services() {
  const { services, settings, createService } = useStore()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  return (
    <section className="panel table-wrap">
      <table className="table">
        <thead><tr><th>Servicio</th><th style={{ width: 160 }}>Precio ({settings.currency})</th><th style={{ width: 130 }}>Estado</th><th style={{ width: 120 }} /></tr></thead>
        <tbody>
          {services.map((s) => <ServiceRow key={s.id} s={s} />)}
          <tr>
            <td><input className="input" placeholder="Nuevo servicio, p. ej. Retiro de puntos" value={name} onChange={(e) => setName(e.target.value)} /></td>
            <td><input className="input num" type="number" min={0} step="0.01" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} /></td>
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
  const { updateService, settings } = useStore()
  const [name, setName] = useState(s.name)
  const [price, setPrice] = useState(String(s.price))
  const dirty = name !== s.name || Number(price) !== s.price
  return (
    <tr style={s.active ? undefined : { opacity: 0.55 }}>
      <td><input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del servicio" /></td>
      <td><input className="input num" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} aria-label={`Precio de ${s.name}`} title={money(s.price, settings.currency)} /></td>
      <td>{s.active ? <span className="badge badge--mint">Activo</span> : <span className="badge">Oculto en caja</span>}</td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {dirty
          ? <button className="btn btn--primary btn--sm" onClick={() => updateService(s.id, { name: name.trim(), price: Number(price) })}>Guardar</button>
          : <button className="btn btn--ghost btn--sm" onClick={() => updateService(s.id, { active: !s.active })}>{s.active ? 'Ocultar' : 'Activar'}</button>}
      </td>
    </tr>
  )
}

function Schedules() {
  const { staff } = useStore()
  const doctors = staff.filter((s) => s.role === 'doctor')
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ color: 'var(--muted)' }}>El horario define qué espacios se ofrecen en la reserva en línea. La agenda interna permite agendar fuera de horario si hace falta.</p>
      {doctors.map((d) => <ScheduleCard key={d.id} d={d} />)}
    </div>
  )
}

const DEFAULT_SCHEDULE: Schedule = { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', slot: 30 }

function ScheduleCard({ d }: { d: Staff }) {
  const { services, updateStaff } = useStore()
  const [s, setS] = useState<Schedule>(d.schedule ?? DEFAULT_SCHEDULE)
  const [serviceId, setServiceId] = useState(d.serviceId ?? '')
  const dirty = JSON.stringify(s) !== JSON.stringify(d.schedule ?? DEFAULT_SCHEDULE) || serviceId !== (d.serviceId ?? '')
  const toggle = (day: number) => setS({ ...s, days: s.days.includes(day) ? s.days.filter((x) => x !== day) : [...s.days, day].sort() })
  return (
    <section className="panel">
      <div className="panel__head">
        <div className="cell-person"><Avatar name={d.name} color={d.color} /><div><h2 style={{ fontSize: 16 }}>{d.name}</h2><p>{d.specialty}{d.active ? '' : ', desactivado'}</p></div></div>
        <button className="btn btn--primary btn--sm" disabled={!dirty || !s.days.length || s.start >= s.end}
          onClick={() => updateStaff(d.id, { schedule: s, serviceId }, 'Horario guardado')}>Guardar horario</button>
      </div>
      <div className="panel__body schedule">
        <div className="field">
          <span>Días de atención</span>
          <div className="chips">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <button key={day} type="button" className="chip" aria-pressed={s.days.includes(day)} onClick={() => toggle(day)}>{DAY_NAMES[day]}</button>
            ))}
          </div>
        </div>
        <div className="form-grid form-grid--4">
          <label className="field"><span>Entrada</span><input className="input" type="time" step={900} value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })} /></label>
          <label className="field"><span>Salida</span><input className="input" type="time" step={900} value={s.end} onChange={(e) => setS({ ...s, end: e.target.value })} /></label>
          <label className="field"><span>Duración de cita</span>
            <select className="select" value={s.slot} onChange={(e) => setS({ ...s, slot: Number(e.target.value) })}>{[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
          </label>
          <label className="field"><span>Se cobra por defecto</span>
            <select className="select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">Ninguno</option>{services.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        </div>
        {s.start >= s.end && <p style={{ color: 'var(--red-ink)', fontSize: 13.5 }}>La hora de salida debe ser después de la de entrada.</p>}
      </div>
    </section>
  )
}
