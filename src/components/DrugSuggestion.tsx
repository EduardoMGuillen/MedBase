import { TriangleAlert } from 'lucide-react'
import type { Drug } from '../lib/catalogs'
import { normalize } from '../lib/patients'

export const UNCONFIRMED = 'Presentación por confirmar con farmacia'

/** ME5 (ronda 9): etiquetas pequeñas del LNME: «LNME», «Lista complementaria» y el aviso de las ⚠️. */
export function DrugTags({ d }: { d: Drug }) {
  if (!d.lnme) return null
  return (
    <span className="drug-tags">
      <span className="drug-tag" title={`Listado Nacional de Medicamentos Esenciales de Honduras 2023, #${d.lnme.no}`}>LNME</span>
      {d.lnme.complementary && <span className="drug-tag">Lista complementaria</span>}
      {d.lnme.unconfirmed && <span className="drug-tag drug-tag--warn" title={UNCONFIRMED} aria-label={UNCONFIRMED}><TriangleAlert size={11} />Por confirmar</span>}
    </span>
  )
}

/**
 * ME5: contenido de una sugerencia del vademécum (lo mismo en consulta externa y en las notas): nombre, comercial, el
 * alias con que se encontró, presentación, etiquetas del LNME y la restricción de uso como ayuda (no bloquea).
 */
export function DrugOption({ d, query = '', clinicTag }: { d: Drug; query?: string; clinicTag?: boolean }) {
  const q = normalize(query)
  // Si se encontró por un alias («Paracetamol»), se dice cuál
  const alias = q && !normalize(`${d.name} ${d.brand ?? ''}`).includes(q) ? d.aliases?.find((a) => normalize(a).includes(q)) : undefined
  return (<>
    <span style={{ minWidth: 0 }}>
      {d.name}{d.brand ? <small className="muted"> ({d.brand})</small> : null}{alias ? <small className="muted"> · {alias}</small> : null} <DrugTags d={d} />
      {d.lnme?.restriction && <small className="muted" style={{ display: 'block', fontSize: 12 }}>{d.lnme.restriction}</small>}
    </span>
    <span style={{ color: 'var(--muted)', marginLeft: 'auto', textAlign: 'right' }}>{d.presentation}{clinicTag && d.clinicId && !d.lnme?.own ? ' · de la clínica' : ''}</span>
  </>)
}

/**
 * ME5: debajo del campo, para el medicamento elegido: «También: …» (otras presentaciones habituales), el aviso de las ⚠️
 * y la restricción de uso. Sólo informa: todo sigue editable.
 */
export function DrugPickedHint({ drugs, name, presentation }: { drugs: Drug[]; name: string; presentation?: string }) {
  if (!name.trim()) return null
  const d = drugs.find((x) => x.lnme && normalize(x.name) === normalize(name) && (presentation === undefined || normalize(x.presentation) === normalize(presentation)))
  if (!d?.lnme) return null
  const { alternatives, unconfirmed, restriction } = d.lnme
  if (!alternatives?.length && !unconfirmed && !restriction) return null
  return (
    <small className="muted" style={{ display: 'block', fontSize: 12.5 }}>
      {alternatives?.length ? <>También: {alternatives.join(' · ')}</> : null}
      {unconfirmed && <span className="field__msg--warn" style={{ display: 'block' }}><TriangleAlert size={12} style={{ verticalAlign: '-2px' }} /> {UNCONFIRMED}</span>}
      {restriction && <span style={{ display: 'block' }}>{restriction}</span>}
    </small>
  )
}
