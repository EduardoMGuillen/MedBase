export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

let serverSkew = 0
/** La hora del servidor (GE4): la de este equipo corregida por la diferencia que se vio en la última respuesta. */
export const serverNow = () => new Date(Date.now() + serverSkew)

/** Llama a la API con la cookie de sesión y convierte los errores en mensajes legibles. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisa que esté encendido (npm run dev).')
  }
  // GE4 (ronda 9): el reloj del servidor manda (periodo de gracia); se guarda la diferencia con el de este equipo
  const date = res.headers.get('date')
  if (date) { const d = new Date(date).getTime() - Date.now(); if (Number.isFinite(d)) serverSkew = Math.abs(d) > 5_000 ? d : 0 }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Ocurrió un error inesperado.')
  return data as T
}
