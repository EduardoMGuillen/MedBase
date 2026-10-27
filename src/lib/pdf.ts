/**
 * PDF en el navegador. Las dos librerías se cargan sólo cuando hacen falta (subir un escaneo, ver una hoja firmada o
 * imprimir el expediente completo):
 * - pdf-lib une varias fotos y PDF en un solo documento, en el orden elegido.
 * - pdf.js dibuja cada página como imagen: vista previa antes de subir, la hoja firmada en pantalla igual que impresa
 *   y las hojas firmadas dentro del expediente completo impreso.
 */

const LETTER: [number, number] = [612, 792]
/** Lado mayor de una foto antes de meterla al PDF: legible impresa y liviana (unos 300 KB). */
const PHOTO_MAX = 1800

async function pdfjs() {
  const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  lib.GlobalWorkerOptions.workerSrc = worker.default
  return lib
}

/** Cada página del PDF como imagen JPEG (URL de objeto), al ancho indicado en píxeles. */
export async function renderPdfPages(data: ArrayBuffer | Blob, width = 1100): Promise<string[]> {
  const lib = await pdfjs()
  const bytes = data instanceof Blob ? await data.arrayBuffer() : data
  const task = lib.getDocument({ data: new Uint8Array(bytes) })
  const doc = await task.promise
  const out: string[] = []
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88))
      if (blob) out.push(URL.createObjectURL(blob))
      page.cleanup()
    }
  } finally {
    await task.destroy()
  }
  return out
}

/** Foto reducida y comprimida en JPEG, derecha según la orientación de la cámara. */
async function compressPhoto(file: Blob) {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, PHOTO_MAX / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * k)
  canvas.height = Math.round(img.height * k)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8))
  if (!blob) throw new Error('No se pudo leer la foto.')
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
}

/**
 * Une fotos y PDF (en ese orden) en un solo PDF. Cada foto va en una hoja carta (vertical u horizontal según la
 * foto), comprimida; las páginas de un PDF se copian tal cual.
 */
export async function buildScanPdf(files: File[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const out = await PDFDocument.create()
  out.setCreator('Clinara')
  for (const f of files) {
    if (f.type === 'application/pdf') {
      let src
      try { src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true }) } catch { throw new Error(`No se pudo abrir "${f.name}". ¿Es un PDF válido?`) }
      for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p)
      continue
    }
    const photo = await compressPhoto(f)
    const landscape = photo.width > photo.height
    const [pw, ph] = landscape ? [LETTER[1], LETTER[0]] : LETTER
    const page = out.addPage([pw, ph])
    const img = await out.embedJpg(photo.bytes)
    const s = img.scaleToFit(pw - 36, ph - 36)
    page.drawImage(img, { x: (pw - s.width) / 2, y: (ph - s.height) / 2, width: s.width, height: s.height })
  }
  if (!out.getPageCount()) throw new Error('Elige al menos una foto o un PDF.')
  const bytes = await out.save()
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
}
