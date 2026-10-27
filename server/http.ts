import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import type { Row, Sql } from './sql.js'
import type { Permission } from '../src/lib/permissions.js'
import type { ClinicSettings, Staff } from '../src/lib/types.js'

export type { Row }

/** Error con código HTTP y mensaje listo para mostrar en la interfaz. */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export const fail = (status: number, message: string): never => { throw new HttpError(status, message) }

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
  sql: Sql
  demoMode: boolean
  auth: Middleware
  need: (...perms: Permission[]) => Middleware
  userOf: (req: Request) => Staff
  /** Clínica de quien hace la petición; falla con 403 para la administración de la plataforma. */
  clinicOf: (req: Request) => string
  audit: (actor: { id: string; clinicId?: string | null }, action: string, q?: Sql) => Promise<void>
  patientName: (id: string) => Promise<string>
  staffRow: (id: string) => Promise<Row | undefined>
  clinicStaffRow: (clinicId: string, id: string) => Promise<Row | undefined>
  patientRow: (clinicId: string, id: string) => Promise<Row | undefined>
  apptRow: (clinicId: string, id: string) => Promise<Row | undefined>
  assertFree: (doctorId: string, start: string, minutes: number, ignoreId?: string) => Promise<void>
  /** Falla si el paciente es adulto y no tiene número de identidad, que la receta exige. */
  assertRxIdentity: (clinicId: string, patientId: string) => Promise<void>
  settings: (clinicId: string) => Promise<ClinicSettings>
}

/**
 * Un diagnóstico: CIE-11 de la OMS (con su código y su URI) o escrito sin código ("S/C"). Los de antes de la
 * CIE-11 no traen `system` y son CIE-10.
 */
export const diagnosisInput = z.object({
  code: z.string().trim().min(1).max(20),
  label: z.string().trim().min(1).max(300),
  system: z.literal('icd11').optional(),
  uri: z.string().trim().max(200).optional(),
})
