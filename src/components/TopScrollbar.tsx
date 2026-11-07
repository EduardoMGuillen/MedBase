import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/**
 * AG1 (ronda 16): barra de desplazamiento horizontal también arriba de un contenido ancho (la agenda con todos los médicos),
 * sincronizada con la de abajo: mover una mueve la otra (también con la rueda o el trackpad). Solo aparece cuando el contenido
 * no cabe a lo ancho. `children` es el contenedor que se desplaza (con overflow-x: auto); se le pasa el ref.
 *
 * Pendiente R16 (ronda 17): con `head`, la cabecera (los nombres de los médicos) y la barra de arriba quedan fijas arriba al
 * bajar la página. Un contenedor con overflow-x: auto no deja que algo de adentro quede fijo contra el desplazamiento de la
 * página, así que la cabecera va afuera, en su propio bloque fijo (position: sticky), y copia la posición horizontal del
 * contenido. Así la agenda sigue desplazándose con la página, sin alto fijo ni desplazamiento interno.
 */
export function TopScrollbar({ children, head }: {
  children: (ref: RefObject<HTMLElement | null>) => ReactNode
  head?: (ref: RefObject<HTMLDivElement | null>) => ReactNode
}) {
  const main = useRef<HTMLElement | null>(null)
  const top = useRef<HTMLDivElement | null>(null)
  const headRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [overflow, setOverflow] = useState(false)
  useEffect(() => {
    const el = main.current
    if (!el) return
    const measure = () => { setWidth(el.scrollWidth); setOverflow(el.scrollWidth > el.clientWidth + 1) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    // Evita el bucle: cada lado solo copia la posición si es distinta
    const fromMain = () => {
      if (top.current && top.current.scrollLeft !== el.scrollLeft) top.current.scrollLeft = el.scrollLeft
      if (headRef.current) headRef.current.scrollLeft = el.scrollLeft
    }
    el.addEventListener('scroll', fromMain, { passive: true })
    return () => { ro.disconnect(); el.removeEventListener('scroll', fromMain) }
  }, [])
  // Al aparecer la barra, que arranque en la misma posición que la de abajo
  useEffect(() => {
    if (!main.current) return
    if (overflow && top.current) top.current.scrollLeft = main.current.scrollLeft
    if (headRef.current) headRef.current.scrollLeft = main.current.scrollLeft
  }, [overflow, width])
  const fromTop = () => { const el = main.current; if (el && top.current && el.scrollLeft !== top.current.scrollLeft) el.scrollLeft = top.current.scrollLeft }
  const bar = (
    <div ref={top} className="top-scroll" style={overflow ? undefined : { display: 'none' }} onScroll={fromTop} aria-hidden="true">
      <div style={{ width }} />
    </div>
  )
  return (
    <>
      {head ? <div className="sticky-head">{bar}{head(headRef)}</div> : bar}
      {children(main)}
    </>
  )
}
