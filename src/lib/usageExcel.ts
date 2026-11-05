import type { Workbook, Worksheet } from 'exceljs'
import { clinicParts } from './dateInput.js'
import { dmyTime } from './format.js'
import { supplyLabel } from './supplies.js'
import { byPatient, materialRows, materialTotals, medSummary, type MaterialRecord, type MedUse } from './usage.js'

/**
 * RU3 (ronda 14): el Excel (.xlsx) del registro de uso, con ExcelJS (MIT). Recibe el módulo ya cargado (en el navegador se
 * carga con import dinámico al pulsar «Exportar a Excel»; en las pruebas, el de Node), así no engorda el paquete principal.
 *  - Medicamentos: hojas «Aplicaciones» (una fila por aplicación) y «Resumen».
 *  - Material: hojas «Por paciente» (una fila por paciente, periodo y material) y «Total del periodo».
 * Cada hoja: título, periodo y quién lo generó arriba; encabezados en negrita con fondo, fijos al desplazarse y con filtro;
 * anchos ajustados; fechas como fecha de Excel (dd/mm/aaaa), horas como hora (HH:mm) y cantidades como número.
 */
type ExcelModule = { Workbook: new () => Workbook }
export interface UsageExcelInput {
  title: string
  periodLabel: string
  areaLabel: string
  q?: string
  by: string
  at: Date
  clinic: string
}

const HEAD_ROW = 5
const HEADER_FILL = 'FFDCE7F3'
/** La fecha de Honduras como fecha de Excel (sin hora ni zona): 05/11/2026. */
const excelDate = (iso: string) => { const p = clinicParts(new Date(iso)); return new Date(Date.UTC(p.y, p.mo - 1, p.d)) }
/** La hora de Honduras como hora de Excel: 14:30. */
const excelTime = (iso: string) => { const p = clinicParts(new Date(iso)); return new Date(Date.UTC(1899, 11, 30, p.h, p.mi)) }

interface Col { header: string; width?: number; fmt?: string; num?: boolean }

function sheet(wb: Workbook, name: string, info: UsageExcelInput, subtitle: string, cols: Col[], rows: (string | number | Date | null)[][]) {
  const ws: Worksheet = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: HEAD_ROW, xSplit: 0 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  ws.getCell('A1').value = `${info.title} · ${subtitle}`
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = `${info.clinic} · Periodo: ${info.periodLabel} · Área: ${info.areaLabel}${info.q ? ` · Búsqueda: «${info.q}»` : ''}`
  ws.getCell('A3').value = `Generado el ${dmyTime(info.at.toISOString())} por ${info.by}`
  ws.getCell('A3').font = { italic: true, color: { argb: 'FF555555' } }
  const head = ws.getRow(HEAD_ROW)
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1)
    cell.value = c.header
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF7A8AA0' } } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  head.height = 20
  rows.forEach((r, n) => {
    const row = ws.getRow(HEAD_ROW + 1 + n)
    r.forEach((v, i) => {
      const cell = row.getCell(i + 1)
      cell.value = v ?? null
      if (cols[i].fmt) cell.numFmt = cols[i].fmt!
      cell.alignment = { vertical: 'top', wrapText: !cols[i].num && !cols[i].fmt }
    })
  })
  // Anchos: lo más largo de cada columna (con tope) o el fijo de fechas y horas
  cols.forEach((c, i) => {
    const longest = Math.max(c.header.length, ...rows.map((r) => (r[i] instanceof Date || r[i] == null ? 0 : String(r[i]).length)))
    ws.getColumn(i + 1).width = c.width ?? Math.min(60, Math.max(10, longest + 2))
  })
  ws.autoFilter = { from: { row: HEAD_ROW, column: 1 }, to: { row: HEAD_ROW, column: cols.length } }
  return ws
}

export function buildMedsWorkbook(ExcelJS: ExcelModule, info: UsageExcelInput, rows: MedUse[]) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Clinara'
  wb.created = info.at
  const ordered = byPatient(rows, (a, b) => a.at.localeCompare(b.at)).flatMap((b) => b.rows)
  sheet(wb, 'Aplicaciones', info, 'Aplicaciones', [
    { header: 'Fecha', fmt: 'dd/mm/yyyy', width: 12 }, { header: 'Hora', fmt: 'hh:mm', width: 8 }, { header: 'Paciente' }, { header: 'Expediente' }, { header: 'Ubicación' },
    { header: 'Medicamento' }, { header: 'Aplicado por' }, { header: 'Médico que lo indicó' },
  ], ordered.map((r) => [excelDate(r.at), excelTime(r.at), r.patientName, r.record, r.location, r.medication, `${r.appliedBy}${r.appliedByTitle ? ` (${r.appliedByTitle})` : ''}`, r.orderedBy]))
  sheet(wb, 'Resumen', info, 'Resumen', [
    { header: 'Medicamento' }, { header: 'Presentación' }, { header: 'Aplicaciones', num: true, fmt: '0' }, { header: 'Total', num: true, fmt: '0.###' }, { header: 'Unidad' },
  ], medSummary(rows).map((s) => [s.drug, s.presentation || null, s.count, s.total ?? null, s.unit ?? null]))
  return wb
}

export function buildMaterialWorkbook(ExcelJS: ExcelModule, info: UsageExcelInput, records: MaterialRecord[]) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Clinara'
  wb.created = info.at
  sheet(wb, 'Por paciente', info, 'Por paciente', [
    { header: 'Fecha', fmt: 'dd/mm/yyyy', width: 12 }, { header: 'Periodo' }, { header: 'Paciente' }, { header: 'Expediente' }, { header: 'Categoría' }, { header: 'Material' },
    { header: 'Variante' }, { header: 'Unidad' }, { header: 'Cantidad', num: true, fmt: '0' }, { header: 'Registrado por' },
  ], materialRows(records).map((r) => [excelDate(r.periodStart), r.periodLabel, r.patient, r.record || null, r.sum.category, r.sum.material, r.sum.variant || null, r.sum.unit, r.sum.quantity, r.by.join(', ')]))
  const totals = [...materialTotals(records)].sort((a, b) => a.category.localeCompare(b.category, 'es') || supplyLabel(a).localeCompare(supplyLabel(b), 'es'))
  sheet(wb, 'Total del periodo', info, 'Total del periodo', [
    { header: 'Categoría' }, { header: 'Material' }, { header: 'Variante' }, { header: 'Unidad' }, { header: 'Cantidad', num: true, fmt: '0' },
  ], totals.map((s) => [s.category, s.material, s.variant || null, s.unit, s.quantity]))
  return wb
}
