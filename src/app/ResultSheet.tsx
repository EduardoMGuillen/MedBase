import { useStore } from '../lib/store'
import { DocHeader } from '../components/DocHeader'
import { age, dmyTime, fullName, identityLine, recordNumber } from '../lib/format'
import { examLine, GROUP_LABEL } from '../lib/exams'
import { rangeText } from '../lib/labReference'
import { yearsOld } from '../lib/inpatient'
import { signerOf } from '../lib/positions'
import { FileName } from '../components/FilePreview'
import type { ExamOrder, Patient, Staff } from '../lib/types'

/**
 * EX6 (ronda 11): «Resultado de laboratorio» / «Resultado de imagen y gabinete» (varios exámenes, cada uno en su bloque), con la
 * plantilla de documento clínico de EX2: membrete, título, número, fecha y hora de impresión, paciente, y por examen el texto
 * armado (CA6), quién lo pidió, cuándo se pidió, se tomó la muestra o se realizó y se cargó el resultado; la tabla de valores
 * con unidad, rango, Alto/Bajo y «Crítico» en negrita (se lee en blanco y negro) o el texto del informe; y los responsables con
 * espacio para firma y sello. Sin diagnósticos ni indicación clínica (privacidad). Pie «Página X de Y».
 */
export function ResultSheet({ exams, patient: p, number, at }: { exams: ExamOrder[]; patient: Patient; number: string; at: string }) {
  const { settings, staffById } = useStore()
  const minor = p.birthDate ? yearsOld(p.birthDate) < 18 : false
  const groups = [...new Set(exams.map((e) => e.group))]
  const title = groups.length === 1 ? (groups[0] === 'lab' ? 'Resultado de laboratorio' : 'Resultado de imagen y gabinete') : 'Resultados de exámenes'
  // En un consultorio el membrete es la médica; en una clínica, la clínica
  const office = settings.kind === 'office'
  const head = office ? staffById(exams[0].orderedBy) : undefined
  return (
    <article className="rx-sheet exam-order result-doc">
      <header className="rx-sheet__head">
        <DocHeader clinic={{ ...settings, office }} doctor={{ name: head ? head.docName ?? head.name : '', specialty: head?.specialty, license: head?.license }} />
        <div className="rx-sheet__folio">{title}<b>{number}</b>Impreso {dmyTime(at)}</div>
      </header>
      <div className="rx-sheet__pt">
        <div style={{ gridColumn: '1 / -1' }}><span>Paciente</span>{fullName(p)}</div>
        <div><span>Edad</span>{age(p.birthDate)}</div>
        <div><span>Sexo</span>{p.sex === 'F' ? 'Femenino' : 'Masculino'}</div>
        <div><span>Expediente</span>{recordNumber(p, settings)}</div>
        <div><span>Identidad</span>{identityLine(p, minor)}</div>
      </div>
      {exams.map((e) => <ResultBlock key={e.id} e={e} staffById={staffById} showGroup={groups.length > 1} />)}
      <footer className="rx-sheet__foot"><span>{title} {number}. Sin la firma y el sello de los responsables en papel no vale.</span><span>Emitido con Clinara</span></footer>
    </article>
  )
}

function ResultBlock({ e, staffById, showGroup }: { e: ExamOrder; staffById: (id: string) => Staff | undefined; showGroup: boolean }) {
  const r = e.result!
  const ev = (s: string) => (e.events ?? []).find((x) => x.status === s)
  const taken = e.group === 'lab' ? ev('sample') : ev('done')
  const orderedBy = staffById(e.orderedBy)
  // Responsables (A24): laboratorio, quien procesó y el microbiólogo responsable; imagen, quien realizó y quien informó
  const by = r.by ? staffById(r.by) : undefined
  const people: { label: string; s?: Staff }[] = []
  if (e.group === 'lab') {
    people.push({ label: 'Procesado por', s: by })
    const resp = r.responsibleId ? staffById(r.responsibleId) : undefined
    if (resp && resp.id !== by?.id) people.push({ label: 'Microbiólogo responsable', s: resp })
  } else {
    const done = taken ? staffById(taken.by) : undefined
    if (done) people.push({ label: 'Realizado por', s: done })
    if (r.report && by && by.id !== done?.id) people.push({ label: 'Informe', s: by })
    if (!done && !(r.report && by)) people.push({ label: 'Cargado por', s: by })
  }
  return (
    <section className="result-doc__block">
      <h2 className="exam-order__title">{showGroup ? `${GROUP_LABEL[e.group]}: ` : ''}{examLine(e)}</h2>
      <p className="result-doc__times">
        Pedido por {orderedBy?.docName ?? orderedBy?.name ?? '—'} el {dmyTime(e.orderedAt)}
        {taken ? ` · ${e.group === 'lab' ? 'Muestra tomada' : 'Realizado'} ${dmyTime(taken.at)}` : ''}
        {r.at ? ` · Resultado ${dmyTime(r.at)}` : ''}
      </p>
      {r.values?.length ? (
        <table className="result-doc__table">
          <thead><tr><th>Análisis</th><th>Resultado</th><th>Unidad</th><th>Rango de referencia</th><th>Marca</th></tr></thead>
          <tbody>{r.values.map((v) => (
            <tr key={v.analyte}><td>{v.analyte}</td><td className={v.flag ? 'is-flag' : ''}>{v.value}</td><td>{v.unit ?? ''}</td>
              <td>{[rangeText(v), v.reference].filter(Boolean).join(' · ')}</td>
              <td>{v.flag ? (v.flag === 'high' ? 'Alto' : 'Bajo') : ''}</td></tr>
          ))}</tbody>
        </table>
      ) : null}
      {r.report && <div className="result-doc__report"><b>Informe</b><p>{r.report}</p></div>}
      {r.fileIds?.map((f) => <p key={f} className="result-doc__file">Archivo adjunto: <FileName id={f} /> (se imprime aparte con «Ver archivo»)</p>)}
      <div className="result-doc__signs">
        {people.map(({ label, s }) => { const g = signerOf(s); return (
          <div key={label} className="result-doc__sign"><span className="result-doc__line" /><b>{label}: {g.name}</b><small>{g.title}</small><small>Firma y sello</small></div>
        ) })}
      </div>
    </section>
  )
}
