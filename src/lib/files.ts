import { api, ApiError } from './api'
import type { Attachment } from './types'

/** Cada parte que se sube y cada trozo que se baja cabe en una petición de Vercel (4,5 MB). */
const PART = 3 * 1024 * 1024
/** Un escaneo (PDF de varias páginas o varias fotos unidas) puede pesar hasta 15 MB. */
export const MAX_SCAN_BYTES = 15 * 1024 * 1024

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
  r.onerror = () => reject(new Error('No se pudo leer el archivo.'))
  r.readAsDataURL(blob)
})

/**
 * Sube un archivo de hasta 15 MB en partes de 3 MB y lo une en el servidor como un archivo del expediente.
 * `onProgress` recibe de 0 a 1.
 */
export async function uploadLarge(patientId: string, blob: Blob, meta: { name: string; mime: string; category: Attachment['category']; title?: string; takenAt?: string; hospitalizationId?: string },
  onProgress?: (x: number) => void) {
  if (blob.size > MAX_SCAN_BYTES) throw new Error(`El archivo pesa ${(blob.size / 1024 / 1024).toFixed(1)} MB. El máximo es 15 MB: toma las fotos con menor resolución o escanea en blanco y negro.`)
  const uploadId = crypto.randomUUID()
  const parts = Math.max(1, Math.ceil(blob.size / PART))
  for (let i = 0; i < parts; i++) {
    await api(`/uploads/${uploadId}/parts`, { body: { index: i, data: await toBase64(blob.slice(i * PART, (i + 1) * PART)) } })
    onProgress?.((i + 1) / (parts + 1))
  }
  const att = await api<Attachment>(`/patients/${patientId}/attachments/assemble`, { body: { uploadId, parts, ...meta } })
  onProgress?.(1)
  return att
}

/** Baja un archivo del expediente por rangos de 3 MB (Vercel no devuelve más de 4,5 MB por respuesta). */
export async function fetchFile(id: string): Promise<Blob> {
  const chunks: ArrayBuffer[] = []
  let type = ''
  let start = 0
  let total = Infinity
  while (start < total) {
    const res = await fetch(`/api/attachments/${id}`, { credentials: 'same-origin', headers: { range: `bytes=${start}-${start + PART - 1}` } })
    if (!res.ok) throw new ApiError(res.status, 'No se pudo abrir el archivo.')
    type = res.headers.get('content-type') ?? type
    chunks.push(await res.arrayBuffer())
    const range = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '')
    // Sin rango, el servidor mandó el archivo completo
    if (res.status !== 206 || !range) break
    total = Number(range[1])
    start += chunks[chunks.length - 1].byteLength
  }
  return new Blob(chunks, { type })
}

/** Abre un archivo del expediente en otra pestaña. */
export async function openFile(id: string) {
  // La pestaña se abre antes de esperar la descarga: si no, el navegador la bloquea
  const tab = window.open('', '_blank')
  try {
    const url = URL.createObjectURL(await fetchFile(id))
    if (tab) tab.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 120_000)
  } catch (e) {
    tab?.close()
    throw e
  }
}
