import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

type Pt = { x: number; y: number }

/** Lo mínimo para aceptar una firma: no un punto ni una raya corta (en píxeles de pantalla). */
const MIN_LENGTH = 120
const MIN_BOX = 50
const MIN_POINTS = 15

/**
 * Recuadro para firmar con el dedo, el lápiz o el mouse. Mientras se dibuja, la página no se desplaza
 * (`touch-action: none`). Entrega la firma recortada como PNG transparente, o `null` si está vacía o es demasiado
 * corta para ser una firma.
 */
export function SignaturePad({ label, onChange, height = 190 }: { label: string; onChange: (png: string | null) => void; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Pt[][]>([])
  const drawing = useRef(false)
  const [state, setState] = useState<'empty' | 'short' | 'ok'>('empty')

  // El lienzo se ajusta al ancho real y a la densidad de la pantalla para que el trazo se vea nítido
  useEffect(() => {
    const c = canvas.current!
    const fit = () => {
      const r = c.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      redraw()
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  function redraw() {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#0e2233'
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of strokes.current) {
      ctx.beginPath()
      s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y)
      ctx.stroke()
    }
  }

  const point = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  /** Revisa si lo dibujado alcanza para una firma y, si alcanza, la entrega recortada. */
  function finish() {
    const all = strokes.current.flat()
    if (!all.length) { setState('empty'); onChange(null); return }
    let length = 0
    for (const s of strokes.current) for (let i = 1; i < s.length; i++) length += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y)
    const xs = all.map((p) => p.x)
    const ys = all.map((p) => p.y)
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    if (length < MIN_LENGTH || Math.hypot(box.w, box.h) < MIN_BOX || all.length < MIN_POINTS) { setState('short'); onChange(null); return }
    setState('ok')
    // Recorte con un margen, a 2× para que se vea bien impresa
    const pad = 8
    const k = 2
    const out = document.createElement('canvas')
    out.width = Math.ceil((box.w + 2 * pad) * k)
    out.height = Math.ceil((box.h + 2 * pad) * k)
    const ctx = out.getContext('2d')!
    ctx.scale(k, k)
    ctx.translate(pad - box.x, pad - box.y)
    ctx.strokeStyle = '#0e2233'
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of strokes.current) {
      ctx.beginPath()
      s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.stroke()
    }
    onChange(out.toDataURL('image/png'))
  }

  const clear = () => { strokes.current = []; redraw(); setState('empty'); onChange(null) }

  return (
    <div className="sigpad">
      <div className="sigpad__head">
        <span className="sigpad__label">{label}</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={clear} disabled={state === 'empty'}><Eraser size={14} />Borrar y volver a firmar</button>
      </div>
      <canvas ref={canvas} className={`sigpad__canvas sigpad__canvas--${state}`} style={{ height }} role="img" aria-label={`${label}: recuadro para firmar con el dedo, el lápiz o el mouse`}
        onPointerDown={(e) => {
          e.preventDefault()
          canvas.current!.setPointerCapture(e.pointerId)
          drawing.current = true
          strokes.current.push([point(e)])
          redraw()
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          e.preventDefault()
          const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
          const r = canvas.current!.getBoundingClientRect()
          strokes.current[strokes.current.length - 1].push(...events.map((x) => ({ x: x.clientX - r.left, y: x.clientY - r.top })))
          redraw()
        }}
        onPointerUp={() => { if (drawing.current) { drawing.current = false; finish() } }}
        onPointerCancel={() => { if (drawing.current) { drawing.current = false; finish() } }} />
      <small className={`sigpad__hint ${state === 'short' ? 'field__msg field__msg--error' : 'muted'}`}>
        {state === 'short' ? 'La firma es muy corta: un punto o una raya no cuentan. Borra y firma de nuevo.' : state === 'ok' ? 'Firma lista.' : 'Firma dentro del recuadro.'}
      </small>
    </div>
  )
}
