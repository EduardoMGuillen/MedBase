import { useEffect, useState } from 'react'
import { fromLocalValue } from '../../lib/dateInput'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Printer, TriangleAlert } from 'lucide-react'
import { useStore } from '../../lib/store'
import { Modal } from '../../components/ui'
import { date, dateTime, dmyTime, inputDateTime, localISODate, shortStaff, time } from '../../lib/format'
import { DateTimeField } from '../../components/DateTimeField'
import { mainRole, ROLE_LABEL } from '../../lib/permissions'
import { allergyConflict } from '../../lib/catalogs'
import { doseAt, formatRate, infusionUnitLabel, isLoadingSlot, courseDone, courseEnd, doseTimes, elapsed, LATE_AFTER_MIN, medLabel, slotState, treatmentDay, type SlotState } from '../../lib/inpatient'
import { useNow } from '../../lib/hooks'
import type { Dose, InpatientFile as File, InpatientMed, Patient } from '../../lib/types'
import { serverNow } from '../../lib/api'
import { CorrectionReason, VersionTag } from '../../components/Grace'
import { GenerateRxModal } from '../../components/GenerateRx'
import { dm } from './MedicalNotes'

// Expediente de la estancia: hoja de medicamentos (dosis por hora, semana, suspender y corregir).
export const STATE_LABEL: Record<SlotState, string> = {
  given: 'Administrado', skipped: 'No aplicada', omitted: 'Omitido', late: 'Atrasado', due: 'Toca ahora', upcoming: 'Programado',
  autoskip: 'No aplicada (sin registro)',
}
/** OB1 (ronda 5): resultado de una dosis registrada. */
export const DOSE_LABEL: Record<Dose['status'], string> = { given: 'Administrada', skipped: 'No aplicada', omitted: 'Omitida' }
/** Administrada más de una hora después de la indicada: «con retraso». */
export const givenLate = (d: Dose) => d.status === 'given' && !!d.scheduledAt && new Date(d.givenAt).getTime() - new Date(d.scheduledAt).getTime() > LATE_AFTER_MIN * 60_000
/** Un registro de hace más de 24 horas pide motivo (la misma regla que el servidor). */
export const oldSlot = (now: number, at?: Date) => !!at && at.getTime() < now - 24 * 3_600_000

/** Inicio del día (00:00) de una fecha. */
export const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
/** La semana va de lunes a domingo. */
export const weekStart = (d: Date) => addDays(dayStart(d), -((d.getDay() + 6) % 7))
/** Hasta cuántos días adelante se puede ver lo programado. */
export const AHEAD_DAYS = 7

/**
 * Hoja de medicamentos: vista Día (cada indicación con sus horas; se toca una hora para registrarla) y vista
 * Semana (los 7 días con lo programado y lo aplicado, quién y a qué hora). "Hoy" vuelve al día actual desde
 * cualquier fecha y las flechas recorren los días; no se va antes del ingreso. Un día que ya pasó se ve en
 * modo lectura: registrar o corregir algo ahí pide motivo y queda en la bitácora. Es la misma para
 * hospitalización y observación.
 */
export function MedSheet({ file, p, reload, onWriteNote, focusDose, onFocused }: { file: File; p: Patient; reload: () => void; onWriteNote: () => void; focusDose?: { medId: string; at: string }; onFocused?: () => void }) {
  const { can, staffById } = useStore()
  const [params, setParams] = useSearchParams()
  const now = useNow()
  const today = dayStart(now)
  const isToday = (d: Date) => d.getTime() === today.getTime()
  // Vista y fecha de referencia en la URL: cambiar de Día a Semana conserva la fecha y sobrevive a recargar
  const view: 'day' | 'week' = params.get('vista') === 'semana' ? 'week' : 'day'
  const fromUrl = params.get('fecha')
  const ref = fromUrl && !Number.isNaN(Date.parse(`${fromUrl}T00:00:00`)) ? dayStart(new Date(`${fromUrl}T00:00:00`)) : today
  const go = (next: { view?: 'day' | 'week'; ref?: Date }) => {
    const q = new URLSearchParams(params)
    q.set('tab', 'medicamentos')
    const v = next.view ?? view
    if (v === 'week') q.set('vista', 'semana'); else q.delete('vista')
    const r = next.ref ?? ref
    if (r.getTime() === today.getTime()) q.delete('fecha'); else q.set('fecha', localISODate(r))
    setParams(q, { replace: true })
  }
  const [marking, setMarking] = useState<{ med: InpatientMed; at?: Date; late?: boolean } | null>(null)
  const [correcting, setCorrecting] = useState<{ med: InpatientMed; dose: Dose } | null>(null)
  const [stopping, setStopping] = useState<InpatientMed | null>(null)
  const [stoppingInfusion, setStoppingInfusion] = useState<InpatientMed | null>(null)
  const [fixing, setFixing] = useState(false)
  // GE4 (ronda 9): quien registró una dosis la corrige directo en los primeros minutos (hora del servidor); se vuelve a mirar cada 5 s
  const { user: me } = useStore()
  useNow(5_000)
  const inGrace = (d?: Dose) => !!d?.graceUntil && d.givenBy === me?.id && new Date(d.graceUntil).getTime() > serverNow().getTime()
  const open = file.hospitalization.status === 'active'
  // EN2: «Registrar dosis» desde una alerta abre esa dosis (si es de un día anterior, como registro tardío)
  useEffect(() => {
    if (!focusDose) return
    const med = file.meds.find((m) => m.id === focusDose.medId)
    const at = new Date(focusDose.at)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (med && open && (can('inpatient.care') || can('inpatient.orders'))) setMarking({ med, at, late: at < dayStart(new Date()) })
    onFocused?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDose])
  const admitted = dayStart(new Date(file.hospitalization.admittedAt))
  const last = addDays(today, AHEAD_DAYS)
  const start = view === 'week' ? weekStart(ref) : ref
  const end = addDays(start, view === 'week' ? 7 : 1)
  const shift = (n: number) => go({ ref: addDays(ref, n * (view === 'week' ? 7 : 1)) })
  const past = view === 'day' && ref < today
  const dosesOf = (m: InpatientMed) => file.doses.filter((d) => d.medId === m.id)
  const meds = [...file.meds].sort((a, b) => Number(!!a.stoppedAt) - Number(!!b.stoppedAt) || a.orderedAt.localeCompare(b.orderedAt))
    // Se ve mientras está vigente en el rango (ni suspendida ni vencida antes) o si tuvo dosis en él
    .filter((m) => new Date(m.firstAt) < end && ((!m.stoppedAt || new Date(m.stoppedAt) >= start) && courseEnd(m) > start.getTime()
      || dosesOf(m).some((d) => new Date(d.givenAt) >= start && new Date(d.givenAt) < end)))
  // Enfermería registra las dosis; el médico también puede hacerlo cuando él la aplica
  const care = (can('inpatient.care') || can('inpatient.orders')) && open
  // ME10 (ronda 10): medicamentos activos marcados «No hay en la clínica (va a receta)»
  const canRx = can('chart.view') && (can('inpatient.care') || can('inpatient.orders'))
  const buyMeds = file.meds.filter((m) => m.buyOutside && !m.stoppedAt)
  const [printingRx, setPrintingRx] = useState(false)
  const by = (id: string) => { const s = staffById(id); return s ? `${shortStaff(s.name)}, ${ROLE_LABEL[mainRole(s)].toLowerCase()}` : '' }
  const doseTitle = (dose: Dose) => `${DOSE_LABEL[dose.status]}${givenLate(dose) ? ' con retraso' : ''} por ${by(dose.givenBy)}, ${dm(dose.givenAt)}${dose.note ? `: ${dose.note}` : ''}${dose.correctionReason ? `. ${dose.correctionReason.startsWith('Registro tardío') ? '' : 'Corregido: '}${dose.correctionReason} (${shortStaff(staffById(dose.correctedBy ?? '')?.name)})` : ''}`
  const label = view === 'week'
    ? `${date(start.toISOString(), { day: 'numeric', month: 'short' })} – ${date(addDays(end, -1).toISOString(), { day: 'numeric', month: 'short' })}`
    : ref.getTime() === today.getTime() ? `Hoy, ${date(ref.toISOString(), { weekday: 'short', day: 'numeric', month: 'short' })}` : date(ref.toISOString(), { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <section className="panel" data-tour="hoja-medicamentos">
      <div className="panel__head medsheet__head">
        <div><h2>Hoja de medicamentos</h2><p>Se llena sola con lo que el médico indica en sus notas. {care ? 'Toca una hora para registrar la dosis; queda con tu nombre y tu rol.' : 'Enfermería registra cada dosis.'}</p>
          {/* ME10 (ronda 10): la receta de lo que no hay en la clínica (médico y enfermería; la marca solo la pone el médico) */}
          {/* ME12 (ronda 11): el médico genera la receta con cualquier medicamento activo; enfermería imprime los marcados */}
          {canRx && (can('inpatient.orders') ? file.meds.some((m) => !m.stoppedAt) : buyMeds.length > 0) && <button className="btn btn--soft btn--sm" style={{ marginTop: 8 }} onClick={() => setPrintingRx(true)}><Printer size={15} />{can('inpatient.orders') ? 'Generar receta' : 'Imprimir receta'}</button>}</div>
        <div className="medsheet__nav">
          <div className="segmented" role="radiogroup" aria-label="Vista">
            <button role="radio" aria-checked={view === 'day'} onClick={() => go({ view: 'day' })}>Día</button>
            <button role="radio" aria-checked={view === 'week'} onClick={() => go({ view: 'week' })}>Semana</button>
          </div>
          <div className="day-nav">
            <button className="icon-btn" aria-label={view === 'week' ? 'Semana anterior' : 'Día anterior'} disabled={start <= admitted} onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
            <b className={ref.getTime() === today.getTime() || (view === 'week' && today >= start && today < end) ? 'is-today' : ''}>{label}</b>
            <button className="icon-btn" aria-label={view === 'week' ? 'Semana siguiente' : 'Día siguiente'} disabled={addDays(start, view === 'week' ? 7 : 1) > last} onClick={() => shift(1)}><ChevronRight size={18} /></button>
          </div>
          <button className="btn btn--soft btn--sm" disabled={ref.getTime() === today.getTime()} onClick={() => go({ ref: today })}>Hoy</button>
        </div>
      </div>
      {past && (
        <div className="alert-strip alert-strip--calm medsheet__past wrap">
          <span>Día pasado: se muestra lo que se registró, en modo lectura.{fixing ? ' Toca una hora para registrarla tarde o una dosis para corregirla; pide motivo y queda en la bitácora.' : ''}</span>
          {care && <button className="btn btn--ghost btn--sm" onClick={() => setFixing(!fixing)}>{fixing ? 'Terminar' : 'Corregir registros'}</button>}
        </div>
      )}
      {!meds.length ? (
        <div className="empty">
          No hay medicamentos indicados para {view === 'week' ? 'esta semana' : 'este día'}.
          {can('inpatient.orders') && open && <> <button className="linklike" onClick={onWriteNote}>Escribe una nota con indicaciones</button>.</>}
        </div>
      ) : view === 'week' ? (
        <WeekGrid meds={meds} start={start} today={today} admitted={admitted} dosesOf={dosesOf} by={by} doseTitle={doseTitle} onDay={(d) => go({ view: 'day', ref: d })} />
      ) : (
        <div className="medsheet">
          {meds.map((m) => {
            const slots = doseTimes(m, start, end)
            const doses = dosesOf(m)
            const prnToday = doses.filter((d) => !d.scheduledAt && new Date(d.givenAt) >= start && new Date(d.givenAt) < end)
            const conflict = allergyConflict(p.allergies, m.drug)
            // ME1 (ronda 8): una infusión tiene un solo evento, su inicio; ya iniciada, la fila dice desde cuándo y a qué velocidad
            const started = m.infusionRate ? doses.filter((d) => d.status === 'given').sort((x, y) => x.givenAt.localeCompare(y.givenAt))[0] : undefined
            const running = !!started && new Date(started.givenAt) < end
            return (
              <div key={m.id} className={`med ${m.stoppedAt ? 'med--stopped' : ''}`}>
                <div className="med__head">
                  <div>
                    <strong>{medLabel(m)}{m.buyOutside && <span className="badge badge--amber rx-tag" title={`No hay en la clínica: va a receta${m.buyQuantity ? ` (comprar ${m.buyQuantity})` : ''}`}>Receta</span>}</strong>
                    <span className="muted">{m.presentation ? `${m.presentation}. ` : ''}{m.instructions ? `${m.instructions} ` : ''}{medOrigin(m, file, staffById(m.orderedBy)?.name)}</span>
                    {m.stoppedAt
                      ? <span className="muted">{m.stopReason === 'Egreso' ? 'Terminó con el egreso' : `Suspendido por ${shortStaff(staffById(m.stoppedBy ?? '')?.name)} ${dm(m.stoppedAt)}${m.stopReason ? `: ${m.stopReason}` : ''}`}</span>
                      : <span className="muted"><b>{treatmentDay(m, start)}</b></span>}
                    {conflict && <span className="badge badge--red"><TriangleAlert size={12} />Alergia a {conflict}</span>}
                  </div>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {m.stoppedAt ? <span className="badge badge--red">{m.stopReason?.startsWith('Cambiado') ? 'Modificado' : 'Suspendido'} {dateTime(m.stoppedAt)}</span>
                      : courseDone(m, now) ? <span className="badge">Completado</span> : <span className="badge badge--mint">Activo</span>}
                    {!m.stoppedAt && !courseDone(m, now) && open && can('inpatient.orders') && <button className="btn btn--ghost btn--sm" onClick={() => setStopping(m)}>Suspender</button>}
                  </span>
                </div>
                <div className="slots">
                  {/* OB1 (ronda 5): las dosis atrasadas de días anteriores se ven (y se registran) desde el día de hoy */}
                  {isToday(ref) && doseTimes(m, new Date(m.firstAt), start)
                    .filter((s) => slotState(s.at, s.omitted, doses.find((d) => d.scheduledAt && new Date(d.scheduledAt).getTime() === s.at.getTime()), undefined, m.everyHours) === 'late')
                    .map((s) => (
                      <button key={s.at.toISOString()} className="slot2 slot2--late slot2--prev" disabled={!care} onClick={() => setMarking({ med: m, at: s.at, late: true })}
                        title={`Dosis atrasada del ${date(s.at.toISOString())} a las ${time(s.at.toISOString())}`}>
                        <b>{time(s.at.toISOString())}</b>
                        <small>{date(s.at.toISOString(), { day: '2-digit', month: '2-digit' })} · Atrasado</small>
                      </button>
                    ))}
                  {running && (
                    <span className="infusion-run">
                      {m.infusionStoppedAt
                        ? <>Infusión suspendida el {dmyTime(m.infusionStoppedAt)} por {by(m.infusionStoppedBy ?? '')}{m.infusionStopNote ? `: ${m.infusionStopNote}` : ''}. Estuvo desde {dmyTime(started!.givenAt)} · {formatRate(m.infusionRate!)} {infusionUnitLabel(m.infusionUnit)}.</>
                        : <><b>En infusión desde {time(started!.givenAt)} · {formatRate(m.infusionRate!)} {infusionUnitLabel(m.infusionUnit)}</b>{new Date(started!.givenAt) < start ? ` (desde el ${dmyTime(started!.givenAt)})` : ''} · inició {by(started!.givenBy)}</>}
                      {care && !m.infusionStoppedAt && !m.stoppedAt && isToday(ref) && <button className="btn btn--ghost btn--sm" onClick={() => setStoppingInfusion(m)}>Suspender infusión</button>}
                    </span>
                  )}
                  {!running && slots.map((s) => {
                    const dose = doses.find((d) => d.scheduledAt && new Date(d.scheduledAt).getTime() === s.at.getTime())
                    const st = slotState(s.at, s.omitted, dose, undefined, m.everyHours)
                    // Hoy se registra directo; en un día pasado sólo en "Corregir registros"; lo futuro no se toca
                    const clickable = care && !s.omitted && s.at.getTime() <= Date.now() + 30 * 60_000 && (dose ? fixing || inGrace(dose) : !past || fixing)
                    return (
                      <button key={s.at.toISOString()} className={`slot2 slot2--${st}${dose?.correctionReason ? ' slot2--fixed' : ''}`} disabled={!clickable}
                        onClick={() => (dose ? setCorrecting({ med: m, dose }) : setMarking({ med: m, at: s.at, late: past }))}
                        title={dose ? doseTitle(dose) : st === 'autoskip' ? 'No aplicada (sin registro). Cerrada automáticamente por el sistema al llegar la siguiente dosis. Todavía se puede registrar.' : STATE_LABEL[st]}>
                        <b>{time(s.at.toISOString())}</b>
                        {/* ME2 (ronda 8): la dosis inicial lleva su etiqueta y su cantidad. ME1: el evento de una infusión es su inicio */}
                        {isLoadingSlot(m, s.at) && <em className="slot2__tag">Dosis inicial · {m.loadingDose}</em>}
                        {m.infusionRate && !dose && <em className="slot2__tag">Inicio de la infusión</em>}
                        <small>{dose ? `${dose.status === 'given' ? '✓' : '✗'} ${time(dose.givenAt)}${givenLate(dose) ? ' con retraso' : ''} ${by(dose.givenBy)}` : STATE_LABEL[st]}</small>
                        {inGrace(dose) && <small className="slot2__grace">Corregir · hasta {time(dose!.graceUntil!)}</small>}
                        {dose?.version && <small className="slot2__grace">Corregida · v{dose.version}</small>}
                      </button>
                    )
                  })}
                  {m.prn && (<>
                    {/* MC2 (ronda 6): fila PRN, sin horas programadas: nunca pendiente ni atrasada. Muestra la última vez que se dio */}
                    {(() => { const lastGiven = doses.filter((d) => d.status === 'given').sort((x, y) => y.givenAt.localeCompare(x.givenAt))[0]
                      return <span className="prn-last">{lastGiven ? <>Última dosis: <b>{dm(lastGiven.givenAt)}</b> · {by(lastGiven.givenBy)}</> : 'Todavía sin dosis.'}</span> })()}
                    {prnToday.map((d) => (
                      <button key={d.id} className={`slot2 slot2--given${d.correctionReason ? ' slot2--fixed' : ''}`} disabled={!(care && (fixing || inGrace(d)))} onClick={() => setCorrecting({ med: m, dose: d })}
                        title={doseTitle(d)}><b>{time(d.givenAt)}</b><small>✓ {by(d.givenBy)}</small>
                        {inGrace(d) && <small className="slot2__grace">Corregir · hasta {time(d.graceUntil!)}</small>}</button>
                    ))}
                    {care && !m.stoppedAt && (ref.getTime() === today.getTime() || fixing) && (
                      <button className="slot2 slot2--prn" onClick={() => setMarking({ med: m, late: past })}><b><Plus size={13} /> PRN</b><small>Registrar dosis</small></button>
                    )}
                    {!prnToday.length && !(care && !m.stoppedAt && ref.getTime() === today.getTime()) && <span className="c-muted fs-md">Según necesidad. Sin dosis este día.</span>}
                  </>)}
                  {!m.prn && !slots.length && !running && <span className="c-muted fs-md">Sin dosis este día.</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="legend">
        {(['given', 'due', 'late', 'upcoming', 'skipped', 'omitted', 'autoskip'] as SlotState[]).map((s) => <span key={s}><i className={`slot2--${s}`} />{STATE_LABEL[s]}{s === 'autoskip' ? ': cerrada automáticamente por el sistema al llegar la siguiente dosis' : ''}</span>)}
      </div>
      {printingRx && <GenerateRxModal meds={file.meds} onClose={() => setPrintingRx(false)} />}
      {marking && <DoseModal med={marking.med} at={marking.at} late={marking.late} doses={dosesOf(marking.med)} onClose={() => setMarking(null)} onSaved={() => { setMarking(null); reload() }} />}
      {correcting && <CorrectDoseModal med={correcting.med} dose={correcting.dose} onClose={() => setCorrecting(null)} onSaved={() => { setCorrecting(null); reload() }} />}
      {stopping && <StopModal med={stopping} onClose={() => setStopping(null)} onSaved={() => { setStopping(null); reload() }} />}
      {stoppingInfusion && <StopInfusionModal med={stoppingInfusion} onClose={() => setStoppingInfusion(null)} onSaved={() => { setStoppingInfusion(null); reload() }} />}
    </section>
  )
}

/**
 * Semana: una fila por medicamento y una columna por día con lo programado y lo aplicado (quién y a qué
 * hora). En el celular se desliza de lado sin romper la página. Tocar un día abre su vista Día.
 */
export function WeekGrid({ meds, start, today, admitted, dosesOf, by, doseTitle, onDay }: {
  meds: InpatientMed[]; start: Date; today: Date; admitted: Date; dosesOf: (m: InpatientMed) => Dose[]; by: (id: string) => string; doseTitle: (d: Dose) => string; onDay: (d: Date) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="medweek" role="region" aria-label="Hoja de la semana" tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Medicamento</th>{days.map((d) => (
          <th key={d.toISOString()} scope="col" className={`${d.getTime() === today.getTime() ? 'is-today' : ''} ${d < admitted ? 'is-before' : ''}`}>
            <button className="linklike" disabled={d < admitted} onClick={() => onDay(d)}>{date(d.toISOString(), { weekday: 'short', day: 'numeric' })}</button></th>
        ))}</tr></thead>
        <tbody>{meds.map((m) => (
          <tr key={m.id} className={m.stoppedAt ? 'is-stopped' : ''}>
            <th scope="row">{medLabel(m)}{m.stoppedAt && <small>Suspendido {dm(m.stoppedAt)}</small>}</th>
            {days.map((d) => {
              const next = addDays(d, 1)
              const doses = dosesOf(m)
              const slots = doseTimes(m, d, next)
              const prn = doses.filter((x) => !x.scheduledAt && new Date(x.givenAt) >= d && new Date(x.givenAt) < next)
              return (
                <td key={d.toISOString()} className={d.getTime() === today.getTime() ? 'is-today' : ''}>
                  {slots.map((s) => {
                    const dose = doses.find((x) => x.scheduledAt && new Date(x.scheduledAt).getTime() === s.at.getTime())
                    const st = slotState(s.at, s.omitted, dose, undefined, m.everyHours)
                    return <span key={s.at.toISOString()} className={`wk wk--${st}`} title={dose ? doseTitle(dose) : STATE_LABEL[st]}>
                      <b>{time(s.at.toISOString())}</b>{dose ? ` ${dose.status === 'given' ? '✓' : '✗'} ${time(dose.givenAt)} ${by(dose.givenBy)}` : ''}</span>
                  })}
                  {prn.map((x) => <span key={x.id} className="wk wk--given" title={doseTitle(x)}><b>PRN</b> ✓ {time(x.givenAt)} {by(x.givenBy)}</span>)}
                  {!slots.length && !prn.length && <span className="muted">—</span>}
                </td>
              )
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

/** "Indicado en nota de consulta externa, Dra. Solórzano, 22/10 17:40". */
export function medOrigin(m: InpatientMed, file: File, who?: string) {
  const note = m.noteId ? file.notes.find((n) => n.id === m.noteId) : undefined
  const where = m.source === 'consultation' ? 'nota de consulta externa'
    : note ? (note.kind === 'admission' ? 'nota de ingreso' : file.hospitalization.kind === 'observation' ? 'nota de observación' : 'nota de evolución') : 'indicación médica'
  return `Indicado en ${where}, ${who ?? 'médico'}, ${dm(m.orderedAt)}.`
}

/** ME1 (ronda 8): «Suspender infusión»: la hora (ahora, por omisión), quién (queda solo) y un motivo opcional. */
export function StopInfusionModal({ med, onClose, onSaved }: { med: InpatientMed; onClose: () => void; onSaved: () => void }) {
  const { stopInfusion } = useStore()
  const [when, setWhen] = useState(() => inputDateTime(new Date()))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Suspender infusión" className="dose-modal" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--danger" disabled={busy} onClick={async () => {
        setBusy(true)
        const ok = await stopInfusion(med.id, { at: fromLocalValue(when).toISOString(), note: note.trim() || undefined })
        setBusy(false)
        if (ok) onSaved()
      }}>Suspender infusión</button>
    </>}>
      <p>{medLabel(med)}. Queda con tu nombre, tu rol y la hora.</p>
      <div className="field"><span>Hora</span><DateTimeField value={when} max={inputDateTime(new Date())} onChange={setWhen} label="Hora en que se suspendió" /></div>
      <label className="field"><span>Motivo (opcional)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Se terminó la mezcla; el médico lo indicó" /></label>
    </Modal>
  )
}

/** El médico suspende una orden desde la hoja: pide el motivo; la orden queda en la hoja como suspendida. */
export function StopModal({ med, onClose, onSaved }: { med: InpatientMed; onClose: () => void; onSaved: () => void }) {
  const { stopMed } = useStore()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={`Suspender ${med.drug}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--danger" disabled={reason.trim().length < 3 || busy} onClick={async () => {
        setBusy(true)
        const ok = await stopMed(med.id, reason.trim())
        setBusy(false)
        if (ok) onSaved()
      }}>Suspender</button>
    </>}>
      <p>{medLabel(med)}. Desde ahora las dosis que siguen salen como suspendidas; lo ya aplicado se conserva.</p>
      <label className="field"><span>Motivo (queda con tu nombre y la hora)</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Ya no presenta vómitos" /></label>
    </Modal>
  )
}

export function DoseModal({ med, at, late = false, doses, onClose, onSaved }: { med: InpatientMed; at?: Date; late?: boolean; doses: Dose[]; onClose: () => void; onSaved: () => void }) {
  const { recordDose } = useStore()
  // OB1 (ronda 5): Administrada (aunque sea tarde), No aplicada u Omitida; las dos últimas con motivo
  const [status, setStatus] = useState<Dose['status']>('given')
  const given = status === 'given'
  // La hora en que se abrió el diálogo: si la dosis ya iba atrasada y si es de hace más de 24 horas
  const [opened] = useState(() => Date.now())
  const old = oldSlot(opened, at)
  // En un día pasado la hora real empieza en la hora indicada
  const [when, setWhen] = useState(() => inputDateTime(late && at ? at : new Date()))
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  // Un PRN con intervalo mínimo avisa si la última dosis fue hace muy poco
  const last = med.prn ? doses.filter((d) => d.status === 'given').sort((a, b) => b.givenAt.localeCompare(a.givenAt))[0] : undefined
  const tooSoon = last && med.everyHours && Date.now() - new Date(last.givenAt).getTime() < med.everyHours * 3_600_000
  return (
    <Modal title={med.nebulization ? 'Nebulización' : medLabel(med)} className="dose-modal" steady onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className={`btn ${given ? 'btn--primary' : 'btn--danger'}`} disabled={busy || (!given && !note.trim()) || (old && reason.trim().length < 5)} onClick={async () => {
        setBusy(true)
        const ok = await recordDose(med.id, { scheduledAt: at?.toISOString(), givenAt: fromLocalValue(when).toISOString(), status, note: note.trim() || undefined, reason: old ? reason.trim() : undefined })
        setBusy(false)
        if (ok) onSaved()
      }}>{given ? (med.infusionRate ? 'Registrar inicio' : 'Registrar administración') : status === 'omitted' ? 'Registrar como omitida' : 'Registrar como no aplicada'}</button>
    </>}>
      <p>{at ? <>Dosis de las <b>{time(at.toISOString())}</b>{at.toDateString() !== new Date().toDateString() ? ` del ${date(at.toISOString())}` : ''}.
        {at.getTime() < opened - LATE_AFTER_MIN * 60_000 && <> <span className="badge badge--amber">Atrasada</span></>}</> : <>Dosis según necesidad (PRN){med.prnCondition ? `: ${med.prnCondition}` : ''}. Queda con tu nombre, tu rol y la hora real.</>}</p>
      {/* ME4 (ronda 9): una sesión de nebulización es una sola administración de todos sus componentes */}
      {med.nebulization && <div className="alert-strip alert-strip--calm" style={{ margin: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
        <b>Nebulizar con:</b>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{med.nebulization.components.map((c, i) => <li key={i}>{c.drug} {c.amount}</li>)}</ul>
        {med.nebulization.diluent?.trim() && <span>Diluido en {med.nebulization.diluentVolume ? `${med.nebulization.diluentVolume} de ` : ''}{med.nebulization.diluent}</span>}
      </div>}
      {/* ME2 (ronda 8): la cantidad propuesta es la de esta dosis (la inicial o las siguientes) y queda guardada en el registro */}
      {med.loadingDose && at && <p className="alert-strip alert-strip--amber m-0">{isLoadingSlot(med, at) ? 'Dosis inicial' : 'Dosis siguiente'}: <b>{doseAt(med, at)}</b></p>}
      {/* ME1: el evento de una infusión es su inicio; después la fila queda «En infusión desde…» */}
      {med.infusionRate && <p className="c-muted m-0">Registra el inicio de la infusión a {formatRate(med.infusionRate)} {infusionUnitLabel(med.infusionUnit)}.</p>}
      {tooSoon && <div className="alert-strip"><TriangleAlert size={16} />La última dosis fue a las {time(last!.givenAt)}; la indicación es cada {med.everyHours} horas.</div>}
      {at && (
        <DoseStatus value={status} onChange={(s) => { setStatus(s); setNote('') }} />
      )}
      {!given && <p className="c-muted fs-md">Con el motivo, la dosis deja de alertar y queda en la hoja como {status === 'omitted' ? 'omitida' : 'no aplicada'}.</p>}
      <div className="field"><span>{med.infusionRate && given ? 'Hora de inicio real' : 'Hora real'}</span><DateTimeField value={when} max={inputDateTime(new Date())} onChange={setWhen} label="Hora real" /></div>
      {given && at && fromLocalValue(when).getTime() - at.getTime() > LATE_AFTER_MIN * 60_000 && (
        <p className="c-muted fs-md">Queda como administrada con retraso: {elapsed(Math.round((fromLocalValue(when).getTime() - at.getTime()) / 60_000))} después de la hora indicada.</p>)}
      {!given && <SkipReasons value={note} onChange={setNote} reasons={status === 'omitted' ? OMIT_REASONS : SKIP_REASONS} />}
      <label className="field"><span>{given ? 'Observación (opcional)' : status === 'omitted' ? 'Motivo por el que se omitió' : 'Motivo por el que no se aplicó'}</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={given ? 'Ej. Dolor 7/10' : status === 'omitted' ? 'Ej. Suspendida por el médico' : 'Ej. Paciente en ayuno para cirugía'} /></label>
      {old && <label className="field"><span>Motivo del registro tardío (queda en la bitácora)</span>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Se aplicó en el turno de noche y no se registró" /></label>}
    </Modal>
  )
}

/** EN2: motivos frecuentes de una dosis no aplicada, de un toque; el texto se puede completar. */
export const SKIP_REASONS = ['Paciente en ayuno', 'El paciente la rechazó', 'Paciente fuera del servicio (estudio o quirófano)', 'No hay el medicamento']
/** OB1 (ronda 5): una dosis omitida es la que se decidió no dar. */
export const OMIT_REASONS = ['Suspendida por el médico', 'Cambio de indicación', 'Ya no corresponde (egreso o traslado)']
export function SkipReasons({ value, onChange, reasons = SKIP_REASONS }: { value: string; onChange: (v: string) => void; reasons?: string[] }) {
  return (
    <div className="chips" role="group" aria-label="Motivos frecuentes">
      {reasons.map((r) => <button key={r} type="button" className="chip chip--toggle" aria-pressed={value === r} onClick={() => onChange(r)}>{r}</button>)}
    </div>
  )
}

/** OB1 (ronda 5): Administrada, No aplicada u Omitida. */
/** EN4 (ronda 10): las tres pestañas como control segmentado a todo el ancho, iguales, de 44 px o más, con la elegida marcada. */
export function DoseStatus({ value, onChange }: { value: Dose['status']; onChange: (s: Dose['status']) => void }) {
  return (
    <div className="segmented dose-tabs" role="radiogroup" aria-label="Resultado">
      {(['given', 'skipped', 'omitted'] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)}>{DOSE_LABEL[s]}</button>)}
    </div>
  )
}

/** Corregir una dosis ya registrada: pide motivo; el registro anterior se guarda y queda en la bitácora. */
export function CorrectDoseModal({ med, dose, onClose, onSaved }: { med: InpatientMed; dose: Dose; onClose: () => void; onSaved: () => void }) {
  const { correctDose, user } = useStore()
  // GE4 (ronda 9): en el periodo de gracia, quien la registró la corrige sin motivo obligatorio (queda como versión nueva)
  const grace = !!dose.graceUntil && dose.givenBy === user?.id && new Date(dose.graceUntil).getTime() > serverNow().getTime()
  const [status, setStatus] = useState<Dose['status']>(dose.status)
  const given = status === 'given'
  const [when, setWhen] = useState(inputDateTime(new Date(dose.givenAt)))
  const [note, setNote] = useState(dose.note ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={`Corregir: ${medLabel(med)}`} className="dose-modal" steady onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={busy || (!grace && reason.trim().length < 5) || (!given && !note.trim())} onClick={async () => {
        setBusy(true)
        const ok = await correctDose(dose.id, { status, givenAt: fromLocalValue(when).toISOString(), note: note.trim() || undefined, reason: reason.trim() || undefined, grace: grace || undefined })
        setBusy(false)
        if (ok) onSaved()
      }}>Guardar corrección</button>
    </>}>
      <p className="c-muted fs-base">Registrada como {DOSE_LABEL[dose.status].toLowerCase()} a las {time(dose.givenAt)} del {date(dose.givenAt)}. El registro anterior se conserva.{grace ? ` Corregible hasta ${time(dose.graceUntil!)}.` : ''}</p>
      <p className="m-0"><VersionTag version={dose.version} kind="dose" id={dose.id} render={(x) => <span>{DOSE_LABEL[x.status as Dose['status']] ?? String(x.status)} a las {dmyTime(String(x.givenAt))}{x.note ? `: ${String(x.note)}` : ''}</span>} /></p>
      {dose.scheduledAt && <DoseStatus value={status} onChange={setStatus} />}
      <div className="field"><span>Hora real</span><DateTimeField value={when} max={inputDateTime(new Date())} onChange={setWhen} label="Hora real" /></div>
      {!given && <SkipReasons value={note} onChange={setNote} reasons={status === 'omitted' ? OMIT_REASONS : SKIP_REASONS} />}
      <label className="field"><span>{given ? 'Observación (opcional)' : status === 'omitted' ? 'Motivo por el que se omitió' : 'Motivo por el que no se aplicó'}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {grace ? <CorrectionReason value={reason} onChange={setReason} />
        : <label className="field"><span>Motivo de la corrección (queda en la bitácora)</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Se anotó una hora equivocada" /></label>}
    </Modal>
  )
}

// ---------- Notas médicas ----------
