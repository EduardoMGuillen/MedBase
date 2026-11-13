import { useCallback, useEffect, useState } from 'react'
import { Combo } from '../components/Combo'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { DateField } from '../components/DateTimeField'
import { Modal } from '../components/ui'
import { api } from '../lib/api'
import { cap, localISODate, shortStaff } from '../lib/format'
import { hasRole } from '../lib/permissions'
import { useNow } from '../lib/hooks'
import { DEPT_SHIFTS } from '../lib/clinicalConfig'
import type { Role } from '../lib/types'

interface Shift { id: string; day: string; staffId: string; shift?: string }
/** DP6 (ronda 11): «Médicos | Enfermería | Laboratorio | Imágenes». */
export type RosterDept = 'doctors' | 'nursing' | 'lab' | 'imaging'
const DEPT_LABEL: Record<RosterDept, string> = { doctors: 'Médicos', nursing: 'Enfermería', lab: 'Laboratorio', imaging: 'Imágenes' }
const DEPT_ROLE: Record<RosterDept, Role> = { doctors: 'doctor', nursing: 'nurse', lab: 'lab', imaging: 'imaging' }
const WEEKDAYS = [{ d: 1, l: 'Lun' }, { d: 2, l: 'Mar' }, { d: 3, l: 'Mié' }, { d: 4, l: 'Jue' }, { d: 5, l: 'Vie' }, { d: 6, l: 'Sáb' }, { d: 0, l: 'Dom' }]
const DOW = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/**
 * AD3 (ronda 5): rol de turnos. Un mes en cuadrícula; al tocar un día se marcan los médicos que trabajan ese día (uno o
 * varios) y se quita a alguien desmarcándolo. Es informativo: la agenda se sigue rigiendo por «Horarios de médicos».
 * Cada cambio queda en la bitácora, también si el día ya pasó.
 */
export function Roster({ fixed, canEdit: canEditProp }: { fixed?: RosterDept; canEdit?: boolean } = {}) {
  const { staff, notify } = useStore()
  const now = useNow()
  // DP6 (ronda 11): el selector de departamento (Administración); Laboratorio e Imágenes ven solo el suyo
  const [dept, setDept] = useState<RosterDept>(fixed ?? 'doctors')
  const shifts3 = dept === 'doctors' ? [] : DEPT_SHIFTS[dept]
  const editable = canEditProp ?? true
  const [repeat, setRepeat] = useState(false)
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const doctors = staff.filter((s) => s.active && hasRole(s, DEPT_ROLE[dept])).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  // La cuadrícula empieza el lunes de la semana del día 1 y termina el domingo de la semana del último día
  const first = new Date(month)
  first.setDate(1 - ((month.getDay() + 6) % 7))
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  last.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)))
  const days: Date[] = []
  for (const d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) days.push(new Date(d))
  const from = localISODate(first)
  const to = localISODate(last)
  const load = useCallback(() => {
    api<Shift[]>(`/roster?from=${from}&to=${to}&dept=${dept}`).then(setShifts).catch((e: Error) => notify(e.message, 'error'))
  }, [from, to, dept, notify])
  useEffect(load, [load])
  const today = localISODate(now)
  const order = (k?: string) => ['morning', 'afternoon', 'night'].indexOf(k ?? '')
  const of = (day: string) => (shifts ?? []).filter((s) => s.day === day).sort((a, b) => order(a.shift) - order(b.shift))
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? 'Médico'
  const toggle = async (day: string, staffId: string, shift?: string) => {
    setBusy(true)
    try {
      const on = of(day).find((s) => s.staffId === staffId && (s.shift ?? '') === (shift ?? ''))
      if (on) await api(`/roster/${on.id}`, { method: 'DELETE' })
      else await api('/roster', { body: { day, staffId, dept, shift } })
      load()
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const title = cap(month.toLocaleDateString('es-HN', { month: 'long', year: 'numeric' }))
  const openDate = open ? new Date(`${open}T00:00:00`) : null
  const moveDay = (n: number) => { if (!openDate) return; const d = new Date(openDate); d.setDate(d.getDate() + n); setOpen(localISODate(d)); if (d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }

  return (
    <section className="panel" data-tour="rol-turnos">
      <div className="panel__head" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div><h2>Rol de turnos{fixed ? ` · ${DEPT_LABEL[fixed]}` : ''}</h2><p>{dept === 'doctors' ? 'Qué médico trabaja cada día. Es informativo: la agenda sigue los horarios de cada médico.' : `Quién trabaja cada turno en ${DEPT_LABEL[dept]}. Es informativo.`} {editable ? 'Toca un día para asignar o quitar.' : 'Solo lectura.'}</p>
          {!fixed && <div className="segmented" role="radiogroup" aria-label="Departamento" style={{ marginTop: 8 }}>
            {(Object.keys(DEPT_LABEL) as RosterDept[]).map((d) => <button key={d} type="button" role="radio" aria-checked={dept === d} onClick={() => { setDept(d); setOpen(null) }}>{DEPT_LABEL[d]}</button>)}
          </div>}
          {editable && dept !== 'doctors' && <button className="btn btn--soft btn--sm" style={{ marginTop: 8 }} onClick={() => setRepeat(true)}>Repetir turno</button>}</div>
        <div className="roster__nav">
          <button className="icon-btn" aria-label="Mes anterior" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Mes siguiente" onClick={() => shift(1)}><ChevronRight size={18} /></button>
          <button className="btn btn--soft btn--sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Hoy</button>
        </div>
      </div>
      <div className={`panel__body${open ? ' roster__body--open' : ''}`}>
        {!doctors.length ? <div className="empty">{dept === 'doctors' ? 'No hay médicos activos en la clínica.' : `No hay personal activo con el rol ${DEPT_LABEL[dept]}.`}</div> : (
          <div className="roster__grid" aria-busy={!shifts}>
            {DOW.map((d) => <div key={d} className="roster__dow">{d}</div>)}
            {days.map((d) => {
              const iso = localISODate(d)
              const list = of(iso)
              const out = d.getMonth() !== month.getMonth()
              return (
                <button key={iso} type="button" aria-pressed={open === iso} className={`roster__day${out ? ' is-out' : ''}${iso === today ? ' is-today' : ''}${open === iso ? ' is-open' : ''}`} onClick={() => setOpen(iso)}
                  aria-label={`${d.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })}: ${list.length ? list.map((s) => name(s.staffId)).join(', ') : 'sin médicos asignados'}`}>
                  <span className="roster__wd">{d.toLocaleDateString('es-HN', { weekday: 'long' })}</span>
                  <span className="roster__n">{d.getDate()}</span>
                  {list.map((s) => <span key={s.id} className="roster__doc" title={name(s.staffId)}>{s.shift ? `${shifts3.find((x) => x.key === s.shift)?.label.charAt(0) ?? ''} · ` : ''}{shortStaff(name(s.staffId))}</span>)}
                  {!list.length && !out && <span className="roster__empty">Sin asignar</span>}
                </button>
              )
            })}
          </div>
        )}
      {/* TU1 (ronda 6), «Panel del día»: panel lateral (en celular, hoja inferior) con la fecha y el personal con casillas.
          No tapa el calendario: se pasa al día anterior o al siguiente sin cerrarlo */}
      {open && openDate && (
        <aside className="roster__panel" role="dialog" aria-modal="false" aria-label={`Turno del ${openDate.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })}`}>
          <div className="roster__panel-head">
            <button className="icon-btn" aria-label="Día anterior" onClick={() => moveDay(-1)}><ChevronLeft size={18} /></button>
            <div><b>{cap(openDate.toLocaleDateString('es-HN', { weekday: 'long' }))}</b><span>{openDate.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span></div>
            <button className="icon-btn" aria-label="Día siguiente" onClick={() => moveDay(1)}><ChevronRight size={18} /></button>
            <button className="icon-btn roster__panel-close" aria-label="Cerrar" onClick={() => setOpen(null)}><X size={18} /></button>
          </div>
          {open < today && editable && <p className="alert-strip alert-strip--amber">{fixed ? 'Es un día que ya pasó: solo se editan los turnos de hoy en adelante.' : 'Es un día que ya pasó: el cambio queda en la bitácora.'}</p>}
          <p className="c-muted fs-md">Marca quién trabaja este día ({of(open).length} asignado{of(open).length === 1 ? '' : 's'}). Cada cambio se guarda al momento.</p>
          <div className="roster__pick">
            {dept === 'doctors' ? doctors.map((d) => (
              <label key={d.id} className="check-line"><input type="checkbox" disabled={busy || !editable} checked={of(open).some((s) => s.staffId === d.id)} onChange={() => toggle(open, d.id)} />
                <span><b>{d.name}</b><small>{d.specialty ?? 'Médico'}</small></span></label>
            )) : shifts3.map((sh) => (
              <fieldset key={sh.key} className="fs roster__shift"><legend>{sh.label} ({sh.from}–{sh.to})</legend>
                {doctors.map((d) => (
                  <label key={d.id} className="check-line"><input type="checkbox" disabled={busy || !editable || (open < today && fixed !== undefined)} checked={of(open).some((s) => s.staffId === d.id && s.shift === sh.key)} onChange={() => toggle(open, d.id, sh.key)} />
                    <span><b>{d.name}</b></span></label>
                ))}
              </fieldset>
            ))}
          </div>
          <button className="btn btn--primary" onClick={() => setOpen(null)}>Listo</button>
        </aside>
      )}
      </div>
      {repeat && <RepeatShift dept={dept as Exclude<RosterDept, 'doctors'>} people={doctors.map((d) => ({ id: d.id, name: d.name }))} month={month} onClose={() => setRepeat(false)} onDone={() => { setRepeat(false); load() }} />}
    </section>
  )
}

/**
 * DP6 (ronda 11): «Repetir turno»: una persona, un turno y los días de la semana, de una fecha a otra, en una operación (por
 * ejemplo, la Mañana de lunes a viernes de este mes).
 */
function RepeatShift({ dept, people, month, onClose, onDone }: { dept: 'nursing' | 'lab' | 'imaging'; people: { id: string; name: string }[]; month: Date; onClose: () => void; onDone: () => void }) {
  const { notify } = useStore()
  const today = localISODate(new Date())
  const end = localISODate(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const start = localISODate(month) < today ? today : localISODate(month)
  const [staffId, setStaffId] = useState(people[0]?.id ?? '')
  const [shift, setShift] = useState<string>(DEPT_SHIFTS[dept][0].key)
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [from, setFrom] = useState(start)
  const [to, setTo] = useState(end)
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Repetir turno" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!staffId || !days.length || busy || to < from} onClick={async () => {
        setBusy(true)
        try { const r = await api<{ added: number }>('/roster/bulk', { body: { staffId, dept, shift, from, to, weekdays: days } }); notify(`Se asignaron ${r.added} turno(s).`); onDone() } catch (x) { notify((x as Error).message, 'error'); setBusy(false) }
      }}>Asignar</button>
    </>}>
      <label className="field"><span>Persona</span><Combo value={staffId} onChange={setStaffId} options={people.map((p) => ({ value: p.id, label: p.name }))} /></label>
      <div className="field"><span>Turno</span><div className="segmented" role="radiogroup" aria-label="Turno">
        {DEPT_SHIFTS[dept].map((s) => <button key={s.key} type="button" role="radio" aria-checked={shift === s.key} onClick={() => setShift(s.key)}>{s.label}</button>)}</div></div>
      <div className="field"><span>Días de la semana</span><div className="chips">
        {WEEKDAYS.map((w) => <button key={w.d} type="button" className="chip chip--toggle" aria-pressed={days.includes(w.d)} onClick={() => setDays(days.includes(w.d) ? days.filter((x) => x !== w.d) : [...days, w.d])}>{w.l}</button>)}</div></div>
      <div className="form-grid">
        <div className="field"><span>Desde</span><DateField value={from} min={today} onChange={setFrom} label="Desde" /></div>
        <div className="field"><span>Hasta</span><DateField value={to} min={from} onChange={setTo} label="Hasta" /></div>
      </div>
    </Modal>
  )
}
