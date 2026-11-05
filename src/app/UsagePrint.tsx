import { Fragment } from 'react'
import { createPortal } from 'react-dom'
import { ClinicalDoc, placeOf } from '../components/ClinicalDoc'
import { useStore } from '../lib/store'
import { dmyTime } from '../lib/format'
import { byCategory, unitText } from '../lib/supplies'
import { byPatient, materialSums, materialTotals, medSummary, totalText, type MaterialRecord, type MedUse } from '../lib/usage'

/**
 * RU3 (ronda 14): el registro de uso impreso, con la plantilla de IM1 (Carta): título, periodo, área, quién y cuándo lo
 * imprimió. Una tabla con su encabezado repetido en cada hoja (thead), un bloque por paciente que no se corta y, al final, el
 * «Resumen» o el «Total del periodo». Espacio para la firma de quien entrega el turno y de quien lo recibe (sin raya).
 * Se dibuja fuera de la aplicación (portal) solo mientras se imprime.
 */
export function UsagePrint({ tab, meds, records, periodLabel, areaLabel, q, at }: {
  tab: 'meds' | 'material'; meds?: MedUse[]; records?: MaterialRecord[]; periodLabel: string; areaLabel: string; q: string; at: string
}) {
  const { settings, user } = useStore()
  const title = tab === 'meds' ? 'Registro de uso de medicamentos' : 'Registro de uso de material'
  const doc = (
    <ClinicalDoc kind="Registro de uso" at={at} place={placeOf(settings)} heading={title} className="usage-doc"
      rows={[{ label: 'Periodo', value: periodLabel }, { label: 'Área', value: areaLabel }, q && { label: 'Búsqueda', value: `«${q}»` },
        { label: 'Impreso por', value: `${user?.name ?? ''} el ${dmyTime(at)}` }]}
      signers={[{ label: 'Entrega el turno', name: '', title: 'Nombre y firma', small: true }, { label: 'Recibe el turno', name: '', title: 'Nombre y firma', small: true }]}
      legends={['Registro administrativo de enfermería: no es inventario ni cobro.']}>
      {tab === 'meds' ? <MedsPrint rows={meds ?? []} /> : <MaterialPrint records={records ?? []} />}
    </ClinicalDoc>
  )
  return createPortal(<div className="usage-print">{doc}</div>, document.body)
}

function MedsPrint({ rows }: { rows: MedUse[] }) {
  const blocks = byPatient(rows, (a, b) => a.at.localeCompare(b.at))
  const summary = medSummary(rows)
  if (!rows.length) return <p>No se aplicaron medicamentos en este periodo.</p>
  return (<>
    <table className="usage-print__table">
      <thead><tr><th style={{ width: '18%' }}>Fecha y hora</th><th>Medicamento</th><th style={{ width: '22%' }}>Aplicado por</th><th style={{ width: '19%' }}>Médico que lo indicó</th></tr></thead>
      {blocks.map((b) => (
        <tbody key={b.key}>
          <tr className="usage-print__pt"><th colSpan={4}>{b.name}<span>{b.record}{b.location ? ` · ${b.location}` : ''}</span></th></tr>
          {b.rows.map((r) => (
            <tr key={r.id}><td className="num">{dmyTime(r.at)}</td><td>{r.medication}</td><td>{r.appliedBy}{r.appliedByTitle && <small> · {r.appliedByTitle}</small>}</td><td>{r.orderedBy}</td></tr>
          ))}
        </tbody>
      ))}
    </table>
    <h2 className="usage-print__h">Resumen</h2>
    <table className="usage-print__table">
      <thead><tr><th>Medicamento y presentación</th><th style={{ width: '18%' }}>Aplicaciones</th><th style={{ width: '18%' }}>Total</th></tr></thead>
      <tbody>{summary.map((s) => <tr key={s.key}><td>{s.label}</td><td className="num">{s.count}</td><td className="num">{totalText(s)}</td></tr>)}</tbody>
    </table>
  </>)
}

function MaterialPrint({ records }: { records: MaterialRecord[] }) {
  const blocks = byPatient(records)
  const totals = materialTotals(records)
  if (!totals.length) return <p>No hay material registrado en este periodo.</p>
  return (<>
    <table className="usage-print__table">
      <thead><tr><th>Material</th><th style={{ width: '30%' }}>Variante</th><th style={{ width: '14%' }}>Cantidad</th><th style={{ width: '14%' }}>Unidad</th></tr></thead>
      {blocks.map((b) => {
        const sums = materialSums(b.rows).filter((s) => s.quantity > 0)
        if (!sums.length) return null
        return (
          <tbody key={b.key}>
            <tr className="usage-print__pt"><th colSpan={4}>{b.name}{!b.general && <span>{b.record}{b.location ? ` · ${b.location}` : ''}</span>}</th></tr>
            {sums.map((s) => <tr key={s.key}><td>{s.material}</td><td>{s.variant || '—'}</td><td className="num">{s.quantity}</td><td>{unitText(s.quantity, s.unit).replace(/^\d+ /, '')}</td></tr>)}
          </tbody>
        )
      })}
    </table>
    <h2 className="usage-print__h">Total del periodo</h2>
    <table className="usage-print__table">
      <thead><tr><th>Material</th><th style={{ width: '30%' }}>Variante</th><th style={{ width: '14%' }}>Cantidad</th><th style={{ width: '14%' }}>Unidad</th></tr></thead>
      {byCategory([...totals].sort((a, b) => a.category.localeCompare(b.category, 'es'))).map((g) => (
        <tbody key={g.category}>
          <tr className="usage-print__pt"><th colSpan={4}>{g.category}</th></tr>
          {g.rows.map((s) => <Fragment key={s.key}><tr><td>{s.material}</td><td>{s.variant || '—'}</td><td className="num">{s.quantity}</td><td>{unitText(s.quantity, s.unit).replace(/^\d+ /, '')}</td></tr></Fragment>)}
        </tbody>
      ))}
    </table>
  </>)
}
