import { useState } from 'react'

export interface Bar { key: string; label: string; value: number; display: string; tip: string }

/** Barras verticales de una sola serie: una barra por día, con tooltip y vista de tabla. */
export function BarChart({ data, title, valueLabel, height = 180 }: { data: Bar[]; title: string; valueLabel: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const max = Math.max(1, ...data.map((d) => d.value))
  // Marcas del eje: 0, la mitad y el máximo redondeado
  const nice = niceMax(max)
  const every = Math.ceil(data.length / 8)

  return (
    <figure className="chart">
      <figcaption className="chart__head">
        <h3>{title}</h3>
        <button className="btn btn--ghost btn--sm" onClick={() => setAsTable((t) => !t)}>{asTable ? 'Ver gráfica' : 'Ver tabla'}</button>
      </figcaption>
      {asTable ? (
        <div className="table-wrap chart__table">
          <table className="table"><thead><tr><th>Fecha</th><th style={{ textAlign: 'right' }}>{valueLabel}</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.key}><td>{d.tip}</td><td className="num" style={{ textAlign: 'right' }}>{d.display}</td></tr>)}</tbody></table>
        </div>
      ) : (
        <div className="chart__plot" style={{ height }} onMouseLeave={() => setHover(null)}>
          <div className="chart__grid" aria-hidden="true">
            {[1, 0.5, 0].map((f) => <span key={f} style={{ bottom: `${f * 100}%` }}><em>{fmtAxis(nice * f)}</em></span>)}
          </div>
          <div className="chart__bars" role="list" aria-label={title}>
            {data.map((d, i) => (
              <div key={d.key} className="chart__col" role="listitem" tabIndex={0} aria-label={`${d.tip}: ${d.display}`}
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                <div className={`chart__bar ${hover === i ? 'is-hover' : ''}`} style={{ height: `${(d.value / nice) * 100}%` }} />
                {hover === i && (
                  <div className={`chart__tip ${i > data.length * 0.7 ? 'chart__tip--left' : ''}`} role="tooltip" style={{ bottom: `calc(${Math.min(100, (d.value / nice) * 100)}% + 8px)` }}>
                    <span>{d.tip}</span><b>{d.display}</b>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="chart__x" aria-hidden="true">
            {data.map((d, i) => <span key={d.key}>{i % every === 0 ? d.label : ''}</span>)}
          </div>
        </div>
      )}
    </figure>
  )
}

/** Barras horizontales para comparar categorías (médicos, diagnósticos). */
export function HBars({ rows }: { rows: { key: string; label: string; value: number; display: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.key} className="hbar">
          <span className="hbar__label">{r.label}</span>
          <div className="hbar__track"><div className="hbar__fill" style={{ width: `${(r.value / max) * 100}%` }} /></div>
          <b className="num">{r.display}</b>
        </div>
      ))}
    </div>
  )
}

function niceMax(v: number) {
  const exp = 10 ** Math.floor(Math.log10(v))
  const f = v / exp
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp
}

function fmtAxis(v: number) {
  return v >= 1000 ? `${(v / 1000).toLocaleString('es-HN', { maximumFractionDigits: 1 })} mil` : v.toLocaleString('es-HN', { maximumFractionDigits: 0 })
}
