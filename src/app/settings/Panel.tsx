import { type ReactNode } from 'react'

/** Un panel con su título, para las secciones que juntan varios. */
export function Panel({ title, sub, children, tour }: { title: string; sub?: ReactNode; children: ReactNode; tour?: string }) {
  return (
    <section className="panel" data-tour={tour}>
      <div className="panel__head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div></div>
      {children}
    </section>
  )
}
