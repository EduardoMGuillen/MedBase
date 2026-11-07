import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading } from '../components/ui'
import { ClinicalDoc, guardianRow, patientOf, placeOf } from '../components/ClinicalDoc'
import { PdfPages } from '../components/PdfPages'
import { Box, DocError, F, PrintBar, Sec, useAutoPrint } from '../components/SurgicalPrint'
import { anesthesiaNoteLink } from '../components/AnesthesiaSheet'
import { SURGICAL_COUNT } from '../lib/clinicalConfig'
import type { AnesthesiaPrefill } from '../lib/anesthesia'
import { anyIncorrect, blankCountRow, instrumentCounts, prefillCount, type SurgicalCount, type SurgicalCountData } from '../lib/surgicalCount'
import { dateToDisplay } from '../lib/dateInput'
import { dmyTime } from '../lib/format'
import type { Addendum } from '../lib/types'
import '../components/anesthesia.css'

/**
 * PQ5 (ronda 16): el recuento quirúrgico impreso, una hoja Carta con la plantilla de IM1. En blanco (paciente, procedimiento y
 * equipo de la nota, filas «Otros» y de cambio de personal vacías) o con lo que se llenó en el sistema. Instrumentista,
 * circulante y cirujano firman en papel.
 */
export function SurgicalCountDocument({ prefill, data, count, addenda = [] }: { prefill: AnesthesiaPrefill; data?: SurgicalCountData; count?: SurgicalCount; addenda?: Addendum[] }) {
  const { settings, staffById } = useStore()
  const blank = !data
  const d = data ?? { ...prefillCount(prefill), rows: [...prefillCount(prefill).rows, ...Array.from({ length: SURGICAL_COUNT.blankOther }, (_, i) => blankCountRow(`other:${i}`, ''))] }
  const p = prefill.patient
  const handoffs = blank ? Array.from({ length: SURGICAL_COUNT.blankHandoffs }, (_, i) => ({ id: String(i), time: '', role: '', from: '', to: '', count: '' })) : d.handoffs
  const wrong = anyIncorrect(d)
  const yesNo = (v: string) => <><Box on={v === 'Sí'}>Sí</Box><Box on={v === 'No'}>No</Box></>
  const name = (v: string) => v || 'Nombre: ________________'
  return (
    <ClinicalDoc kind="Recuento quirúrgico" at={count?.createdAt} folio={count ? count.id.slice(0, 8).toUpperCase() : undefined} folioNote={blank ? 'Para llenar a mano en sala' : undefined}
      place={placeOf(settings)} className="anes-doc count-doc" stamp={count?.voidedAt ? 'ANULADO' : undefined}
      patient={{ ...patientOf({ firstName: p.firstName, lastName: p.lastName, record: p.record, dni: p.dni, birthDate: p.birthDate ?? '', sex: (p.sex ?? '') as 'F' | 'M' }, settings),
        third: { label: 'Fecha', value: d.date ? dateToDisplay(d.date) : '___/___/______' } }}
      rows={[guardianRow({ dni: p.dni, birthDate: p.birthDate ?? '', guardianName: p.guardianName, guardianDni: p.guardianDni, guardianRelation: p.guardianRelation })]}
      signers={[{ label: 'Instrumentista', name: name(d.scrubNurse), small: true }, { label: 'Circulante', name: name(d.circulatingNurse), small: true }, { label: 'Cirujano', name: name(d.surgeon), small: true }]}
      legends={['Momentos de recuento según AORN; fase «Salida» de la Lista OMS de Verificación de la Seguridad de la Cirugía.',
        count ? `${count.mode === 'system' ? `Llenado y firmado en el sistema por ${count.signer?.name ?? staffById(count.createdBy)?.name ?? '—'}` : 'Subido'} el ${dmyTime(count.createdAt)}${count.version > 1 ? ` · versión ${count.version}` : ''}` : 'Hoja en blanco']}>
      <Sec title="Encabezado" cols={3}>
        <F label="Procedimiento" value={d.procedure} wide long />
        <F label="Cirujano" value={d.surgeon} /><F label="Instrumentista" value={d.scrubNurse} /><F label="Circulante" value={d.circulatingNurse} />
      </Sec>
      <Sec title="Recuento">
        <table className="anes-tbl count-tbl"><thead><tr><th>Material</th>{SURGICAL_COUNT.columns.map((c) => <th key={c.key}>{c.label}</th>)}<th>Resultado</th></tr></thead>
          <tbody>{d.rows.map((r) => <tr key={r.key}>
            <td>{r.key.startsWith('other:') ? <>{SURGICAL_COUNT.otherLabel}: {r.label}</> : r.label}</td>
            {SURGICAL_COUNT.columns.map((c) => <td key={c.key} className={r.key === 'instruments' && !instrumentCounts(c.key) ? 'count-tbl__opt' : undefined}>{r.cells[c.key]}</td>)}
            <td>{blank ? <span className="count-tbl__res"><Box>C</Box><Box>I</Box></span> : <b>{r.result}</b>}</td>
          </tr>)}</tbody></table>
        <p className="anes-note count-tbl__hint">{blank ? 'Resultado: C = Correcto, I = Incorrecto. ' : ''}El instrumental se cuenta al inicio, antes de cerrar herida y en el cambio de personal (casillas sombreadas: opcionales).</p>
      </Sec>
      <Sec title="Cambio de personal">
        <table className="anes-tbl count-tbl count-tbl--handoff"><thead><tr><th>Hora</th><th>Quién se releva</th><th>Entrega</th><th>Recibe</th><th>Recuento</th></tr></thead>
          <tbody>{handoffs.length ? handoffs.map((h) => <tr key={h.id}><td>{h.time}</td><td>{blank ? <><Box>Instrumentista</Box><Box>Circulante</Box></> : h.role}</td><td>{h.from}</td><td>{h.to}</td><td>{h.count}</td></tr>)
            : <tr><td colSpan={5}>Sin cambio de personal.</td></tr>}</tbody></table>
      </Sec>
      {(blank || wrong) && <Sec title="Si algún resultado es «Incorrecto»" cols={2}>
        {SURGICAL_COUNT.searches.map((x) => <div key={x.key} className="anes-f"><i>{x.label}:</i>{yesNo(d.incorrect[x.key])}</div>)}
        <F label="Nota (obligatoria)" value={d.incorrect.note} wide area lines={2} />
      </Sec>}
      <div className="count-confirm"><Box on={d.confirmed}>{SURGICAL_COUNT.confirmation}</Box></div>
      {addenda.length > 0 && <Sec title="Adendas"><div className="anes-addenda">{addenda.map((a) => <p key={a.id}><b>{dmyTime(a.at)} · {staffById(a.authorId)?.name}:</b> {a.corrects ? `Se corrige: ${a.corrects}. ` : ''}{a.text}</p>)}</div></Sec>}
    </ClinicalDoc>
  )
}

/** «En el expediente» (Expediente completo): los recuentos de la estancia. */
export function SurgicalCountRecord({ stayId }: { stayId: string }) {
  const { staffById } = useStore()
  const [list, setList] = useState<{ count: SurgicalCount; prefill?: AnesthesiaPrefill }[] | null>(null)
  useEffect(() => {
    api<SurgicalCount[]>(`/inpatient/${stayId}/surgical-counts`).then(async (all) => setList(await Promise.all(all.map(async (c) =>
      c.mode === 'system' && !c.voidedAt ? { count: c, prefill: (await api<{ prefill: AnesthesiaPrefill }>(`/surgical-counts/${c.id}`).catch(() => null))?.prefill } : { count: c })))).catch(() => setList([]))
  }, [stayId])
  if (!list?.length) return null
  return <>
    <h2 className="fr-h">Recuentos quirúrgicos</h2>
    {list.map(({ count: c, prefill }) => <div key={c.id} className="fr-lab">
      <b>{c.procedure ?? 'Nota postquirúrgica'}</b> · {c.mode === 'system' ? `firmado por ${c.signer?.name ?? '—'}` : `subido por ${staffById(c.createdBy)?.name ?? '—'}`} {dmyTime(c.createdAt)}
      {c.voidedAt ? <p className="muted">Anulado {dmyTime(c.voidedAt)}: {c.voidReason}</p>
        : c.mode === 'system' && c.data && prefill ? <SurgicalCountDocument prefill={prefill} data={c.data} count={c} />
        : c.fileId ? <PdfPages fileId={c.fileId} label="El recuento quirúrgico" /> : null}
    </div>)}
  </>
}

/** «Imprimir recuento en blanco»: desde la tarjeta de la nota (con su equipo) o desde Anexos. */
export function SurgicalCountBlankPage() {
  const { stayId } = useParams()
  const [params] = useSearchParams()
  const [x, setX] = useState<{ prefill: AnesthesiaPrefill } | null>(null)
  const [error, setError] = useState('')
  const note = params.get('nota')
  useEffect(() => { api<{ prefill: AnesthesiaPrefill }>(`/inpatient/${stayId}/surgical-count/blank${note ? `?nota=${note}` : ''}`).then(setX).catch((e: Error) => setError(e.message)) }, [stayId, note])
  useAutoPrint(!!x)
  if (error) return <DocError title="No se puede abrir la hoja." error={error} />
  if (!x) return <Loading label="Preparando la hoja" />
  return <div className="page"><PrintBar title="Recuento quirúrgico en blanco" hint="Hoja Carta. Instrumentista, circulante y cirujano firman en papel." /><SurgicalCountDocument prefill={x.prefill} /></div>
}

/** «Ver» e «Imprimir» de un recuento. */
export default function SurgicalCountPage() {
  const { id } = useParams()
  const { staffById } = useStore()
  const [x, setX] = useState<{ count: SurgicalCount; stayKind: string; prefill: AnesthesiaPrefill } | null>(null)
  const [addenda, setAddenda] = useState<Addendum[]>([])
  const [error, setError] = useState('')
  const [pagesReady, setPagesReady] = useState(false)
  useEffect(() => {
    api<{ count: SurgicalCount; stayKind: string; prefill: AnesthesiaPrefill }>(`/surgical-counts/${id}`).then(async (r) => {
      setX(r)
      if (r.count.mode === 'system') setAddenda(await api<Addendum[]>(`/addenda?ids=${r.count.id}`).catch(() => []))
    }).catch((e: Error) => setError(e.message))
  }, [id])
  useAutoPrint(!!x && (x.count.mode === 'system' || pagesReady))
  if (error) return <DocError title="No se puede abrir el recuento." error={error} />
  if (!x) return <Loading label="Abriendo el recuento quirúrgico" />
  const c = x.count
  return (
    <div className="page">
      <PrintBar title={`Recuento quirúrgico${c.voidedAt ? ' (anulado)' : ''}`} hint="Hoja Carta. Instrumentista, circulante y cirujano firman en papel.">
        <Link className="btn btn--ghost" to={anesthesiaNoteLink(x.stayKind, c.hospitalizationId, c.noteId)}>Ir a la nota</Link>
      </PrintBar>
      {c.voidedAt && <p className="alert-strip alert-strip--amber no-print">Anulado el {dmyTime(c.voidedAt)} por {staffById(c.voidedBy ?? '')?.name ?? '—'}: {c.voidReason}</p>}
      {c.mode === 'system' && c.data
        ? <SurgicalCountDocument prefill={x.prefill} data={c.data} count={c} addenda={addenda} />
        : <>
          <p className="muted no-print">Subido por {staffById(c.createdBy)?.name ?? '—'}, {dmyTime(c.createdAt)}{c.observation ? ` · ${c.observation}` : ''}</p>
          {c.fileId && <div className="signed-doc"><PdfPages fileId={c.fileId} label="El recuento quirúrgico" onReady={() => setPagesReady(true)} /></div>}
        </>}
    </div>
  )
}
