import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../../lib/store'
import { SectionHead } from '../../components/ui'
import { date, METHOD_LABEL, money } from '../../lib/format'
import type { PaymentMethod, Service } from '../../lib/types'
import { features } from '../../lib/permissions'
import { useSectionBlock } from './section'

// Configuración: áreas de servicio, formas de pago y servicios que se cobran.
/**
 * EX1: áreas de servicio. Si la clínica tiene laboratorio o imágenes propios, los exámenes se dirigen a esa área; si no
 * (por omisión), los atiende enfermería. Hoy la app no tiene esos roles: las alertas siguen yendo a enfermería hasta que
 * se creen y se asignen. También los umbrales críticos de laboratorio, por grupo (fuera de ellos, alerta crítica al médico).
 */
export function ServiceAreas() {
  const { settings, saveExamAreas } = useStore()
  // CF1 (ronda 17): borrador encima de lo guardado; lo guarda «Guardar cambios» de la sección
  const [draft, setDraft] = useState<{ hasLab?: boolean; hasImaging?: boolean }>({})
  const lab = draft.hasLab ?? !!settings.hasLab
  const img = draft.hasImaging ?? !!settings.hasImaging
  const setLab = (x: boolean) => setDraft((d) => ({ ...d, hasLab: x }))
  const setImg = (x: boolean) => setDraft((d) => ({ ...d, hasImaging: x }))
  useSectionBlock('areas', {
    dirty: lab !== !!settings.hasLab || img !== !!settings.hasImaging,
    save: async () => { const ok = !!(await saveExamAreas({ hasLab: lab, hasImaging: img })); if (ok) setDraft({}); return ok },
    reset: () => setDraft({}),
  })
  return (
    <div>
      <section className="panel" data-tour="tab:areas">
        <div className="panel__head"><div><h2>Áreas de servicio</h2><p>¿Quién realiza los exámenes en {features(settings).office ? 'el consultorio' : 'la clínica'}?</p></div></div>
        <div className="panel__body" style={{ display: 'grid', gap: 10 }}>
          <label className="check-line"><input type="checkbox" checked={lab} onChange={(e) => setLab(e.target.checked)} />
            <span><b>Laboratorio propio</b><small>Los exámenes de laboratorio quedan dirigidos al laboratorio. Sin él, enfermería toma la muestra.</small></span></label>
          <label className="check-line"><input type="checkbox" checked={img} onChange={(e) => setImg(e.target.checked)} />
            <span><b>Imágenes propias</b><small>Rayos X, ultrasonido, EKG… quedan dirigidos al área de imágenes. Sin ella, enfermería los coordina o realiza.</small></span></label>
          <p className="c-muted fs-md">Mientras no haya personas con rol de laboratorio o de imágenes, los pendientes siguen llegando a la bandeja de enfermería. Cuando se agreguen esos roles, bastará con asignarlos.</p>
        </div>
      </section>
    </div>
  )
}

/** AD9: formas de pago que acepta la clínica. Al cobrar sólo aparecen éstas. Al menos una queda activa. */
export function PaymentMethods() {
  const { settings, savePaymentMethods } = useStore()
  const all: PaymentMethod[] = ['cash', 'transfer', 'card', 'deposit', 'insurance', 'other']
  const saved = settings.paymentMethods ?? ['cash', 'transfer']
  // CF1 (ronda 17): borrador encima de lo guardado; lo guarda «Guardar cambios» de la sección
  const [draft, setOn] = useState<PaymentMethod[] | null>(null)
  const on = draft ?? saved
  const hint: Record<PaymentMethod, string> = {
    cash: 'Con cálculo del cambio y arqueo al cierre.', transfer: 'Se anota el banco y, si la dan, la referencia.', card: 'Sólo si la clínica tiene terminal (POS). Pide el número de autorización.',
    deposit: 'Depósito en la cuenta de la clínica, con banco y referencia.', insurance: 'Pagos que cubre la aseguradora, con número de póliza o autorización.', other: 'Cualquier otra forma, con una nota.',
  }
  const same = on.length === saved.length && on.every((m) => saved.includes(m))
  useSectionBlock('pagos', {
    dirty: !same,
    save: async () => { const ok = !!(await savePaymentMethods(on)); if (ok) setOn(null); return ok },
    reset: () => setOn(null),
  })
  return (
    <section className="panel" data-tour="tab:pagos">
      <div className="panel__head"><div><h2>Formas de pago</h2><p>Marca las que acepta {features(settings).office ? 'el consultorio' : 'la clínica'}. Al cobrar sólo aparecen éstas.</p></div></div>
      <div className="panel__body" style={{ display: 'grid', gap: 8, maxWidth: 640 }}>
        {all.map((m) => (
          <label key={m} className="check-line"><input type="checkbox" checked={on.includes(m)} disabled={on.length === 1 && on.includes(m)}
            onChange={(e) => setOn(e.target.checked ? all.filter((x) => x === m || on.includes(x)) : on.filter((x) => x !== m))} />
            <span><b>{METHOD_LABEL[m]}</b><small>{hint[m]}</small></span></label>
        ))}
        <p className="c-muted fs-md">Al menos una queda activa.</p>
      </div>
    </section>
  )
}

/** CF1 (ronda 6): encabezado con el botón azul «Agregar servicio» arriba; abre la misma fila de alta de antes, al principio. */
export function Services() {
  const { services, settings, createService } = useStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  return (
    <section className="panel table-wrap" data-tour="tab:servicios">
      <SectionHead title="Servicios y precios" sub="Lo que se cobra en caja, con su precio. Ocultar un servicio lo quita de la caja; los cobros anteriores no cambian."
        action={<button className="btn btn--primary btn--sm" onClick={() => setAdding(true)}><Plus size={15} />Agregar servicio</button>} />
      <table className="table table--sticky table--cards">
        <thead><tr><th>Servicio</th><th style={{ width: 160 }}>Precio ({settings.currency})</th><th style={{ width: 130 }}>Estado</th><th>Origen</th><th style={{ width: 120 }} /></tr></thead>
        <tbody>
          {adding && (
            <tr className="row-new">
              <td data-label="Servicio" className="tc-full"><input className="input" autoFocus placeholder="Nuevo servicio, p. ej. Retiro de puntos" aria-label="Nombre del servicio" value={name} onChange={(e) => setName(e.target.value)} /></td>
              <td data-label={`Precio (${settings.currency})`}><input className="input num" type="number" min={0} step="0.01" placeholder="0.00" aria-label="Precio" value={price} onChange={(e) => setPrice(e.target.value)} /></td>
              <td />
              <td />
              <td className="tc-actions ta-r nowrap">
                <button className="btn btn--primary btn--sm" disabled={name.trim().length < 2 || price === ''} onClick={async () => {
                  if (await createService({ name: name.trim(), price: Number(price), active: true })) { setName(''); setPrice(''); setAdding(false) }
                }}><Plus size={15} />Agregar</button>{' '}
                <button className="btn btn--ghost btn--sm" onClick={() => { setAdding(false); setName(''); setPrice('') }}>Cancelar</button>
              </td>
            </tr>
          )}
          {services.map((s) => <ServiceRow key={s.id} s={s} />)}
        </tbody>
      </table>
    </section>
  )
}

export function ServiceRow({ s }: { s: Service }) {
  const { updateService, settings, staffById } = useStore()
  const [name, setName] = useState(s.name)
  const [price, setPrice] = useState(String(s.price))
  const dirty = name !== s.name || Number(price) !== s.price
  // CF1 (ronda 17): un precio o nombre cambiado también lo guarda «Guardar cambios» de la sección (y avisa al cambiar de sección)
  useSectionBlock(`servicio:${s.id}`, {
    dirty, save: async () => !!(await updateService(s.id, { name: name.trim(), price: Number(price) })),
    reset: () => { setName(s.name); setPrice(String(s.price)) },
  })
  return (
    <tr style={s.active ? undefined : { opacity: 0.55 }}>
      <td data-label="Servicio" className="tc-full"><input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del servicio" /></td>
      <td data-label={`Precio (${settings.currency})`}><input className="input num" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} aria-label={`Precio de ${s.name}`} title={money(s.price, settings.currency)} /></td>
      <td data-label="Estado">{s.active ? <span className="badge badge--mint">Activo</span> : <span className="badge">Oculto en caja</span>}</td>
      <td data-label="Origen" className="tc-full fs-md">{s.createdBy ? <>Agregado al cobrar por {staffById(s.createdBy)?.name ?? '—'}<br /><small className="muted">{s.createdAt ? date(s.createdAt) : ''}</small></> : <span className="muted">Configuración</span>}</td>
      <td className="tc-actions ta-r nowrap">
        {dirty
          ? <button className="btn btn--primary btn--sm" onClick={() => updateService(s.id, { name: name.trim(), price: Number(price) })}>Guardar</button>
          : <button className="btn btn--ghost btn--sm" onClick={() => updateService(s.id, { active: !s.active })}>{s.active ? 'Ocultar' : 'Activar'}</button>}
      </td>
    </tr>
  )
}
