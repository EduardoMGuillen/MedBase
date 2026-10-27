import { createHash } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { consentDocument, READ_CONFIRMATION, shortDate, SIGNATURE_NOTICE } from '../src/lib/consent.js'
import { time } from '../src/lib/format.js'
import type { Authorization, ConsentSigning } from '../src/lib/types.js'

/** Carta (8.5 × 11 pulgadas) en puntos, con márgenes de 0.75 pulgadas. */
const W = 612
const H = 792
const M = 54
const INK = rgb(0.06, 0.13, 0.2)
const MUTED = rgb(0.34, 0.4, 0.44)
const LINE = rgb(0.75, 0.79, 0.8)

/** Las fuentes estándar del PDF sólo tienen el juego WinAnsi: lo demás se cambia por un equivalente. */
const REPLACE: Record<string, string> = { '✓': 'v', '≥': '>=', '≤': '<=', '₂': '2', ' ': ' ', ' ': ' ', '−': '-' }
function clean(font: PDFFont, text: string) {
  const ok = new Set(font.getCharacterSet())
  return [...text.normalize('NFC')].map((c) => (ok.has(c.codePointAt(0)!) ? c : REPLACE[c] ?? '?')).join('')
}

/** Escribe de arriba hacia abajo y agrega páginas cuando no cabe. */
class Writer {
  page!: PDFPage
  y = 0
  pages: PDFPage[] = []
  doc: PDFDocument
  font: PDFFont
  bold: PDFFont
  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.doc = doc
    this.font = font
    this.bold = bold
    this.newPage()
  }
  newPage() {
    this.page = this.doc.addPage([W, H])
    this.pages.push(this.page)
    this.y = H - M
  }
  ensure(h: number) { if (this.y - h < M + 24) this.newPage() }
  lines(text: string, size: number, width: number, font = this.font) {
    const out: string[] = []
    for (const para of clean(font, text).split('\n')) {
      let line = ''
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word
        if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue }
        if (line) out.push(line)
        line = word
      }
      out.push(line)
    }
    return out
  }
  text(text: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = o.size ?? 10.5
    const font = o.bold ? this.bold : this.font
    const x = o.x ?? M
    const lh = size * 1.32
    for (const l of this.lines(text, size, o.width ?? W - M - x)) {
      this.ensure(lh)
      this.page.drawText(l, { x, y: this.y - size, size, font, color: o.color ?? INK })
      this.y -= lh
    }
    this.y -= o.gap ?? 0
  }
}

export interface SignedPdfInput {
  a: Pick<Authorization, 'id' | 'template' | 'data' | 'statusAt' | 'createdAt'>
  signing: ConsentSigning
  managedByName: string
}

/** PNG en data URL → bytes. */
const pngBytes = (dataUrl: string) => Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')

/**
 * PDF final de una autorización firmada en pantalla (o de su rechazo o revocación): el texto del documento con los
 * datos, las firmas incrustadas con nombre, identidad, fecha y hora, y la constancia al pie. Devuelve los bytes y su
 * huella SHA-256.
 */
export async function signedConsentPdf({ a, signing, managedByName }: SignedPdfInput) {
  const doc = await PDFDocument.create()
  const d = a.data
  doc.setTitle(`${consentDocument(a, signing.action, signing.representative).title} · ${d.patient.name}`)
  doc.setAuthor(d.clinic.name)
  doc.setCreator('Clinara')
  doc.setProducer('Clinara')
  doc.setCreationDate(new Date(signing.signedAt))
  doc.setModificationDate(new Date(signing.signedAt))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const w = new Writer(doc, font, bold)
  const body = consentDocument(a, signing.action, signing.signer === 'representative' ? signing.representative : undefined)

  // Encabezado: clínica, dirección y fecha de la hoja
  let logo: PDFImage | undefined
  try {
    if (d.clinic.logo?.startsWith('data:image/png')) logo = await doc.embedPng(pngBytes(d.clinic.logo))
    else if (d.clinic.logo?.startsWith('data:image/jp')) logo = await doc.embedJpg(Buffer.from(d.clinic.logo.split(',')[1] ?? '', 'base64'))
  } catch { logo = undefined }
  const textX = logo ? M + 40 : M
  if (logo) {
    const s = logo.scaleToFit(32, 32)
    w.page.drawImage(logo, { x: M, y: H - M - s.height, width: s.width, height: s.height })
  }
  w.page.drawText(clean(bold, d.clinic.name), { x: textX, y: H - M - 13, size: 13, font: bold, color: INK })
  w.page.drawText(clean(font, `${d.clinic.address}${d.clinic.phone ? `, tel. ${d.clinic.phone}` : ''}`), { x: textX, y: H - M - 27, size: 9, font, color: MUTED })
  const stamp = `Hoja del ${shortDate(a.createdAt)}`
  w.page.drawText(stamp, { x: W - M - font.widthOfTextAtSize(stamp, 9), y: H - M - 13, size: 9, font, color: MUTED })
  w.y = H - M - 46
  w.page.drawLine({ start: { x: M, y: w.y }, end: { x: W - M, y: w.y }, thickness: 0.8, color: LINE })
  w.y -= 16
  w.text(body.title, { size: 15, bold: true, gap: 8 })

  // Datos del documento, en dos columnas cuando son cortos
  const colW = (W - 2 * M - 16) / 2
  const short = body.facts.filter(([, v]) => v.length <= 40)
  const long = body.facts.filter(([, v]) => v.length > 40)
  for (let i = 0; i < short.length; i += 2) {
    w.ensure(16)
    const y0 = w.y
    let yMin = y0
    for (const [j, [k, v]] of short.slice(i, i + 2).entries()) {
      w.y = y0
      w.text(`${k}: ${v}`, { size: 10, x: M + j * (colW + 16), width: colW })
      yMin = Math.min(yMin, w.y)
    }
    w.y = yMin
  }
  for (const [k, v] of long) w.text(`${k}: ${v}`, { size: 10 })
  w.y -= 8

  w.text(body.intro, { size: 10.5, gap: 4 })
  for (const [i, item] of body.items.entries()) {
    const lines = w.lines(item, 10.5, W - 2 * M - 18)
    w.ensure(lines.length * 13.9)
    w.page.drawText(`${i + 1}.`, { x: M, y: w.y - 10.5, size: 10.5, font, color: INK })
    w.text(item, { size: 10.5, x: M + 18, gap: 3 })
  }
  if (body.closing) w.text(body.closing, { size: 10.5, gap: 4 })
  w.text(`[X] ${READ_CONFIRMATION}`, { size: 10.5, bold: true, gap: 10 })

  // Firmas: paciente o representante (o el motivo por el que no firmó), testigo y médico
  type Box = { title: string; name: string; detail?: string; image?: string; at: string; note?: string }
  const boxes: Box[] = []
  const signerName = signing.signer === 'representative' && signing.representative ? signing.representative : { name: d.patient.name, dni: d.patient.dni }
  boxes.push({
    title: signing.signer === 'representative' ? 'Firma del representante legal' : 'Firma del paciente',
    name: signerName.name,
    detail: [signerName.dni && `Identidad ${signerName.dni}`, signing.signer === 'representative' && signing.representative?.relation].filter(Boolean).join(', ') || undefined,
    image: signing.unableReason ? undefined : signing.signature, at: signing.signedAt,
    note: signing.unableReason ? `No firmó: ${signing.unableReason}. Firma el testigo.` : undefined,
  })
  if (signing.witness) boxes.push({ title: 'Testigo', name: signing.witness.name, detail: signing.witness.dni ? `Identidad ${signing.witness.dni}` : undefined, image: signing.witness.signature, at: signing.signedAt })
  if (signing.doctor) boxes.push({ title: 'Firma y sello del médico', name: signing.doctor.name, detail: signing.doctor.license ? `Colegiación ${signing.doctor.license}` : undefined, image: signing.doctor.signature, at: signing.doctor.at })

  const boxW = (W - 2 * M - 2 * 14) / 3
  const boxH = 118
  w.ensure(boxH + 10)
  const top = w.y
  for (const [i, b] of boxes.entries()) {
    const x = M + i * (boxW + 14)
    w.page.drawText(clean(bold, b.title), { x, y: top - 10, size: 9, font: bold, color: MUTED })
    if (b.image) {
      try {
        const img = await doc.embedPng(pngBytes(b.image))
        const s = img.scaleToFit(boxW - 8, 54)
        w.page.drawImage(img, { x: x + (boxW - s.width) / 2, y: top - 72 + (54 - s.height) / 2, width: s.width, height: s.height })
      } catch { /* firma ilegible: queda la constancia */ }
    } else if (b.note) {
      let y = top - 30
      for (const l of w.lines(b.note, 8.5, boxW)) { w.page.drawText(l, { x, y, size: 8.5, font, color: MUTED }); y -= 11 }
    }
    w.page.drawLine({ start: { x, y: top - 76 }, end: { x: x + boxW, y: top - 76 }, thickness: 0.8, color: INK })
    let y = top - 88
    for (const l of [...w.lines(b.name, 9.5, boxW, bold)]) { w.page.drawText(l, { x, y, size: 9.5, font: bold, color: INK }); y -= 11.5 }
    if (b.detail) for (const l of w.lines(b.detail, 8.5, boxW)) { w.page.drawText(l, { x, y, size: 8.5, font, color: MUTED }); y -= 10.5 }
    w.page.drawText(`${shortDate(b.at)} ${time(b.at)}`, { x, y, size: 8.5, font, color: MUTED })
  }
  w.y = top - boxH - 6

  // Constancia
  const notice = `Firmado electrónicamente en Clinara el ${shortDate(signing.signedAt)} a las ${time(signing.signedAt)}, gestionado por ${managedByName}, dispositivo ${signing.device}.`
  const noticeLines = [...w.lines(notice, 9, W - 2 * M - 16, bold), ...w.lines(SIGNATURE_NOTICE, 8.5, W - 2 * M - 16), ...w.lines(`Documento ${a.id}.`, 8.5, W - 2 * M - 16)]
  const nh = noticeLines.length * 11.5 + 14
  w.ensure(nh)
  w.page.drawRectangle({ x: M, y: w.y - nh, width: W - 2 * M, height: nh, borderColor: LINE, borderWidth: 0.8, color: rgb(0.965, 0.973, 0.98) })
  let ny = w.y - 16
  for (const [i, l] of noticeLines.entries()) {
    const isBold = i < w.lines(notice, 9, W - 2 * M - 16, bold).length
    w.page.drawText(l, { x: M + 8, y: ny, size: isBold ? 9 : 8.5, font: isBold ? bold : font, color: isBold ? INK : MUTED })
    ny -= 11.5
  }
  w.y -= nh + 8

  // Pie con el número de página
  for (const [i, p] of w.pages.entries()) {
    const foot = `Texto a validar por la clínica y su asesor legal. Emitido con Clinara · Página ${i + 1} de ${w.pages.length}`
    p.drawText(clean(font, foot), { x: M, y: M - 18, size: 8, font, color: MUTED })
  }

  const bytes = await doc.save()
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}
