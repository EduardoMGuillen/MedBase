import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import type { DB } from './db'
import type { Permission } from '../src/lib/permissions'
import type { Staff } from '../src/lib/types'

/** Error con código HTTP y mensaje listo para mostrar en la interfaz. */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export const fail = (status: number, message: string): never => { throw new HttpError(status, message) }

export type Row = Record<string, unknown>

export function parse<T extends z.ZodType>(schema: T, data: unknown, message?: string): z.infer<T> {
  const r = schema.safeParse(data)
  if (!r.success) fail(400, message ?? r.error.issues[0]?.message ?? 'Revisa los datos enviados.')
  return r.data as z.infer<T>
}

export function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Middleware = (req: Request, res: Response, next: NextFunction) => void

/** Lo que comparten todos los módulos de rutas. */
export interface Ctx {
  db: DB
  demoMode: boolean
  auth: Middleware
  need: (...perms: Permission[]) => Middleware
  userOf: (req: Request) => Staff
  audit: (userId: string, action: string) => void
  patientName: (id: string) => string
  staffRow: (id: string) => Row | undefined
  patientRow: (id: string) => Row | undefined
  apptRow: (id: string) => Row | undefined
  assertFree: (doctorId: string, start: string, minutes: number, ignoreId?: string) => void
  settings: () => Record<string, unknown>
}

/** Limitador simple en memoria: `max` intentos por clave en `windowMs`. */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>()
  return (key: string) => {
    const now = Date.now()
    const h = hits.get(key)
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true }
    h.n++
    return h.n <= max
  }
}
