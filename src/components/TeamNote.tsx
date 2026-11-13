import { useEffect, useId, useState } from 'react'
import { StickyNote } from 'lucide-react'
import { useStore } from '../lib/store'
import { dmy, dmyTime } from '../lib/format'
import { TEAM_NOTE_MAX } from '../lib/clinicalConfig'
import type { Patient, TeamNoteVersion } from '../lib/types'

/**
 * NP1 (ronda 18): «Nota para el equipo» del paciente, debajo de sus etiquetas. La ve todo el personal; la agregan, cambian
 * o quitan médicos, enfermería y administración (el servidor lo exige). Cada cambio es una versión nueva: «Historial (n)»
 * las muestra. Es interna: lleva `no-print` y ningún documento la incluye.
 */
export function TeamNoteLine({ p }: { p: Patient }) {
  const { can, saveTeamNote, fetchTeamNoteHistory, notify } = useStore()
  const fieldId = useId()
  const note = p.teamNote
  const text = note?.text ?? ''
  const versions = note?.versions ?? 0
  const canEdit = can('patients.teamnote')
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<TeamNoteVersion[] | null>(null)

  // El historial se pide al abrirlo y otra vez cuando cambia la nota
  useEffect(() => {
    if (!open) return
    let live = true
    fetchTeamNoteHistory(p.id).then((h) => { if (live) setHistory(h) }).catch((e: Error) => notify(e.message, 'error'))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p.id, versions])

  // Sin nota, quien no puede escribirla no ve nada
  if (!text && !canEdit) return null

  const save = async (next: string) => {
    setBusy(true)
    const ok = await saveTeamNote(p.id, next)
    setBusy(false)
    if (ok) setDraft(null)
  }
  const clean = (draft ?? '').replace(/\s+/g, ' ').trim()
  const historyLink = versions > 0 && (
    <button type="button" className="ph-note__link" aria-expanded={open} onClick={() => setOpen(!open)}>Historial ({versions})</button>
  )

  return (
    <div className="ph-team no-print">
      {draft != null ? (
        <form className="ph-note ph-note--edit" onSubmit={(e) => { e.preventDefault(); if (clean && clean !== text && !busy) save(clean) }}>
          <label className="sr-only" htmlFor={fieldId}>Nota para el equipo</label>
          <textarea id={fieldId} className="textarea ph-note__input" rows={2} maxLength={TEAM_NOTE_MAX} autoFocus value={draft} aria-describedby={`${fieldId}-n`}
            placeholder="Ej. Debe ser atendido con su madre" onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDraft(null)
              // Es una sola línea: Enter guarda
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
            }} />
          <div className="ph-note__bar">
            <span id={`${fieldId}-n`} className="ph-note__count">{draft.length}/{TEAM_NOTE_MAX}</span>
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !clean || clean === text}>Guardar</button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setDraft(null)}>Cancelar</button>
            {text && <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => save('')}>Quitar nota</button>}
          </div>
        </form>
      ) : text ? (
        <div className="ph-note" role="note" aria-label="Nota para el equipo">
          <StickyNote size={15} aria-hidden />
          <div className="ph-note__body">
            {canEdit
              ? <button type="button" className="ph-note__text" title="Cambiar la nota para el equipo" onClick={() => setDraft(text)}>{text}</button>
              : <span className="ph-note__text">{text}</span>}
            <span className="ph-note__by">{note!.authorName} · {dmy(note!.at)}</span>
          </div>
          <div className="ph-note__links">
            {canEdit && <button type="button" className="ph-note__link" onClick={() => setDraft(text)}>Cambiar</button>}
            {historyLink}
          </div>
        </div>
      ) : (
        <div className="ph-note__links">
          <button type="button" className="ph-note__link" onClick={() => setDraft('')}>+ Agregar nota para el equipo</button>
          {historyLink}
        </div>
      )}
      {open && versions > 0 && (
        <ol className="ph-note__history" aria-label="Historial de la nota para el equipo">
          {history == null ? <li className="muted">Cargando el historial…</li> : history.map((v) => (
            <li key={v.id}>
              {v.text ? <span className="ph-note__old">{v.text}</span> : <i className="ph-note__old muted">Nota quitada</i>}
              <span className="ph-note__by">{v.authorName} · {dmyTime(v.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
