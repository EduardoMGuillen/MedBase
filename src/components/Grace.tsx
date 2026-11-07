import { useEffect, useState, type ReactNode } from 'react'
import { History, PencilLine } from 'lucide-react'
import { api, serverNow } from '../lib/api'
import { dmyTime, time } from '../lib/format'
import { useStore } from '../lib/store'
import { Modal } from './ui'
import type { Correctable } from '../lib/types'

/**
 * GE4 (ronda 9): periodo de gracia. «Corregir» sólo para el autor y mientras no vence (hora del servidor); el botón
 * desaparece solo al vencer, sin recargar. «Corregida · vN» y «Ver versiones» cuando hubo correcciones.
 */
export type VersionKind = 'note' | 'dose' | 'vitals' | 'consultation' | 'exam_result' | 'anesthesia' | 'preanesthesia' | 'surgical_count' | 'fluid_entry'

/** ¿Puede corregirlo esta persona ahora? Se vuelve a evaluar cada pocos segundos y al llegar al límite. */
export function useGrace(until: string | undefined, authorId: string | undefined) {
  const { user } = useStore()
  const mine = !!until && !!user && user.id === authorId
  const left = () => (mine ? new Date(until!).getTime() - serverNow().getTime() : 0)
  const [open, setOpen] = useState(() => left() > 0)
  useEffect(() => {
    if (!mine) { setOpen(false); return }
    const tick = () => setOpen(left() > 0)
    tick()
    const t = setInterval(tick, 5_000)
    const end = setTimeout(tick, Math.max(0, left()) + 50)
    return () => { clearInterval(t); clearTimeout(end) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, until])
  return open
}

/** «Corregir» y «Corregible hasta HH:mm». No se muestra si no es del autor o si ya venció. */
export function GraceButton({ record, authorId, onCorrect }: { record: Correctable; authorId: string | undefined; onCorrect: () => void }) {
  const open = useGrace(record.graceUntil, authorId)
  if (!open) return null
  return (
    <span className="grace">
      <button type="button" className="btn btn--soft btn--sm" onClick={onCorrect}><PencilLine size={14} />Corregir</button>
      <small className="muted">Corregible hasta {time(record.graceUntil!)}</small>
    </span>
  )
}

interface Version { version: number; data: Record<string, unknown>; authorId: string; at: string; replacedBy: string; replacedAt: string; reason?: string }

/** «Corregida · v2» y «Ver versiones» (las anteriores en solo lectura). Con una sola versión no aparece nada. */
export function VersionTag({ version, kind, id, render }: { version?: number; kind: VersionKind; id: string; render?: (data: Record<string, unknown>) => ReactNode }) {
  const { staffById } = useStore()
  const [list, setList] = useState<Version[] | null>(null)
  if (!version || version < 2) return null
  return (<>
    <span className="badge version-tag">Corregida · v{version}</span>
    <button type="button" className="btn btn--ghost btn--sm version-link" onClick={() => api<Version[]>(`/versions/${kind}/${id}`).then(setList).catch(() => setList([]))}><History size={13} />Ver versiones</button>
    {list && (
      <Modal title="Versiones anteriores" onClose={() => setList(null)} footer={<button className="btn btn--primary" onClick={() => setList(null)}>Cerrar</button>}>
        <p className="c-muted mt-0">Solo lectura. Lo que se ve y se imprime es la versión {version}.</p>
        {list.map((v) => (
          <section key={v.version} className="version-item">
            <h4>Versión {v.version} · {staffById(v.authorId)?.name ?? ''} · {dmyTime(v.at)}</h4>
            <small className="muted">Reemplazada por {staffById(v.replacedBy)?.name ?? ''} el {dmyTime(v.replacedAt)}{v.reason ? `. Motivo de la corrección: ${v.reason}` : ''}</small>
            <div className="version-item__body">{render ? render(v.data) : <pre>{JSON.stringify(v.data, null, 2)}</pre>}</div>
          </section>
        ))}
        {!list.length && <p className="muted">No hay versiones anteriores.</p>}
      </Modal>
    )}
  </>)
}

/** «Motivo de la corrección» (opcional) para el pie de los formularios de corrección. */
export function CorrectionReason({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <label className="field"><span>Motivo de la corrección (opcional)</span><input className="input" value={value} maxLength={300} onChange={(e) => onChange(e.target.value)} placeholder="Ej. error de dedo en la hora" /></label>
}
