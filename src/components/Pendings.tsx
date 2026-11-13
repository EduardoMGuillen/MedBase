import { Link } from 'react-router-dom'
import { alertQuery, type FileAlert } from '../lib/alerts'
import { OWNER_LABEL, PENDING_TYPES, type PendingType } from '../lib/pendings'
import type { StayPendings } from '../lib/ward'

const MAX = 3

/** Varias alertas del mismo tipo (dosis atrasadas de dos medicamentos) son una sola etiqueta con la suma. */
function chips(mine: FileAlert[]) {
  const by = new Map<PendingType, FileAlert[]>()
  for (const a of mine) by.set(a.type, [...(by.get(a.type) ?? []), a])
  return [...by.entries()].map(([type, list]) => {
    const n = list.reduce((s, a) => s + a.count, 0)
    return { type, first: list[0], text: list.length > 1 ? PENDING_TYPES[type].many(n) : list[0].chip }
  })
}

/**
 * PD2 (ronda 18): la celda «Pendientes» de Hospitalizados y Observación: las etiquetas de los pendientes DE QUIEN MIRA, cortas y
 * con color por tipo (hasta 3 y «+N»); cada una abre el expediente en la pestaña donde se resuelve. Debajo, en gris, cuántos
 * hay de otros roles («Otros: Médico 2»). Sin nada: «—».
 */
export function PendingChips({ p, to }: { p?: StayPendings; to: string }) {
  if (!p) return <span className="muted">…</span>
  const list = chips(p.mine)
  const others = new Map<string, number>()
  for (const a of p.others) for (const o of a.owners) others.set(OWNER_LABEL[o], (others.get(OWNER_LABEL[o]) ?? 0) + 1)
  if (!list.length && !others.size) return <span className="muted">—</span>
  return (
    <div className="pend">
      {list.length > 0 && <div className="pend__chips">
        {list.slice(0, MAX).map((c) => <Link key={c.type} className={`badge badge--${PENDING_TYPES[c.type].tone} pend__chip`} to={`${to}?${alertQuery(c.first.action.go)}`}>{c.text}</Link>)}
        {list.length > MAX && <Link className="badge pend__chip" to={to} title={list.slice(MAX).map((c) => c.text).join(', ')}>+{list.length - MAX}</Link>}
      </div>}
      {!list.length && <span className="muted">—</span>}
      {others.size > 0 && <small className="pend__others">Otros: {[...others.entries()].map(([k, n]) => `${k} ${n}`).join(' · ')}</small>}
    </div>
  )
}
