import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { useStore, type Report } from '../lib/store'
import { Loading, PageHead } from '../components/ui'
import { BarChart, HBars } from '../components/Charts'
import { localISODate, METHOD_LABEL, money } from '../lib/format'

const PRESETS = [{ days: 7, label: '7 días' }, { days: 30, label: '30 días' }, { days: 90, label: '90 días' }]

export default function Reports() {
  const { fetchReport, settings, notify } = useStore()
  const [days, setDays] = useState(30)
  const [report, setReport] = useState<Report | null>(null)

  useEffect(() => {
    const to = new Date()
    const from = new Date(); from.setDate(from.getDate() - (days - 1))
    fetchReport(localISODate(from), localISODate(to)).then(setReport).catch((e: Error) => notify(e.message, 'error'))
  }, [days, fetchReport, notify])

  const cur = settings.currency
  const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })
  const long = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })

  const exportCsv = () => {
    if (!report) return
    const lines = [
      ['Fecha', 'Citas', 'Atendidas', 'Ingresos'].join(','),
      ...report.days.map((d) => [d.date, d.appointments, d.done, d.revenue.toFixed(2)].join(',')),
      '',
      ['Médico', 'Citas', 'Atendidas', 'No asistió', 'Ingresos'].join(','),
      ...report.byDoctor.map((d) => [`"${d.name}"`, d.appointments, d.done, d.noShow, d.revenue.toFixed(2)].join(',')),
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `reporte-${report.range.from}-a-${report.range.to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="page">
      <PageHead title="Reportes" sub="Actividad e ingresos de la clínica. No incluye información clínica de pacientes."
        actions={<>
          <div className="segmented" role="radiogroup" aria-label="Periodo">
            {PRESETS.map((p) => <button key={p.days} role="radio" aria-checked={days === p.days} onClick={() => { setReport(null); setDays(p.days) }}>{p.label}</button>)}
          </div>
          <button className="btn btn--ghost" disabled={!report} onClick={exportCsv}><Download size={16} />Exportar CSV</button>
        </>} />

      {!report ? <Loading label="Calculando indicadores" /> : (<>
        <div className="stats">
          <div className="stat"><b className="num">{money(report.totals.revenue, cur)}</b><span>Ingresos</span><small>Ticket promedio {money(report.totals.avgTicket, cur)}</small></div>
          <div className="stat"><b className="num">{report.totals.done}</b><span>Consultas atendidas</span><small>de {report.totals.appointments} citas</small></div>
          <div className="stat"><b className="num">{report.totals.attendance == null ? '—' : `${Math.round(report.totals.attendance * 100)}%`}</b><span>Asistencia</span>
            <small style={{ color: 'var(--muted)' }}>{report.totals.noShow} no asistieron</small></div>
          <div className="stat"><b className="num">{report.totals.online}</b><span>Reservas en línea</span><small style={{ color: 'var(--muted)' }}>{report.totals.newPatients} {report.totals.newPatients === 1 ? 'paciente nuevo' : 'pacientes nuevos'}</small></div>
        </div>

        <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <section className="panel panel__body">
            <BarChart title="Citas por día" valueLabel="Citas" data={report.days.map((d) => ({
              key: d.date, label: short(d.date), value: d.appointments, display: `${d.appointments} citas, ${d.done} atendidas`, tip: long(d.date),
            }))} />
          </section>
          <section className="panel panel__body">
            <BarChart title="Ingresos por día" valueLabel="Ingresos" data={report.days.map((d) => ({
              key: d.date, label: short(d.date), value: d.revenue, display: money(d.revenue, cur), tip: long(d.date),
            }))} />
          </section>
        </div>

        <div className="grid-2">
          {report.byDoctor.length > 1 && <section className="panel table-wrap">
            <div className="panel__head"><h2>Por médico</h2></div>
            <table className="table">
              <thead><tr><th>Médico</th><th style={{ textAlign: 'right' }}>Citas</th><th style={{ textAlign: 'right' }}>Atendidas</th><th style={{ textAlign: 'right' }}>No asistió</th><th style={{ textAlign: 'right' }}>Ingresos</th></tr></thead>
              <tbody>{report.byDoctor.map((d) => (
                <tr key={d.id}><td>{d.name}</td><td className="num" style={{ textAlign: 'right' }}>{d.appointments}</td><td className="num" style={{ textAlign: 'right' }}>{d.done}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{d.noShow}</td><td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{money(d.revenue, cur)}</td></tr>
              ))}</tbody>
            </table>
          </section>}
          <section className="panel">
            <div className="panel__head"><h2>Formas de pago</h2></div>
            <div className="panel__body">
              <HBars rows={report.byMethod.filter((m) => m.count).map((m) => ({ key: m.method, label: METHOD_LABEL[m.method], value: m.total, display: money(m.total, cur) }))} />
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="panel__head"><div><h2>Diagnósticos más frecuentes</h2><p>Conteo agregado de diagnósticos CIE-10 en consultas firmadas.</p></div></div>
          <div className="panel__body">
            {report.topDiagnoses.length
              ? <HBars rows={report.topDiagnoses.map((d) => ({ key: `${d.system ?? 'icd10'}:${d.code}:${d.label}`, label: `${d.code === 'S/C' ? '' : `${d.code} `}${d.label}${d.system ? '' : d.code === 'S/C' ? '' : ' (CIE-10)'}`, value: d.count, display: String(d.count) }))} />
              : <div className="empty">Sin consultas firmadas en este periodo.</div>}
          </div>
        </section>
      </>)}
    </div>
  )
}
