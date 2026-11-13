import { useMemo, useState } from 'react'
import { Combo, asChange } from './Combo'
import { Plus, TriangleAlert } from 'lucide-react'
import { useStore } from '../lib/store'
import { Modal } from './ui'
import { normalize } from '../lib/patients'
import { searchDrugs } from '../lib/drugProvider'
import { ROUTES } from '../lib/format'
import type { Drug } from '../lib/catalogs'

/** ¿Está en el vademécum (por nombre o alias, sin tildes ni mayúsculas)? */
export const inVademecum = (drugs: Drug[], name: string) => {
  const q = normalize(name)
  return !q || drugs.some((d) => normalize(d.name) === q || d.aliases?.some((a) => normalize(a) === q))
}

const FORMS = ['Tableta', 'Cápsula', 'Jarabe', 'Suspensión', 'Gotas', 'Ampolla', 'Vial', 'Crema', 'Ungüento', 'Gel', 'Inhalador', 'Solución para nebulizar', 'Supositorio', 'Óvulo', 'Parche', 'Solución']

/**
 * ME11 (ronda 11): la franja naranja «No está en el vademécum de la clínica» con «Agregar al vademécum» a la derecha. Es la
 * misma en todos los formularios de medicamento (consulta externa, receta, ventana de nota, egreso, nebulización por
 * componente, Consultorio). No es obligatorio: se puede seguir sin agregarlo. Agregan el médico y Administración.
 */
export function NotInVademecum({ drugs, name, presentation, route, onLinked, className = '' }: {
  drugs: Drug[]; name: string; presentation?: string; route?: string
  /** Lo agregado o el «¿Es este?» elegido: el formulario lo enlaza (nombre y presentación). */
  onLinked: (d: Drug) => void; className?: string
}) {
  const { can } = useStore()
  const [open, setOpen] = useState(false)
  if (!name.trim() || inVademecum(drugs, name)) return null
  const canAdd = can('rx.write') || can('drugs.manage')
  return (<>
    <div className={`vdm-strip ${className}`} role="status">
      <span><TriangleAlert size={14} aria-hidden="true" />No está en el vademécum de la clínica</span>
      {canAdd && <button type="button" className="btn btn--sm vdm-strip__btn" onClick={() => setOpen(true)}><Plus size={14} />Agregar al vademécum</button>}
    </div>
    {open && <AddDrugModal name={name} presentation={presentation} route={route} drugs={drugs} onClose={() => setOpen(false)} onDone={(d) => { setOpen(false); onLinked(d) }} />}
  </>)
}

/**
 * ME11: ventana pequeña encima del formulario (no lo cierra ni pierde lo escrito). Antes de guardar muestra «¿Es este?» con
 * los parecidos (sin tildes ni mayúsculas, o por alias); elegir uno lo usa sin crear otro. Lo agregado entra con origen
 * «Catálogo base Clinara» y queda en la bitácora.
 */
export function AddDrugModal({ name, presentation, route, drugs, onClose, onDone }: {
  name: string; presentation?: string; route?: string; drugs: Drug[]; onClose: () => void; onDone: (d: Drug) => void
}) {
  const { addClinicDrug } = useStore()
  const [f, setF] = useState({ name: name.trim(), brand: '', presentation: presentation?.trim() ?? '', form: '', route: route && ROUTES.includes(route) ? route : '' })
  const [busy, setBusy] = useState(false)
  // Parecidos: por cada palabra de letras del nombre («acetaminofen 500» → «acetaminofen»)
  const similar = useMemo(() => {
    const words = normalize(f.name).split(/[^a-z]+/).filter((w) => w.length >= 4)
    const seen = new Set<string>()
    return words.flatMap((w) => searchDrugs(drugs, w, 6)).filter((d) => { const k = `${d.name}|${d.presentation}`; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 6)
  }, [f.name, drugs])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    setBusy(true)
    const pres = [f.form, f.presentation.trim()].filter(Boolean).join(' ')
    const d = await addClinicDrug({ name: f.name.trim(), brand: f.brand.trim() || undefined, presentation: pres || undefined, route: f.route || undefined })
    setBusy(false)
    if (d) onDone({ name: d.name, brand: d.brand, presentation: [d.presentation, d.concentration].filter(Boolean).join(' '), group: 'clínica', clinicId: d.id,
      usual: { dose: '', route: d.route ?? route ?? 'Oral', frequency: 'Cada 8 horas', duration: '' } })
  }
  return (
    <Modal title="Agregar al vademécum" className="vdm-add" onClose={onClose} footer={<>
      <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button type="button" className="btn btn--primary" disabled={f.name.trim().length < 2 || busy} onClick={save}><Plus size={16} />Guardar en el vademécum</button>
    </>}>
      {similar.length > 0 && (
        <div className="vdm-add__same">
          <b>¿Es este?</b>
          <ul>{similar.map((d) => <li key={`${d.name}|${d.presentation}`}>
            <button type="button" className="vdm-add__pick" onClick={() => onDone(d)}>{d.name}{d.presentation ? <small className="muted"> · {d.presentation}</small> : null}</button></li>)}</ul>
          <small className="muted">Elegir uno lo usa en el formulario sin crear otro.</small>
        </div>
      )}
      <div className="form-grid">
        <label className="field span-2"><span>Nombre genérico</span><input className="input" autoFocus value={f.name} onChange={set('name')} aria-required="true" /></label>
        <label className="field span-2"><span>Nombre comercial (opcional)</span><input className="input" value={f.brand} onChange={set('brand')} placeholder="Ej. Tylenol" /></label>
        <label className="field span-2"><span>Presentación</span><input className="input" value={f.presentation} onChange={set('presentation')} placeholder="Ej. 500 mg, 250 mg/5 ml" /></label>
        <label className="field"><span>Forma farmacéutica (opcional)</span><Combo value={f.form} onChange={(v) => set('form')(asChange(v))} options={[{ value: '', label: '—' }, ...FORMS]} /></label>
        <label className="field"><span>Vía</span><Combo value={f.route} onChange={(v) => set('route')(asChange(v))} options={[{ value: '', label: '—' }, ...ROUTES]} /></label>
      </div>
    </Modal>
  )
}
