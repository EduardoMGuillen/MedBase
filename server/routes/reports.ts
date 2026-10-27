import type { Express } from 'express'
import { z } from 'zod'
import { type Ctx, fail, localDate, parse, type Row } from '../http.js'

/** Indicadores agregados para administración. No incluye datos clínicos individuales. */
export function registerReports(app: Express, { sql, auth, need, clinicOf }: Ctx) {
  app.get('/api/reports', auth, need('reports.view'), async (req, res) => {
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query, 'Elige un rango de fechas.')
    if (q.from > q.to) fail(400, 'La fecha inicial debe ser anterior a la final.')
    const inRange = (iso: string) => { const d = localDate(new Date(iso)); return d >= q.from && d <= q.to }
    // Las marcas de tiempo en UTC se amplían un día y se filtran por fecha local
    const lo = new Date(`${q.from}T00:00:00`); lo.setDate(lo.getDate() - 1)
    const hi = new Date(`${q.to}T23:59:59`); hi.setDate(hi.getDate() + 1)

    const cid = clinicOf(req)
    const [appts, payRows, consRows, patRows, doctors] = await Promise.all([
      sql.query(`SELECT id, doctor_id, start, status, source FROM appointments WHERE clinic_id = ? AND start >= ? AND start < ?`, [cid, q.from, `${q.to}T99`]),
      sql.query(`SELECT p.total, p.method, p.paid_at, a.doctor_id FROM payments p LEFT JOIN appointments a ON a.id = p.appointment_id
        WHERE p.clinic_id = ? AND NOT p.voided AND p.paid_at BETWEEN ? AND ?`, [cid, lo.toISOString(), hi.toISOString()]),
      sql.query(`SELECT diagnoses, date FROM consultations WHERE clinic_id = ? AND date BETWEEN ? AND ?`, [cid, localDate(lo), hi.toISOString()]),
      sql.query(`SELECT created_at FROM patients WHERE clinic_id = ? AND NOT pending AND created_at BETWEEN ? AND ?`, [cid, localDate(lo), hi.toISOString()]),
      sql.query(`SELECT id, name FROM staff WHERE clinic_id = ? AND role = 'doctor' ORDER BY name`, [cid]),
    ])
    const payments = payRows.filter((p) => inRange(String(p.paid_at)))
    const consults = consRows.filter((c) => inRange(String(c.date)))
    const newPatients = patRows.filter((p) => inRange(String(p.created_at))).length

    const count = (f: (a: Row) => boolean) => appts.filter(f).length
    const done = count((a) => a.status === 'done')
    const noShow = count((a) => a.status === 'no_show')
    const revenue = payments.reduce((s, p) => s + Number(p.total), 0)

    const days: { date: string; appointments: number; done: number; revenue: number }[] = []
    for (let d = new Date(`${q.from}T12:00:00`); localDate(d) <= q.to; d.setDate(d.getDate() + 1)) {
      const key = localDate(d)
      days.push({
        date: key,
        appointments: count((a) => String(a.start).startsWith(key) && a.status !== 'cancelled'),
        done: count((a) => String(a.start).startsWith(key) && a.status === 'done'),
        revenue: payments.filter((p) => localDate(new Date(String(p.paid_at))) === key).reduce((s, p) => s + Number(p.total), 0),
      })
    }

    // Se cuenta por clasificación y código: el mismo código puede existir en CIE-10 (registros anteriores) y CIE-11.
    // Los escritos sin código se agrupan por su texto.
    const dx = new Map<string, { code: string; label: string; system?: 'icd11'; count: number }>()
    for (const c of consults) {
      for (const d of JSON.parse(String(c.diagnoses)) as { code: string; label: string; system?: 'icd11' }[]) {
        const key = d.code === 'S/C' ? `sc:${d.label.toLowerCase()}` : `${d.system ?? 'icd10'}:${d.code}`
        const e = dx.get(key) ?? { code: d.code, label: d.label, system: d.system, count: 0 }
        e.count++
        dx.set(key, e)
      }
    }

    res.json({
      range: q,
      totals: {
        appointments: count((a) => a.status !== 'cancelled'), done, noShow, cancelled: count((a) => a.status === 'cancelled'),
        attendance: done + noShow ? done / (done + noShow) : null,
        revenue, payments: payments.length, avgTicket: payments.length ? revenue / payments.length : 0,
        online: count((a) => a.source === 'online'), newPatients,
      },
      days,
      byDoctor: doctors.map((d) => ({
        id: String(d.id), name: String(d.name),
        appointments: count((a) => a.doctor_id === d.id && a.status !== 'cancelled'),
        done: count((a) => a.doctor_id === d.id && a.status === 'done'),
        noShow: count((a) => a.doctor_id === d.id && a.status === 'no_show'),
        revenue: payments.filter((p) => p.doctor_id === d.id).reduce((s, p) => s + Number(p.total), 0),
      })),
      byMethod: (['cash', 'card', 'transfer', 'insurance'] as const).map((m) => ({
        method: m, count: payments.filter((p) => p.method === m).length,
        total: payments.filter((p) => p.method === m).reduce((s, p) => s + Number(p.total), 0),
      })),
      topDiagnoses: [...dx.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    })
  })
}
