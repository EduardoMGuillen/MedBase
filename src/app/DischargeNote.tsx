import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, LogOut, Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading } from '../components/ui'
import { date, dateTime, dxCode, fullName, legacyTag, time } from '../lib/format'
import { shortDate } from '../lib/consent'
import { medLabel } from '../lib/inpatient'
import { normalize } from '../lib/patients'
import { useDraftSync } from '../lib/drafts'
import { useRxValidity } from '../lib/hooks'
import { DxPicker } from './Inpatients'
import { EpicrisisButton } from './Epicrisis'
import { MedicationForm, MedicationList } from '../components/Medications'
import { RxValidityField } from '../components/RxValidity'
import { ExamsBlock } from '../components/Exams'
import { Addenda, DraftBadge, SignedBadge } from '../components/Addenda'
import type { Diagnosis, EpicrisisData, ExamInput, InpatientFile, InpatientMed, InpatientNote, Patient, PrescriptionItem } from '../lib/types'

const CONDITIONS = ['Mejorado', 'Curado', 'Estable', 'Alta voluntaria', 'Trasladado a otro centro']
const dm = (iso: string) => `${shortDate(iso)} ${time(iso)}`

type Draft = { hea: string; summary: string; dx: Diagnosis[]; condition: string; items: PrescriptionItem[]; exams: ExamInput[]; instructions: string; followUp: string; validity: number }

/** Una orden abierta de la hoja, como renglón de receta (los días los pone el médico). */
const toRx = (m: InpatientMed): PrescriptionItem => ({
  drug: m.drug, presentation: m.presentation ?? '', dose: m.dose, route: m.route,
  frequency: m.prn ? 'Según necesidad' : m.everyHours ? `Cada ${m.everyHours} horas` : 'Dosis única', duration: '', instructions: m.instructions ?? '',
})

/**
 * MC5: la nota de egreso se escribe en la misma hoja y con el mismo orden que la epicrisis, empezando por la HEA:
 * datos del ingreso, diagnósticos de ingreso, HEA (precargada), medicamentos administrados, procedimientos (lo
 * automático), evolución, diagnósticos de egreso, condición, medicamentos al alta, exámenes pendientes, indicaciones y
 * seguimiento. Al guardar se cierra el expediente, se libera la cama, sale la receta y la epicrisis con lo mismo.
 */
export function DischargeWriter({ file, p, onDone }: { file: InpatientFile; p: Patient; onDone: () => void }) {
  const { discharge } = useStore()
  const nav = useNavigate()
  const h = file.hospitalization
  const [pre, setPre] = useState<(EpicrisisData & { pendingExams: string[] }) | null>(null)
  // El campo es CIE-11: los diagnósticos de ingreso de la CIE-10 no se copian, se ofrecen para buscarlos en la CIE-11
  const [dx, setDx] = useState<Diagnosis[]>(() => h.diagnoses.filter((d) => !legacyTag(d)))
  const legacyDx = h.diagnoses.filter((d) => legacyTag(d) && !dx.some((x) => normalize(x.label) === normalize(d.label)))
  const [hea, setHea] = useState('')
  const [summary, setSummary] = useState('')
  const [condition, setCondition] = useState('Mejorado')
  const [items, setItems] = useState<PrescriptionItem[]>([])
  const [medForm, setMedForm] = useState<{ index: number; initial?: PrescriptionItem } | null>(null)
  const [exams, setExams] = useState<ExamInput[]>([])
  const [instructions, setInstructions] = useState('')
  const [followUp, setFollowUp] = useState('Cita de control en consulta externa en 1 semana.')
  const [validity, setValidity] = useRxValidity()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<EpicrisisData & { pendingExams: string[] }>(`/inpatient/${h.id}/discharge-preview`).then((x) => { setPre(x); setHea((cur) => cur || x.hea) }).catch((e: Error) => setError(e.message))
  }, [h.id])

  const snapshot: Draft = { hea, summary, dx, condition, items, exams, instructions, followUp, validity }
  const draft = useDraftSync<Draft>('egreso', h.id, snapshot, (d) => {
    setHea(d.hea ?? ''); setSummary(d.summary ?? ''); if (d.dx?.length) setDx(d.dx); setCondition(d.condition || 'Mejorado'); setItems(d.items ?? [])
    setExams(d.exams ?? []); setInstructions(d.instructions ?? ''); setFollowUp(d.followUp ?? ''); if (d.validity) setValidity(d.validity)
  }, !summary.trim() && !items.length && !exams.length && !instructions.trim())

  if (error) return <section className="panel"><div className="empty">{error}</div></section>
  if (!pre) return <Loading label="Armando la nota de egreso" />
  const open = file.meds.filter((m) => !m.stoppedAt && !items.some((it) => normalize(it.drug) === normalize(m.drug)))
  const hospital = h.kind === 'hospital'
  const missing = [!hea.trim() && hospital && 'la historia de la enfermedad actual', summary.trim().length < 10 && 'la evolución (al menos una línea)', !dx.length && 'el diagnóstico de egreso',
    hospital && !instructions.trim() && !followUp.trim() && 'las indicaciones o la cita de control', medForm && 'terminar el medicamento que estás agregando'].filter(Boolean) as string[]
  const save = async () => {
    setBusy(true)
    const r = await discharge(h.id, { diagnoses: dx, summary: summary.trim(), condition, instructions: instructions.trim(), followUp: followUp.trim() || undefined, items,
      validityDays: items.length ? validity : undefined, hea: hea.trim() || undefined, exams, issueEpicrisis: hospital })
    setBusy(false)
    if (!r) return
    draft.clear()
    // La epicrisis sale con el mismo contenido: se abre para imprimirla o enviarla
    if (r.epicrisisId) nav(`/app/epicrisis/${r.epicrisisId}`)
    else onDone()
  }

  return (
    <section className="panel discharge-write">
      <div className="panel__head">
        <div><h2>Nota de egreso</h2><p>{hospital ? 'Lo que escribes aquí es lo que sale en la epicrisis. Al guardar se cierra el expediente, se libera la cama' : 'Al guardarla se cierra la observación y el paciente sale de la lista'} y, si hay medicamentos al alta, se emite la receta de salida.</p></div>
        <DraftBadge savedAt={draft.savedAt} restored={draft.restored} offline={draft.offline} />
      </div>
      <div className="panel__body">
        <article className="epi epi--write">
          <section className="epi__sec"><h3>1. Datos del ingreso</h3>
            <dl className="epi__facts">
              <div><dt>Ingreso</dt><dd>{dm(pre.admittedAt)}</dd></div>
              <div><dt>Egreso</dt><dd>Al guardar esta nota</dd></div>
              <div><dt>Días de estancia</dt><dd>{pre.stayDays}</dd></div>
              {pre.room && <div><dt>Cuarto</dt><dd>{pre.room}</dd></div>}
              <div><dt>Médico tratante</dt><dd>{pre.attending}</dd></div>
              {pre.observationAt && <div className="epi__wide"><dt>Procedencia</dt><dd>Vino de observación (desde el {dm(pre.observationAt)})</dd></div>}
            </dl>
          </section>
          <section className="epi__sec"><h3>2. Diagnóstico de ingreso</h3>
            {pre.admissionDx.length ? <ol className="note__list">{pre.admissionDx.map((x) => <li key={x.code + x.label}>{x.label} <span className="muted">({dxCode(x)})</span></li>)}</ol> : <p className="muted">Sin diagnóstico de ingreso.</p>}
          </section>
          <section className="epi__sec"><h3>3. Historia de la enfermedad actual</h3>
            <textarea className={`textarea${!hea.trim() && hospital ? ' input--blank' : ''}`} rows={4} value={hea} onChange={(e) => setHea(e.target.value)} aria-label="Historia de la enfermedad actual"
              placeholder="Se precarga de la consulta que lo ingresó o de la nota de ingreso; corrígela si hace falta." />
          </section>
          <section className="epi__sec"><h3>4. Medicamentos administrados durante la estancia</h3>
            {pre.meds.length ? (
              <div className="table-scroll"><table className="epi__table"><thead><tr><th>Medicamento</th><th>Dosis</th><th>Vía</th><th>Frecuencia</th><th>Inicio</th></tr></thead>
                <tbody>{pre.meds.map((m, i) => <tr key={i}><td>{m.drug}</td><td>{m.dose}</td><td>{m.route}</td><td>{m.frequency}</td><td>{shortDate(m.start)}</td></tr>)}</tbody></table></div>
            ) : <p className="muted">No hay dosis administradas registradas en la hoja de medicamentos.</p>}
          </section>
          <section className="epi__sec"><h3>5. Procedimientos realizados</h3>
            {pre.procedures.length ? <ul className="note__list">{pre.procedures.map((x, i) => <li key={i}>{x.name} · {dm(x.at)}</li>)}</ul> : <p className="muted">Sin procedimientos.</p>}
          </section>
          <section className="epi__sec"><h3>6. Evolución y resumen</h3>
            <textarea className={`textarea${summary.trim().length < 10 ? ' input--blank' : ''}`} rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="Evolución y resumen"
              placeholder={`Cómo evolucionó durante la estancia y por qué se da el alta.`} />
          </section>
          <section className="epi__sec"><h3>7. Diagnóstico de egreso</h3>
            <DxPicker label="Diagnóstico de egreso" value={dx} onChange={setDx} recode={legacyDx} />
          </section>
          <section className="epi__sec"><h3>8. Condición al egreso</h3>
            <div className="chips" role="radiogroup" aria-label="Condición al egreso">
              {CONDITIONS.map((c) => <button key={c} type="button" role="radio" className="chip chip--toggle" aria-checked={condition === c} aria-pressed={condition === c} onClick={() => setCondition(c)}>{c}</button>)}
            </div>
          </section>
          <section className="epi__sec"><h3>9. Medicamentos al alta <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>· van a la receta de salida</span></h3>
            {open.length > 0 && <div className="discharge-open">
              <p className="muted" style={{ fontSize: 13.5 }}>Órdenes que siguen abiertas. Si alguna continúa en casa, pásala a la receta y escribe los días.</p>
              <div className="rows">{open.map((m) => (
                <div key={m.id} className="omit-row"><span>{medLabel(m)}{m.days ? '' : ' · hasta nueva orden'}</span>
                  <button type="button" className="btn btn--soft btn--sm" onClick={() => setMedForm({ index: -1, initial: toRx(m) })}><Plus size={14} />Pasar a la receta</button></div>
              ))}</div>
            </div>}
            <MedicationList items={items} patient={p} editing={medForm?.index ?? null} requireDuration
              onEdit={(i) => setMedForm({ index: i, initial: items[i] })} onRemove={(i) => { setItems(items.filter((_, j) => j !== i)); setMedForm(null) }} />
            {!items.length && !medForm && <p className="muted" style={{ fontSize: 14 }}>Sin medicamentos al alta.</p>}
            {medForm ? (
              <MedicationForm key={`${medForm.index}-${medForm.initial?.drug ?? ''}`} patient={p} current={items} initial={medForm.initial} requireDuration
                submitLabel={medForm.index >= 0 ? 'Guardar cambios' : 'Agregar medicamento'}
                onSave={(item) => { setItems(medForm.index >= 0 ? items.map((x, j) => (j === medForm.index ? item : x)) : [...items, item]); setMedForm(null) }}
                onCancel={() => setMedForm(null)} />
            ) : <button type="button" className="btn btn--primary" style={{ justifySelf: 'start' }} onClick={() => setMedForm({ index: -1 })}><Plus size={16} />Agregar medicamento</button>}
            {items.length > 0 && <RxValidityField value={validity} onChange={setValidity} />}
          </section>
          <section className="epi__sec"><h3>10. Exámenes pendientes al alta</h3>
            {pre.pendingExams.length > 0 && <><p className="muted" style={{ fontSize: 13.5 }}>De la estancia, todavía sin resultado:</p><ul className="note__list">{pre.pendingExams.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
            <ExamsBlock value={exams} onChange={setExams} />
          </section>
          <section className="epi__sec"><h3>11. Indicaciones al alta y seguimiento</h3>
            <textarea className="textarea" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} aria-label="Indicaciones al alta" placeholder="Dieta, cuidados de la herida, signos de alarma para regresar." />
            <label className="field" style={{ marginTop: 10 }}><span>Cita de control</span><input className="input" value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></label>
          </section>
        </article>
        {missing.length > 0 && <div className="alert-strip alert-strip--amber" role="status" style={{ marginTop: 12 }}>Falta: {missing.join(', ')}.</div>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <button className="btn btn--primary btn--lg" disabled={missing.length > 0 || busy} onClick={save}><LogOut size={17} />Dar de alta a {fullName(p).split(' ')[0]}{hospital ? ' y emitir la epicrisis' : ''}</button>
          <button className="btn btn--ghost" onClick={onDone}>Seguir después</button>
        </div>
      </div>
    </section>
  )
}

/** La nota de egreso ya guardada: en el mismo orden, con su firma y sus adendas (AN1). */
export function DischargeView({ note, file, reload }: { note: InpatientNote; file: InpatientFile; reload: () => void }) {
  const { staffById, can, user } = useStore()
  const h = file.hospitalization
  const d = note.discharge!
  const author = staffById(note.authorId)
  const dxList = (list: { code: string; label: string }[]) => <ol className="note__list">{list.map((x) => <li key={x.code + x.label}>{x.label} <span className="muted">({dxCode(x)})</span></li>)}</ol>
  return (
    <article className="panel consult-entry">
      <div className="panel__head">
        <div><h2>Nota de egreso</h2><p>{dateTime(note.at)}, {author?.name}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn--primary btn--sm" to={`/app/${h.kind === 'observation' ? 'observacion' : 'hospitalizados'}/${h.id}/expediente`}><FileText size={15} />Expediente completo</Link>
          {h.prescriptionId && <Link className="btn btn--ghost btn--sm" to={`/app/recetas/${h.prescriptionId}`}>Receta de egreso</Link>}
          <EpicrisisButton file={file} />
        </div>
      </div>
      <div className="panel__body">
        <div className="epi epi--write">
          <section className="epi__sec"><h3>Ingreso</h3><p>{date(h.admittedAt)} · {h.diagnoses.map((x) => x.label).join('; ')}</p></section>
          {d.hea && <section className="epi__sec"><h3>Historia de la enfermedad actual</h3><p className="epi-text">{d.hea}</p></section>}
          <section className="epi__sec"><h3>Evolución y resumen</h3><p className="epi-text">{d.summary}</p></section>
          <section className="epi__sec"><h3>Diagnóstico de egreso</h3>{dxList(d.diagnoses)}</section>
          <section className="epi__sec"><h3>Condición al egreso</h3><p>{d.condition}</p></section>
          {d.pendingExams?.length ? <section className="epi__sec"><h3>Exámenes pendientes al alta</h3><ul className="note__list">{d.pendingExams.map((x, i) => <li key={i}>{x}</li>)}</ul></section> : null}
          {(d.instructions || d.followUp) && <section className="epi__sec"><h3>Indicaciones al alta y seguimiento</h3>{d.instructions && <p className="epi-text">{d.instructions}</p>}{d.followUp && <p><b>Cita de control:</b> {d.followUp}</p>}</section>}
        </div>
        <SignedBadge by={author?.name} at={note.at} addenda={(file.addenda ?? []).filter((a) => a.targetId === note.id).length} />
        <Addenda list={file.addenda ?? []} targetKind="note" targetId={note.id} canAdd={can('inpatient.orders') && user?.role === 'doctor'} prescriptionId={h.prescriptionId} onAdded={reload} />
      </div>
    </article>
  )
}
