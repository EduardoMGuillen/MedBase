import { Fragment, useState } from 'react'
import { Ban, Droplets, Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { fromLocalValue } from '../lib/dateInput'
import { dateToDisplay } from '../lib/dateInput'
import { dmyTime, inputDateTime, shortStaff } from '../lib/format'
import { FLUID_IN_ITEMS, FLUID_MAX_ENTRY_ML, FLUID_OUT_ITEMS } from '../lib/clinicalConfig'
import { currentFluidsMode, fluidBalance, fluidItemLabel, fluidsSentence, fluidSingleColumn, fluidVisibleItems, fmtMl, signedMl, type FluidRow, type FluidTotals } from '../lib/fluids'
import { DateTimeField } from './DateTimeField'
import { GraceButton, VersionTag } from './Grace'
import { Modal } from './ui'
import type { FluidEntry, InpatientFile } from '../lib/types'

/** El número calculado de líquidos IV, con de qué medicamentos sale (al tocarlo o en el tooltip). */
function IvCell({ t }: { t: FluidTotals }) {
  const [open, setOpen] = useState(false)
  const detail = t.ivSources.map((s) => `${s.label}: ${fmtMl(s.ml)}`).join('\n')
  if (!t.iv) return <>{t.noVolume.length ? <span className="fluids__warn" title={`Sin volumen: ${t.noVolume.join('; ')}`}>0 mL*</span> : '—'}</>
  return (
    <span className="fluids__iv">
      <button type="button" className="link-btn" title={detail} aria-expanded={open} onClick={() => setOpen(!open)}>{fmtMl(t.iv)}{t.noVolume.length ? '*' : ''}</button>
      {open && <span className="fluids__src" role="note">{t.ivSources.map((s) => <span key={s.medId}>{s.label}: <b>{fmtMl(s.ml)}</b></span>)}</span>}
    </span>
  )
}

const cell = (n: number) => (n ? fmtMl(n) : '—')

/**
 * Una tabla por día clínico (07:00 a 07:00): columnas por corte y el total de 24 horas.
 * UI3 (ronda 17): con un solo corte de 24 horas (orden cada 24 horas) no se repite «07:00–07:00» junto a «24 horas»: queda una
 * sola columna.
 */
function DayTable({ periods, total, day, onRecord }: { periods: FluidRow[]; total: FluidTotals; day: string; onRecord?: () => void }) {
  // IE2 (ronda 17): solo los rubros con registros ese día (y Líquidos IV solo si hubo); sin nada, un aviso corto y el botón
  const show = fluidVisibleItems(total)
  const single = fluidSingleColumn(periods)
  const cols: { key: string; label: string; t: FluidTotals }[] = [...(single ? [] : periods.map((p) => ({ key: String(p.start), label: p.label, t: p as FluidTotals }))), { key: 'day', label: '24 horas', t: total }]
  const bal = (n: number) => <b className={n < 0 ? 'fluids__neg' : 'fluids__pos'}>{signedMl(n)}</b>
  return (
    <div className="fluids__day">
      <h4>{dateToDisplay(day)} <small className="muted">(de 07:00 a 07:00)</small></h4>
      {show.empty ? (
        <div className="fluids__empty">
          <p className="muted">Sin registros este día.</p>
          {onRecord && <button type="button" className="btn btn--ghost btn--sm" onClick={onRecord}><Plus size={15} />Registrar ingreso o egreso</button>}
        </div>
      ) : <div className="table-wrap">
        <table className="table fluids__table">
          <thead><tr><th scope="col">mL</th>{cols.map((c) => <th key={c.key} scope="col" className={c.key === 'day' ? 'fluids__total' : ''}>{c.label}</th>)}</tr></thead>
          <tbody>
            <tr className="fluids__group"><th scope="row" colSpan={cols.length + 1}>Ingresos</th></tr>
            {show.iv && <tr><th scope="row">Líquidos IV <small className="muted">(calculado)</small></th>{cols.map((c) => <td key={c.key} className={c.key === 'day' ? 'fluids__total' : ''}><IvCell t={c.t} /></td>)}</tr>}
            {show.in.map((i) => <tr key={i.key}><th scope="row">{i.label}{i.hint ? <small className="muted"> ({i.hint.toLowerCase()})</small> : null}</th>{cols.map((c) => <td key={c.key} className={c.key === 'day' ? 'fluids__total' : ''}>{cell(c.t.in[i.key])}</td>)}</tr>)}
            <tr className="fluids__sum"><th scope="row">Total de ingresos</th>{cols.map((c) => <td key={c.key} className={c.key === 'day' ? 'fluids__total' : ''}>{fmtMl(c.t.totalIn)}</td>)}</tr>
            <tr className="fluids__group"><th scope="row" colSpan={cols.length + 1}>Egresos</th></tr>
            {show.out.map((i) => <tr key={i.key}><th scope="row">{i.label}</th>{cols.map((c) => <td key={c.key} className={c.key === 'day' ? 'fluids__total' : ''}>{cell(c.t.out[i.key])}</td>)}</tr>)}
            <tr className="fluids__sum"><th scope="row">Total de egresos</th>{cols.map((c) => <td key={c.key} className={c.key === 'day' ? 'fluids__total' : ''}>{fmtMl(c.t.totalOut)}</td>)}</tr>
            <tr className="fluids__balance"><th scope="row">Balance</th>{cols.map((c) => <td key={c.key} className={c.key === 'day' ? 'fluids__total' : ''}>{bal(c.t.balance)}</td>)}</tr>
          </tbody>
        </table>
      </div>}
      {(total.noVolume.length > 0 || total.noStart.length > 0) && (
        <ul className="fluids__notes">
          {total.noVolume.length > 0 && <li>* Sin volumen: agrégalo a mano. {total.noVolume.join('; ')}</li>}
          {total.noStart.length > 0 && <li>Infusión sin hora de inicio registrada (no suma hasta registrar el inicio en Medicamentos): {total.noStart.join('; ')}</li>}
        </ul>
      )}
    </div>
  )
}

/**
 * IE1 (ronda 16): «Ingestas y excretas» en la pestaña Signos vitales (debajo de la curva) y en el expediente completo. Sin la
 * orden no aparece. `print`: solo lectura (expediente completo e impresión).
 */
export function FluidBalance({ file, reload, print = false }: { file: InpatientFile; reload?: () => void; print?: boolean }) {
  const { can, staffById, user } = useStore()
  const h = file.hospitalization
  const [now] = useState(() => Date.now())
  const [editing, setEditing] = useState<FluidEntry | 'new' | null>(null)
  const [voiding, setVoiding] = useState<FluidEntry | null>(null)
  const entries = file.fluids ?? []
  const days = fluidBalance({ plan: h.fluidsPlan, meds: file.meds, doses: file.doses, entries, now, dischargedAt: h.dischargedAt })
  if (!h.fluidsPlan?.some((s) => s.mode !== 'off')) return null
  const mode = currentFluidsMode(h.fluidsPlan)
  const record = !print && h.status === 'active' && !!mode && (can('inpatient.care') || can('inpatient.orders'))
  const who = (id: string) => shortStaff(staffById(id)?.name)
  return (
    <section className="panel fluids" data-testid="fluid-balance">
      <div className="panel__head">
        {/* UI3 (ronda 17): «Cuantificar ingestas y excretas cada 24 horas. Los líquidos IV se calculan de la hoja de medicamentos; toca un número para ver de dónde sale.» */}
        <div><h2>Ingestas y excretas</h2><p>{mode ? fluidsSentence(mode) : 'Orden suspendida: el registro queda como estaba.'} Los líquidos IV se calculan de la hoja de medicamentos{print ? '.' : '; toca un número para ver de dónde sale.'}</p></div>
        {record && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing('new')}><Plus size={15} />Registrar ingreso o egreso</button>}
      </div>
      <div className="panel__body">
        {days.length ? days.map((d) => <DayTable key={d.day} day={d.day} periods={d.periods} total={d} onRecord={record ? () => setEditing('new') : undefined} />) : <p className="muted">Todavía no hay datos.</p>}
        <h4 style={{ marginTop: 16 }}>Registros</h4>
        {entries.length ? (
          <div className="table-wrap">
            <table className="table fluids__log">
              <thead><tr><th>Hora</th><th>Tipo</th><th>Cantidad</th><th>Nota</th><th>Registró</th>{!print && <th />}</tr></thead>
              <tbody>{[...entries].reverse().map((e) => (
                <Fragment key={e.id}>
                  <tr className={e.voidedAt ? 'struck-row' : ''}>
                    <td>{dmyTime(e.at)}</td>
                    <td><span className={e.voidedAt ? 'struck' : ''}>{e.kind === 'in' ? 'Ingreso' : 'Egreso'}: {fluidItemLabel(e.kind, e.item)}</span></td>
                    <td><span className={e.voidedAt ? 'struck' : ''}>{fmtMl(e.ml)}</span></td>
                    <td>{e.note ?? ''}{e.voidedAt && <small className="muted" style={{ display: 'block' }}>Anulado por {who(e.voidedBy ?? '')} el {dmyTime(e.voidedAt)}: {e.voidReason}</small>}</td>
                    <td>{who(e.createdBy)} <small className="muted">{dmyTime(e.createdAt)}</small> <VersionTag version={e.version} kind="fluid_entry" id={e.id} /></td>
                    {!print && <td className="fluids__actions">{!e.voidedAt && h.status === 'active' && (<>
                      <GraceButton record={e} authorId={e.createdBy} onCorrect={() => setEditing(e)} />
                      {(e.createdBy === user?.id || can('inpatient.orders')) && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setVoiding(e)}><Ban size={14} />Anular</button>}
                    </>)}</td>}
                  </tr>
                </Fragment>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted">Sin registros manuales.</p>}
      </div>
      {editing && <FluidEntryModal stayId={h.id} entry={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload?.() }} />}
      {voiding && <VoidFluidModal entry={voiding} onClose={() => setVoiding(null)} onSaved={() => { setVoiding(null); reload?.() }} />}
    </section>
  )
}

/** «Registrar ingreso o egreso» (y «Corregir» en el periodo de gracia): tipo, cantidad en mL, hora (ahora) y nota opcional. */
function FluidEntryModal({ stayId, entry, onClose, onSaved }: { stayId: string; entry?: FluidEntry; onClose: () => void; onSaved: () => void }) {
  const { notify } = useStore()
  const [type, setType] = useState(entry ? `${entry.kind}:${entry.item}` : '')
  const [ml, setMl] = useState(entry ? String(entry.ml) : '')
  const [at, setAt] = useState(() => inputDateTime(entry ? new Date(entry.at) : new Date()))
  const [note, setNote] = useState(entry?.note ?? '')
  const [busy, setBusy] = useState(false)
  const n = Number(ml.replace(',', '.'))
  const future = fromLocalValue(at).getTime() > Date.now() + 60_000
  const ok = !!type && n > 0 && n <= FLUID_MAX_ENTRY_ML && !future
  return (
    // UI3 (ronda 17): dos columnas parejas (Tipo y Cantidad; Hora con «Ahora» en la misma línea y Nota), alineadas por arriba
    <Modal title={entry ? 'Corregir registro' : 'Registrar ingreso o egreso'} className="fluid-entry" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!ok || busy} onClick={async () => {
        setBusy(true)
        const [kind, item] = type.split(':')
        const body = { kind, item, ml: n, at: fromLocalValue(at).toISOString(), note: note.trim() || undefined }
        try {
          await api(entry ? `/fluids/${entry.id}` : `/inpatient/${stayId}/fluids`, { method: entry ? 'PATCH' : 'POST', body })
          notify(entry ? 'Corrección guardada' : 'Registro guardado'); onSaved()
        } catch (e) { notify(e instanceof Error ? e.message : 'No se pudo guardar.', 'error') } finally { setBusy(false) }
      }}><Droplets size={15} />{entry ? 'Guardar corrección' : 'Registrar'}</button>
    </>}>
      <div className="form-grid">
        <label className="field"><span>Tipo</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de ingreso o egreso">
            <option value="">Elige…</option>
            <optgroup label="Ingresos">{FLUID_IN_ITEMS.map((i) => <option key={i.key} value={`in:${i.key}`}>{i.label}{i.hint ? ` (${i.hint.toLowerCase()})` : ''}</option>)}</optgroup>
            <optgroup label="Egresos">{FLUID_OUT_ITEMS.map((i) => <option key={i.key} value={`out:${i.key}`}>{i.label}</option>)}</optgroup>
          </select></label>
        <label className="field"><span>Cantidad (mL)</span><input className="input" inputMode="decimal" value={ml} onChange={(e) => setMl(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Cantidad en mL" /></label>
        <div className="field"><span>Hora</span><DateTimeField value={at} invalid={future} onChange={setAt} label="Hora del registro" />
          {future && <small className="field__msg field__msg--error">No puede ser en el futuro.</small>}</div>
        <label className="field"><span>Nota (opcional)</span><input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {n > FLUID_MAX_ENTRY_ML && <small className="field__msg field__msg--error">Revisa la cantidad: más de {FLUID_MAX_ENTRY_ML} mL en un registro.</small>}
    </Modal>
  )
}

function VoidFluidModal({ entry, onClose, onSaved }: { entry: FluidEntry; onClose: () => void; onSaved: () => void }) {
  const { notify } = useStore()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Anular registro" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--danger" disabled={reason.trim().length < 5 || busy} onClick={async () => {
        setBusy(true)
        try { await api(`/fluids/${entry.id}/void`, { body: { reason: reason.trim() } }); notify('Registro anulado'); onSaved() }
        catch (e) { notify(e instanceof Error ? e.message : 'No se pudo anular.', 'error') } finally { setBusy(false) }
      }}>Anular</button>
    </>}>
      <p>{entry.kind === 'in' ? 'Ingreso' : 'Egreso'}: {fluidItemLabel(entry.kind, entry.item)}, {fmtMl(entry.ml)} ({dmyTime(entry.at)}). Queda tachado y deja de sumar.</p>
      <label className="field"><span>Motivo</span><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por ejemplo: registrado en el paciente equivocado" /></label>
    </Modal>
  )
}
