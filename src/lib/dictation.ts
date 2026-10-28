/**
 * Dictado de voz. El audio se graba y se transcribe en el navegador con Whisper (transformers.js) dentro de un
 * worker: nunca sale de la computadora ni se guarda. De internet sólo se descarga el modelo, una vez, desde
 * Hugging Face; el navegador lo deja en caché.
 */

/** Agrega lo dictado al final de lo escrito, separado por un espacio (o pegado tras un salto de línea). */
export function appendDictation(prev: string, text: string) {
  const t = text.trim()
  if (!t) return prev
  if (!prev.trim()) return t
  return prev.endsWith('\n') ? `${prev}${t}` : `${prev.trimEnd()} ${t}`
}

export { downloadPercent, modelFor } from './dictationModel.js'

export const recordingClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** El navegador puede grabar y correr el modelo. */
export const dictationSupported = () =>
  typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

// ---------- Motor: un solo worker y un solo modelo para toda la app ----------

type Listener = (pct: number | null) => void
let worker: Worker | null = null
let ready: Promise<void> | null = null
let seq = 0
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>()
const listeners = new Set<Listener>()

/** Avisa el avance de la descarga del modelo (null cuando ya está listo). */
export function onModelProgress(fn: Listener) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Empieza a cargar el modelo (la primera vez lo descarga). Se llama al empezar a grabar para ganar tiempo. */
export function loadModel() {
  if (ready) return ready
  worker = new Worker(new URL('./dictation.worker.ts', import.meta.url), { type: 'module' })
  ready = new Promise<void>((resolve, reject) => {
    worker!.onmessage = (e: MessageEvent) => {
      const m = e.data
      if (m.type === 'progress') listeners.forEach((l) => l(m.pct))
      else if (m.type === 'ready') { listeners.forEach((l) => l(null)); resolve() }
      else if (m.type === 'result') { pending.get(m.id)?.resolve(m.text); pending.delete(m.id) }
      else if (m.type === 'error') {
        const err = new Error(m.message)
        if (m.id != null) { pending.get(m.id)?.reject(err); pending.delete(m.id) }
        else { ready = null; worker?.terminate(); worker = null; listeners.forEach((l) => l(null)); reject(err) }
      }
    }
  })
  worker.postMessage({ type: 'load' })
  return ready
}

/** Transcribe audio mono a 16 kHz. */
export async function transcribe(audio: Float32Array) {
  await loadModel()
  const id = ++seq
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.postMessage({ type: 'transcribe', id, audio }, [audio.buffer])
  })
}

/** Convierte lo grabado (webm, mp4…) en audio mono a 16 kHz, que es lo que espera Whisper. */
export async function decodeRecording(blob: Blob) {
  const ctx = new AudioContext({ sampleRate: 16000 })
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    // Copia: el canal del AudioBuffer no se puede transferir al worker
    if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice()
    const a = buf.getChannelData(0), b = buf.getChannelData(1), out = new Float32Array(a.length)
    for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2
    return out
  } finally {
    void ctx.close()
  }
}
