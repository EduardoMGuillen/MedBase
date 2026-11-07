import { useEffect, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Download, Printer } from 'lucide-react'
import { useStore } from '../lib/store'

/**
 * PQ3 (ronda 14), PQ4 y PQ5 (ronda 16): piezas de los documentos quirúrgicos impresos (registro de anestesia, valoración
 * preanestésica y recuento quirúrgico) dentro de la plantilla de IM1: secciones con rótulo, datos con su línea para llenar a
 * mano, casillas, la barra «Imprimir / Descargar PDF» y la impresión automática con «?accion=imprimir».
 */

export const Blank = ({ long }: { long?: boolean }) => <span className={`anes-blank${long ? ' anes-blank--long' : ''}`} />
/** Un dato: lo escrito o, en la hoja en blanco, la línea para llenarlo. */
export function F({ label, value, unit, wide, wide2, long, area, lines = 1 }: { label: string; value?: string; unit?: string; wide?: boolean; wide2?: boolean; long?: boolean; area?: boolean; lines?: number }) {
  return <div className={`anes-f${wide ? ' anes-f--wide' : ''}${wide2 ? ' anes-f--w2' : ''}`}><i>{label}:</i>{value ? <span className="anes-v">{value}{unit ? ` ${unit}` : ''}</span>
    : area ? <span className="anes-blank--area" style={lines > 1 ? { height: `${lines * 1.45}em` } : undefined} /> : <><Blank long={long} />{unit ? ` ${unit}` : ''}</>}</div>
}
/** Casilla marcada o vacía. */
export const Box = ({ on, children }: { on?: boolean; children: ReactNode }) => <span className={`anes-box${on ? ' anes-box--on' : ''}`}><b>{on ? '☒' : '☐'}</b>{children}</span>
export const Sec = ({ title, cols, extra, className = '', children }: { title: string; cols?: 2 | 3 | 4 | 6; extra?: ReactNode; className?: string; children: ReactNode }) =>
  <section className={`anes-sec ${className}`}><h3>{title}{extra && <span className="anes-sec__extra">{extra}</span>}</h3><div className={`anes-sec__body${cols ? ` anes-sec__body--${cols}` : ''}`}>{children}</div></section>

/** Imprimir o descargar en PDF; «?accion=imprimir» abre la ventana de impresión al cargar. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAutoPrint(ready: boolean) {
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (!ready || params.get('accion') !== 'imprimir') return
    const q = new URLSearchParams(params); q.delete('accion'); setParams(q, { replace: true })
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])
}

export function PrintBar({ title, hint = 'Hoja Carta. Sin la firma y el sello del anestesiólogo en papel no vale.', children }: { title: string; hint?: string; children?: ReactNode }) {
  const { notify } = useStore()
  const nav = useNavigate()
  return (<>
    <div className="page-head no-print"><button className="btn btn--ghost" onClick={() => nav(-1)}><ChevronLeft size={16} />Volver</button>{children}</div>
    <div className="exam-order__bar no-print"><div className="exam-order__acts">
      <b>{title}</b>
      <button className="btn btn--primary btn--sm anes-btn" onClick={() => window.print()}><Printer size={15} />Imprimir</button>
      <button className="btn btn--soft btn--sm anes-btn" onClick={() => { notify('En la ventana de impresión elige «Guardar como PDF».'); setTimeout(() => window.print(), 150) }}><Download size={15} />Descargar PDF</button>
    </div><small className="muted">{hint}</small></div>
  </>)
}

/** Cuando un documento no se puede abrir (sin permiso, no existe). */
export const DocError = ({ title, error }: { title: string; error: string }) =>
  <div className="page"><section className="panel"><div className="empty"><b>{title}</b> {error} <Link to="/app">Volver al inicio</Link></div></section></div>
