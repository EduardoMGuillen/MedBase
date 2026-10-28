import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, Square } from 'lucide-react'
import { useStore } from '../lib/store'
import { decodeRecording, dictationSupported, loadModel, onModelProgress, recordingClock, transcribe } from '../lib/dictation'

const MAX_SECONDS = 120

/**
 * Micrófono de un campo de texto: se toca para grabar y otra vez para terminar. Lo dictado se transcribe en esta
 * computadora y se entrega con `onText` para agregarlo al campo; el médico lo revisa antes de guardar.
 */
export function DictateButton({ label, onText }: { label: string; onText: (text: string) => void }) {
  const { notify } = useStore()
  const [state, setState] = useState<'idle' | 'recording' | 'working'>('idle')
  const [secs, setSecs] = useState(0)
  const [pct, setPct] = useState<number | null>(null)
  const rec = useRef<MediaRecorder | null>(null)

  useEffect(() => onModelProgress(setPct), [])
  useEffect(() => {
    if (state !== 'recording') return
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [state])
  useEffect(() => { if (state === 'recording' && secs >= MAX_SECONDS) rec.current?.stop() }, [state, secs])
  // Si se cierra la nota mientras graba, se suelta el micrófono
  useEffect(() => () => { if (rec.current?.state === 'recording') rec.current.stop() }, [])

  if (!dictationSupported()) return null

  const start = async () => {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
    } catch {
      notify('Permite el uso del micrófono en el navegador para dictar.', 'error')
      return
    }
    // El modelo se carga mientras se habla: la primera vez se descarga
    loadModel().catch((e: Error) => notify(e.message, 'error'))
    const chunks: Blob[] = []
    const r = new MediaRecorder(stream)
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      rec.current = null
      setState('working')
      try {
        const text = (await transcribe(await decodeRecording(new Blob(chunks, { type: r.mimeType })))).trim()
        if (text) onText(text)
        else notify('No se entendió lo dictado. Intenta de nuevo, más cerca del micrófono.', 'error')
      } catch (e) {
        notify((e as Error).message, 'error')
      } finally {
        setState('idle')
      }
    }
    rec.current = r
    setSecs(0)
    r.start()
    setState('recording')
  }

  const status = state === 'recording' ? `Grabando ${recordingClock(secs)}`
    : state === 'working' ? (pct != null && pct < 100 ? `Descargando el modelo de voz (sólo la primera vez) ${pct}%` : 'Transcribiendo…') : null

  return (
    <div className="dictate">
      {status && <span className={`dictate__status${state === 'recording' ? ' is-rec' : ''}`} role="status">{status}</span>}
      <button type="button" className={`dictate__btn${state === 'recording' ? ' is-rec' : ''}`} disabled={state === 'working'}
        onClick={() => (state === 'recording' ? rec.current?.stop() : start())}
        aria-label={state === 'recording' ? `Terminar el dictado de ${label}` : `Dictar ${label}`} title={state === 'recording' ? 'Terminar el dictado' : 'Dictar con la voz'}>
        {state === 'recording' ? <Square size={14} fill="currentColor" /> : state === 'working' ? <LoaderCircle size={16} className="spin" /> : <Mic size={16} />}
      </button>
    </div>
  )
}
