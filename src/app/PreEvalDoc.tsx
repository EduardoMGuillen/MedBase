import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Loading } from '../components/ui'
import { ClinicalDoc, guardianRow, patientOf, placeOf, type DocSigner } from '../components/ClinicalDoc'
import { PdfPages } from '../components/PdfPages'
import { Blank, Box, DocError, F, PrintBar, Sec, useAutoPrint } from '../components/SurgicalPrint'
import { ANESTHESIA_SHEET, ANESTHESIA_SOURCES, PREANESTHESIA_LABS } from '../lib/clinicalConfig'
import { prefillPreEval, type PreEval, type PreEvalData, type PreEvalPrefill } from '../lib/preanesthesia'
import type { AnesthesiaPrefill } from '../lib/anesthesia'
import { dateToDisplay } from '../lib/dateInput'
import { dmyTime } from '../lib/format'
import type { Addendum } from '../lib/types'
import '../components/anesthesia.css'

/**
 * PQ4 (ronda 16): la valoración preanestésica impresa, una hoja Carta, con la plantilla de IM1 y las secciones del PNG de la
 * «Hoja única». En blanco (para llenarla a mano, con los datos que ya hay) o con lo que se escribió en el sistema. El espacio
 * para la firma y el sello del anestesiólogo siempre queda.
 */
const stayPath = (kind: string, id: string) => `/app/${kind === 'observation' ? 'observacion' : 'hospitalizados'}/${id}`

export function PreEvalDocument({ prefill, data, ev, addenda = [] }: { prefill: AnesthesiaPrefill | PreEvalPrefill; data?: PreEvalData; ev?: PreEval; addenda?: Addendum[] }) {
  const { settings, staffById } = useStore()
  const blank = !data
  const d = data ?? { ...prefillPreEval(prefill), date: '' }
  const p = prefill.patient
  const signer: DocSigner = ev?.signer
    ? { label: 'Firma y sello del anestesiólogo', name: ev.signer.name, title: ev.signer.title, license: ev.signer.license, signatureId: ev.signer.signatureId, stampId: ev.signer.stampId }
    : { label: 'Firma y sello del anestesiólogo', name: 'Nombre: ______________________', title: 'Especialidad: ________________', license: 'Colegiado: ____________' }
  return (
    <ClinicalDoc kind="Valoración preanestésica" at={ev?.createdAt} folio={ev ? ev.id.slice(0, 8).toUpperCase() : undefined} folioNote={blank ? 'Para llenar a mano' : undefined}
      place={placeOf(settings)} className="anes-doc preeval-doc" stamp={ev?.voidedAt ? 'ANULADA' : undefined}
      patient={{ ...patientOf({ firstName: p.firstName, lastName: p.lastName, record: p.record, dni: p.dni, birthDate: p.birthDate ?? '', sex: (p.sex ?? '') as 'F' | 'M' }, settings),
        third: { label: 'Fecha', value: d.date ? dateToDisplay(d.date) : '___/___/______' } }}
      rows={[guardianRow({ dni: p.dni, birthDate: p.birthDate ?? '', guardianName: p.guardianName, guardianDni: p.guardianDni, guardianRelation: p.guardianRelation })]}
      heading="Valoración preanestésica" signers={[signer]}
      legends={[ANESTHESIA_SOURCES, `${ev ? `${ev.mode === 'system' ? 'Escrita y firmada en el sistema' : 'Subida'} el ${dmyTime(ev.createdAt)}${ev.version > 1 ? ` · versión ${ev.version}` : ''}` : 'Hoja en blanco'}. Sin la firma y el sello del anestesiólogo en papel no vale.`]}>
      <Sec title="Paciente y cirugía propuesta" cols={4}>
        <F label="Peso" value={d.weightKg} unit="kg" /><F label="Talla" value={d.heightCm} unit="cm" />
        <div className="anes-f anes-f--w2">{ANESTHESIA_SHEET.scheduled.map((x) => <Box key={x} on={d.scheduled === x}>{x}</Box>)}</div>
        <F label="Diagnóstico preoperatorio" value={d.preDiagnosis} wide long />
        <F label="Cirugía propuesta" value={d.proposedSurgery} wide long />
      </Sec>
      <Sec title="Valoración preanestésica">
        <div className="anes-f"><i>ASA:</i>{ANESTHESIA_SHEET.asa.map((x) => <Box key={x} on={d.asa === x}>{x}</Box>)}<Box on={d.asaE}>E</Box>
          <i className="anes-gap">Mallampati:</i>{ANESTHESIA_SHEET.mallampati.map((x) => <Box key={x} on={d.mallampati === x}>{x}</Box>)}
          <i className="anes-gap">Vía aérea difícil (VAD):</i><Box on={d.difficultAirway === 'Sí'}>Sí</Box><Box on={d.difficultAirway === 'No'}>No</Box></div>
        <F label="Alergias" value={d.allergies} long />
        <div className="anes-f"><i>Ayuno:</i> sólidos {d.fastingSolids ? <b>{d.fastingSolids}</b> : <Blank />} h · líquidos {d.fastingLiquids ? <b>{d.fastingLiquids}</b> : <Blank />} h</div>
        <F label="Antecedentes y medicación" value={d.history} area lines={3} />
        <div className="anes-labs">{PREANESTHESIA_LABS.map((l) => <F key={l.key} label={l.label} value={d.labs[l.key]} />)}</div>
      </Sec>
      <Sec title="Técnica propuesta"><div className="anes-f">{ANESTHESIA_SHEET.techniques.map((x) => <Box key={x} on={d.techniques.includes(x)}>{x}</Box>)}</div></Sec>
      <Sec title="Plan y recomendaciones">{d.plan ? <p className="anes-text">{d.plan}</p> : <span className="anes-blank--area" style={{ height: '5em' }} />}</Sec>
      {addenda.length > 0 && <Sec title="Adendas"><div className="anes-addenda">{addenda.map((a) => <p key={a.id}><b>{dmyTime(a.at)} · {staffById(a.authorId)?.name}:</b> {a.corrects ? `Se corrige: ${a.corrects}. ` : ''}{a.text}</p>)}</div></Sec>}
    </ClinicalDoc>
  )
}

/** «En el expediente» (Expediente completo): las valoraciones de la estancia; las anuladas, en una línea. */
export function PreEvalRecord({ stayId }: { stayId: string }) {
  const { staffById } = useStore()
  const [list, setList] = useState<{ ev: PreEval; prefill?: AnesthesiaPrefill }[] | null>(null)
  useEffect(() => {
    api<{ evals: PreEval[] }>(`/inpatient/${stayId}/preanesthesia`).then(async (r) => setList(await Promise.all(r.evals.map(async (ev) =>
      ev.mode === 'system' && !ev.voidedAt ? { ev, prefill: (await api<{ prefill: AnesthesiaPrefill }>(`/preanesthesia/${ev.id}`).catch(() => null))?.prefill } : { ev })))).catch(() => setList([]))
  }, [stayId])
  if (!list?.length) return null
  return <>
    <h2 className="fr-h">Valoraciones preanestésicas</h2>
    {list.map(({ ev, prefill }) => <div key={ev.id} className="fr-lab">
      <b>{ev.data?.proposedSurgery || 'Valoración preanestésica'}</b> · {ev.mode === 'system' ? `firmada por ${ev.signer?.name ?? ev.performedBy.name}` : `subida por ${staffById(ev.createdBy)?.name ?? '—'} (valoración de ${ev.performedBy.name})`} {dmyTime(ev.createdAt)}
      {ev.voidedAt ? <p className="muted">Anulada {dmyTime(ev.voidedAt)}: {ev.voidReason}</p>
        : ev.mode === 'system' && ev.data && prefill ? <PreEvalDocument prefill={prefill} data={ev.data} ev={ev} />
        : ev.fileId ? <PdfPages fileId={ev.fileId} label="La valoración preanestésica" /> : null}
    </div>)}
  </>
}

/** «Imprimir en blanco»: una hoja Carta con los datos que ya hay (de la autorización quirúrgica, si se eligió). */
export function PreEvalBlankPage() {
  const { stayId } = useParams()
  const [params] = useSearchParams()
  const [x, setX] = useState<{ prefill: PreEvalPrefill } | null>(null)
  const [error, setError] = useState('')
  const auth = params.get('autorizacion')
  useEffect(() => { api<{ prefill: PreEvalPrefill }>(`/inpatient/${stayId}/preanesthesia/blank${auth ? `?autorizacion=${auth}` : ''}`).then(setX).catch((e: Error) => setError(e.message)) }, [stayId, auth])
  useAutoPrint(!!x)
  if (error) return <DocError title="No se puede abrir la hoja." error={error} />
  if (!x) return <Loading label="Preparando la hoja" />
  return <div className="page"><PrintBar title="Valoración preanestésica en blanco" /><PreEvalDocument prefill={x.prefill} /></div>
}

/** «Ver» e «Imprimir»: la escrita en el sistema con la plantilla; la subida, sus páginas. */
export default function PreEvalPage() {
  const { id } = useParams()
  const { staffById } = useStore()
  const [x, setX] = useState<{ eval: PreEval; stayKind: string; prefill: AnesthesiaPrefill } | null>(null)
  const [addenda, setAddenda] = useState<Addendum[]>([])
  const [error, setError] = useState('')
  const [pagesReady, setPagesReady] = useState(false)
  useEffect(() => {
    api<{ eval: PreEval; stayKind: string; prefill: AnesthesiaPrefill }>(`/preanesthesia/${id}`).then(async (r) => {
      setX(r)
      if (r.eval.mode === 'system') setAddenda(await api<Addendum[]>(`/addenda?ids=${r.eval.id}`).catch(() => []))
    }).catch((e: Error) => setError(e.message))
  }, [id])
  useAutoPrint(!!x && (x.eval.mode === 'system' || pagesReady))
  if (error) return <DocError title="No se puede abrir la valoración." error={error} />
  if (!x) return <Loading label="Abriendo la valoración preanestésica" />
  const ev = x.eval
  return (
    <div className="page">
      <PrintBar title={`Valoración preanestésica${ev.voidedAt ? ' (anulada)' : ''}`}>
        <div className="page-head__actions"><Link className="btn btn--ghost" to={`${stayPath(x.stayKind, ev.hospitalizationId)}?tab=anexos`}>Ir al expediente</Link></div>
      </PrintBar>
      {ev.voidedAt && <p className="alert-strip alert-strip--amber no-print">Anulada el {dmyTime(ev.voidedAt)} por {staffById(ev.voidedBy ?? '')?.name ?? '—'}: {ev.voidReason}</p>}
      {ev.mode === 'system' && ev.data
        ? <PreEvalDocument prefill={x.prefill} data={ev.data} ev={ev} addenda={addenda} />
        : <>
          <p className="muted no-print">Subida por {staffById(ev.createdBy)?.name ?? '—'}, {dmyTime(ev.createdAt)} · Valoración de {ev.performedBy.name}{ev.observation ? ` · ${ev.observation}` : ''}</p>
          {ev.fileId && <div className="signed-doc"><PdfPages fileId={ev.fileId} label="La valoración preanestésica" onReady={() => setPagesReady(true)} /></div>}
        </>}
    </div>
  )
}
