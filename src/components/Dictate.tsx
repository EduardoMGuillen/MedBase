import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Mic, Square } from 'lucide-react'
import { useStore } from '../lib/store'
import { Modal } from './ui'
import { DICTATION_MESSAGE, DICTATION_PRIVACY, dictationEngine, insertDictation } from '../lib/dictation'

const NOTICE = 'clinara.dictado.aviso'
const seen = () => { try { return !!localStorage.getItem(NOTICE) } catch { return false } }

/**
 * MC4 (ronda 5): micrófono de un campo de texto. Se toca para dictar («Escuchando…») y otra vez para terminar; lo
 * dictado se agrega en el lugar del cursor, sin borrar lo escrito, y queda en el borrador como lo escrito a mano. `onText`
 * recibe cómo cambiar el texto (para pasarlo directo al `setState` del campo). Si no se puede dictar, lo dice.
 */
export function DictateButton({ label, onText }: { label: string; onText: (update: (prev: string) => string) => void }) {
  const { notify } = useStore()
  const [listening, setListening] = useState(false)
  const [partial, setPartial] = useState('')
  const [asking, setAsking] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const session = useRef<{ stop: () => void } | null>(null)
  // Dónde va el siguiente pedazo de texto: el cursor del campo al empezar, y avanza con lo dictado
  const caret = useRef<number | null>(null)

  // Si se cierra la nota mientras escucha, se suelta el micrófono
  useEffect(() => () => session.current?.stop(), [])

  const field = () => btn.current?.closest('.dictate-field')?.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input')
  const begin = () => {
    const el = field()
    caret.current = el && document.activeElement === el ? el.selectionStart : el ? el.value.length : null
    setPartial('')
    setListening(true)
    session.current = dictationEngine.start({
      onPartial: setPartial,
      onFinal: (text) => onText((prev) => {
        const r = insertDictation(prev, text, caret.current ?? prev.length)
        caret.current = r.end
        return r.value
      }),
      onError: (e) => notify(DICTATION_MESSAGE[e], 'error'),
      onEnd: () => { setListening(false); setPartial(''); session.current = null },
    })
  }
  const toggle = () => {
    if (listening) { session.current?.stop(); return }
    if (!dictationEngine.supported()) { notify(DICTATION_MESSAGE.unsupported, 'error'); return }
    if (dictationEngine.sendsAudio && !seen()) { setAsking(true); return }
    begin()
  }
  const supported = dictationEngine.supported()

  return (
    <div className="dictate">
      {listening && <span className="dictate__status is-rec" role="status">Escuchando…{partial ? ` ${partial}` : ''}</span>}
      {/* El campo no pierde el foco al tocar el micrófono: así se sabe dónde estaba el cursor */}
      <button ref={btn} type="button" className={`dictate__btn${listening ? ' is-rec' : ''}${supported ? '' : ' is-off'}`} onMouseDown={(e) => e.preventDefault()} onClick={toggle}
        aria-label={listening ? `Terminar el dictado de ${label}` : `Dictar ${label}`}
        title={!supported ? DICTATION_MESSAGE.unsupported : listening ? 'Terminar el dictado' : 'Dictar con la voz'}>
        {listening ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}
      </button>
      {asking && (
        <Modal title="Antes de dictar" onClose={() => setAsking(false)} footer={<>
          <button className="btn btn--ghost" onClick={() => setAsking(false)}>Cancelar</button>
          <button className="btn btn--primary" onClick={() => { try { localStorage.setItem(NOTICE, new Date().toISOString()) } catch { /* sin almacenamiento */ } setAsking(false); begin() }}><Mic size={15} />Entendido, dictar</button>
        </>}>
          <p>{DICTATION_PRIVACY}</p>
          <p className="muted" style={{ fontSize: 14 }}>El texto dictado queda en el campo para que lo revises antes de firmar.</p>
        </Modal>
      )}
    </div>
  )
}

/** Un campo de texto con su micrófono abajo a la derecha. */
export function DictateField({ label, onText, children }: { label: string; onText: (update: (prev: string) => string) => void; children: ReactNode }) {
  return <div className="dictate-field">{children}<DictateButton label={label} onText={onText} /></div>
}
