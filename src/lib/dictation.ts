/**
 * Dictado de voz (MC4, ronda 5) con el reconocimiento de voz del navegador (Web Speech API: `SpeechRecognition`). En
 * Chrome y Edge el audio se envía al servicio de voz del navegador para convertirlo en texto: necesita internet y se le
 * avisa al médico la primera vez. Antes se transcribía dentro del navegador con Whisper, pero la primera vez tenía que
 * descargar un modelo de 240 a 390 MB y en una computadora sin tarjeta gráfica tardaba más que lo dictado: en la
 * práctica, no funcionaba.
 *
 * Las pantallas no conocen el motor: piden `dictationEngine`. Para usar más adelante un servicio de transcripción (o
 * uno dentro del equipo) se agrega otro motor con la misma forma; no se cambia ningún campo.
 */

/** Por qué no se pudo dictar. */
export type DictationError = 'unsupported' | 'offline' | 'denied' | 'no-mic' | 'no-speech' | 'network' | 'failed'

/** Mensajes visibles (en español) de cada falla. */
export const DICTATION_MESSAGE: Record<DictationError, string> = {
  unsupported: 'Tu navegador no admite dictado; usa Chrome o Edge.',
  offline: 'El dictado necesita internet.',
  denied: 'Permite el micrófono en el navegador: toca el candado junto a la dirección y activa el micrófono.',
  'no-mic': 'No se encontró un micrófono. Conéctalo y vuelve a intentar.',
  'no-speech': 'No se escuchó nada. Intenta de nuevo, más cerca del micrófono.',
  network: 'El dictado necesita internet: se perdió la conexión con el servicio de voz.',
  failed: 'No se pudo dictar. Intenta de nuevo.',
}

/** Aviso de privacidad que se muestra la primera vez (VALIDAR POR EMIL). */
export const DICTATION_PRIVACY = 'El dictado envía el audio al servicio de voz del navegador (Google en Chrome, Microsoft en Edge) para convertirlo en texto. No se guarda en Clinara. Si no lo deseas, no dictes nombres, identidades ni otros datos que identifiquen al paciente.'

export interface DictationHandlers {
  /** Lo que se va entendiendo (todavía puede cambiar). */
  onPartial: (text: string) => void
  /** Una frase ya confirmada: se agrega al campo. */
  onFinal: (text: string) => void
  onError: (e: DictationError) => void
  /** Terminó (porque se tocó de nuevo el micrófono, por un silencio largo o por un error). */
  onEnd: () => void
}

export interface DictationEngine {
  id: string
  /** El audio sale del equipo (se avisa la primera vez). */
  sendsAudio: boolean
  supported: () => boolean
  start: (h: DictationHandlers) => { stop: () => void }
}

/** Español de Honduras y, si el navegador no lo tiene, otras variantes de español. */
export const DICTATION_LANGS = ['es-HN', 'es-419', 'es-MX', 'es-US', 'es-ES']

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void; stop: () => void; abort: () => void
}
type RecognitionCtor = new () => Recognition
const recognitionCtor = (): RecognitionCtor | undefined => {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Traduce los errores de la Web Speech API. `language-not-supported` no llega aquí: se prueba la siguiente variante. */
export function dictationError(code: string): DictationError {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'denied'
  if (code === 'audio-capture') return 'no-mic'
  if (code === 'no-speech') return 'no-speech'
  if (code === 'network') return 'network'
  return 'failed'
}

/** Motor del navegador (Chrome, Edge, Safari): resultados en vivo, en español, hasta que se toca de nuevo el micrófono. */
export const browserEngine: DictationEngine = {
  id: 'navegador',
  sendsAudio: true,
  supported: () => !!recognitionCtor(),
  start(h) {
    const Ctor = recognitionCtor()
    if (!Ctor) { h.onError('unsupported'); h.onEnd(); return { stop: () => {} } }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { h.onError('offline'); h.onEnd(); return { stop: () => {} } }
    let current: Recognition | null = null
    let stopped = false
    const run = (i: number) => {
      const r = new Ctor()
      current = r
      let switching = false
      r.lang = DICTATION_LANGS[i]
      r.continuous = true
      r.interimResults = true
      r.maxAlternatives = 1
      r.onresult = (e) => {
        let partial = ''
        for (let k = e.resultIndex; k < e.results.length; k++) {
          const res = e.results[k]
          if (res.isFinal) h.onFinal(res[0].transcript)
          else partial += res[0].transcript
        }
        h.onPartial(partial)
      }
      r.onerror = (e) => {
        if (e.error === 'language-not-supported' && i + 1 < DICTATION_LANGS.length) { switching = true; return }
        if (e.error === 'aborted') return
        h.onError(dictationError(e.error))
      }
      r.onend = () => {
        if (switching && !stopped) { run(i + 1); return }
        h.onEnd()
      }
      r.start()
    }
    try { run(0) } catch { h.onError('failed'); h.onEnd() }
    return { stop: () => { stopped = true; current?.stop() } }
  },
}

/** El motor que usan los campos con micrófono. */
export const dictationEngine: DictationEngine = browserEngine

/**
 * Agrega lo dictado en el lugar del cursor sin borrar lo escrito: separado por un espacio de lo que hay antes y después
 * (o pegado tras un salto de línea). Devuelve el texto nuevo y dónde queda el cursor.
 */
export function insertDictation(prev: string, text: string, at = prev.length): { value: string; end: number } {
  const t = text.trim()
  if (!t) return { value: prev, end: at }
  const pos = Math.max(0, Math.min(at, prev.length))
  const before = prev.slice(0, pos)
  const after = prev.slice(pos)
  const lead = !before || /\s$/.test(before) ? '' : ' '
  const piece = `${lead}${!before.trim() ? t.charAt(0).toUpperCase() + t.slice(1) : t}`
  const tail = after && !/^\s/.test(after) ? ' ' : ''
  return { value: `${before}${piece}${tail}${after}`, end: pos + piece.length }
}
