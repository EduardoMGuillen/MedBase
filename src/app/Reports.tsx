import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { useStore, type Report } from '../lib/store'
import { Loading, PageHead } from '../components/ui'
import { Pagination, paginate, usePage } from '../components/Pagination'
import { BarChart, HBars } from '../components/Charts'
import { localISODate, METHOD_LABEL, money } from '../lib/format'
import { monthLabel, periodFromParams, periodRange, REPORT_PRESETS, shiftMonth, type ReportPeriod } from '../lib/reportPeriod'

export default function Reports() {
  const { fetchReport, settings, notify } = useStore()
  // RP2 (ronda 18): el periodo vive en la dirección (`?periodo=mes&mes=2026-11`): «Atrás» y recargar lo mantienen
  const [params, setParams] = useSearchParams()
  const [today] = useState(() => localISODate(new Date()))
  const period = periodFromParams(params, today)
  const { from, to } = periodRange(period, today)
  const month = period.kind === 'month' ? period.month : null
  const key = `${from}_${to}_${period.kind}`
  const [loaded, setLoaded] = useState<{ key: string; report: Report } | null>(null)
  const report = loaded?.key === key ? loaded.report : null

  useEffect(() => {
    let stale = false
    fetchReport(from, to).then((r) => { if (!stale) setLoaded({ key, report: r }) }).catch((e: Error) => notify(e.message, 'error'))
    return () => { stale = true }
  }, [from, to, key, fetchReport, notify])

  const setPeriod = (p: ReportPeriod) => setParams((prev) => {
    const n = new URLSearchParams(prev)
    n.delete('pagina'); n.delete('periodo'); n.delete('mes')
    if (p.kind === 'month') { n.set('periodo', 'mes'); n.set('mes', p.month) }
    else if (p.days !== 30) n.set('periodo', String(p.days))
    return n
  })

  const cur = settings.currency
  // GE5 (ronda 10): las tablas del reporte, por páginas
  const [doctorsPageNo, setDoctorsPage] = usePage(key)
  const doctorsPage = paginate(report?.byDoctor ?? [], doctorsPageNo)
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
    a.download = month ? `reporte_${month}.csv` : `reporte-${report.range.from}-a-${report.range.to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="page">
      <PageHead tour="reportes" title="Reportes" sub="Actividad e ingresos de la clínica. No incluye información clínica de pacientes."
        actions={<>
          <div className="segmented" role="radiogroup" aria-label="Periodo">
            {REPORT_PRESETS.map((p) => <button key={p.days} role="radio" aria-checked={period.kind === 'days' && period.days === p.days}
              onClick={() => setPeriod({ kind: 'days', days: p.days })}>{p.label}</button>)}
            <button role="radio" aria-checked={month !== null} onClick={() => setPeriod({ kind: 'month', month: today.slice(0, 7) })}>Mes</button>
          </div>
          {month && <div className="month-nav" role="group" aria-label="Mes del reporte">
            <button type="button" aria-label="Mes anterior" onClick={() => setPeriod({ kind: 'month', month: shiftMonth(month, -1) })}>‹</button>
            <span aria-live="polite">{monthLabel(month)}</span>
            <button type="button" aria-label="Mes siguiente" disabled={month >= today.slice(0, 7)} onClick={() => setPeriod({ kind: 'month', month: shiftMonth(month, 1) })}>›</button>
          </div>}
          <button className="btn btn--ghost" disabled={!report} onClick={exportCsv}><Download size={16} />Exportar CSV</button>
        </>} />

      {!report ? <Loading label="Calculando indicadores" /> : (<>
        <div className="stats">
          <div className="stat"><b className="num">{money(report.totals.revenue, cur)}</b><span>Ingresos</span><small>Ticket promedio {money(report.totals.avgTicket, cur)}</small></div>
          <div className="stat"><b className="num">{report.totals.done}</b><span>Consultas atendidas</span><small>de {report.totals.appointments} citas</small></div>
          <div className="stat"><b className="num">{report.totals.attendance == null ? '—' : `${Math.round(report.totals.attendance * 100)}%`}</b><span>Asistencia</span>
            <small className="c-muted">{report.totals.noShow} no asistieron</small></div>
          <div className="stat"><b className="num">{report.totals.online}</b><span>Reservas en línea</span><small className="c-muted">{report.totals.newPatients} {report.totals.newPatients === 1 ? 'paciente nuevo' : 'pacientes nuevos'}</small></div>
        </div>

        <div className="grid-2 grid-2--even">
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
            <table className="table table--sticky">
              <thead><tr><th>Médico</th><th className="ta-r">Citas</th><th className="ta-r">Atendidas</th><th className="ta-r">No asistió</th><th className="ta-r">Ingresos</th></tr></thead>
              <tbody>{doctorsPage.rows.map((d) => (
                <tr key={d.id}><td>{d.name}</td><td className="num ta-r">{d.appointments}</td><td className="num ta-r">{d.done}</td>
                  <td className="num ta-r">{d.noShow}</td><td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{money(d.revenue, cur)}</td></tr>
              ))}</tbody>
            </table>
            <Pagination {...doctorsPage} onPage={setDoctorsPage} label="Páginas del reporte por médico" />
          </section>}
          <section className="panel">
            <div className="panel__head"><h2>Formas de pago</h2></div>
            <div className="panel__body">
              <HBars rows={report.byMethod.filter((m) => m.count).map((m) => ({ key: m.method, label: METHOD_LABEL[m.method], value: m.total, display: money(m.total, cur) }))} />
            </div>
          </section>
          {report.byService.length > 0 && <section className="panel">
            <div className="panel__head"><div><h2>Por servicio</h2><p>Lo cobrado por cada servicio en el periodo (con su parte de los descuentos).</p></div></div>
            <div className="panel__body">
              <HBars rows={report.byService.slice(0, 10).map((s) => ({ key: s.name, label: `${s.name} (${s.count})`, value: s.total, display: money(s.total, cur) }))} />
            </div>
          </section>}
        </div>

        <section className="panel">
          <div className="panel__head"><div><h2>Diagnósticos más frecuentes</h2><p>Conteo agregado de diagnósticos en consultas firmadas.</p></div></div>
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
