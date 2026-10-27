import { useEffect, useState } from 'react'
import { ChevronLeft, FileSignature, ShieldCheck, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { consentDocument, READ_CONFIRMATION } from '../lib/consent'
import { normalizeDni } from '../lib/format'
import type { Authorization, ConsentPerson, Patient } from '../lib/types'
import { SignaturePad } from '../components/SignaturePad'
import { DniInput } from '../components/DniInput'

type Action = 'accept' | 'refuse' | 'revoke'
type Step = 'who' | 'read' | 'sign' | 'doctor'

const TITLE: Record<Action, string> = { accept: 'Firmar en pantalla', refuse: 'No autoriza: firmar en pantalla', revoke: 'Revocar: firmar en pantalla' }

/**
 * Firma en pantalla de una autorización (A1, A2), en la tablet, el celular o la computadora de la clínica. Cuatro
 * pasos, en letra grande:
 * 1. Quién firma: el paciente o su representante legal (nombre, identidad y parentesco obligatorios). Si el paciente
 *    no puede firmar, firma un testigo y queda el motivo; en los demás casos el testigo es opcional.
 * 2. Lectura del documento completo, con los datos ya llenos, y la casilla «He leído…».
 * 3. Firmas en el recuadro (paciente o representante, y testigo si hay).
 * 4. Médico (sólo la autorización): confirma con su contraseña y estampa su firma guardada. Si quien gestiona es
 *    enfermería, la firma del paciente queda guardada y la autorización espera la firma del médico.
 * Con `doctorOnly`, el paciente ya firmó: sólo falta el paso del médico.
 */
export function ConsentSigning({ a, p, action, doctorOnly = false, onClose, onDone }: {
  a: Authorization; p: Patient; action: Action; doctorOnly?: boolean; onClose: () => void; onDone: (a: Authorization) => void
}) {
  const { user, notify } = useStore()
  const isDoctor = user?.role === 'doctor'
  const needsDoctor = action === 'accept'
  const minor = a.data.patient.minor
  const [step, setStep] = useState<Step>(doctorOnly ? 'doctor' : 'who')
  const [signer, setSigner] = useState<'patient' | 'representative'>(minor ? 'representative' : 'patient')
  const [rep, setRep] = useState<ConsentPerson>({ name: p.guardianName ?? a.data.representative?.name ?? '', dni: p.guardianDni ?? a.data.representative?.dni ?? '', relation: p.guardianRelation ?? a.data.representative?.relation ?? '' })
  const [unable, setUnable] = useState(false)
  const [unableReason, setUnableReason] = useState('')
  const [withWitness, setWithWitness] = useState(false)
  const [witness, setWitness] = useState<ConsentPerson>({ name: '', dni: '' })
  const [read, setRead] = useState(false)
  const [sig, setSig] = useState<string | null>(null)
  const [witnessSig, setWitnessSig] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [saved, setSaved] = useState<string | null | undefined>(undefined)
  const [drawn, setDrawn] = useState<string | null>(null)
  const [redraw, setRedraw] = useState(false)
  const [save, setSave] = useState(true)
  const [busy, setBusy] = useState(false)

  // Firma guardada del médico: se estampa sola; si no tiene, la dibuja una vez y se guarda
  useEffect(() => {
    if (!isDoctor || !needsDoctor) return
    api<{ signature: string | null }>('/me/signature').then((r) => setSaved(r.signature)).catch(() => setSaved(null))
  }, [isDoctor, needsDoctor])

  // Evita que la página de atrás se desplace mientras está abierto
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const witnessOn = unable || withWitness
  const repOk = signer === 'patient' || (rep.name.trim().length >= 3 && (rep.dni ?? '').replace(/\D/g, '').length >= 6 && (rep.relation ?? '').trim().length >= 2)
  const witnessOk = !witnessOn || (witness.name.trim().length >= 3 && (!unable || (witness.dni ?? '').replace(/\D/g, '').length >= 6))
  const whoOk = repOk && witnessOk && (!unable || unableReason.trim().length >= 3)
  const signOk = (unable || !!sig) && (!witnessOn || !!witnessSig)
  const doctorSig = redraw || !saved ? drawn : saved
  const doctorOk = password.length > 0 && !!doctorSig
  const doc = consentDocument(a, action, signer === 'representative' ? { ...rep, dni: normalizeDni(rep.dni) } : undefined)
  const signerName = signer === 'representative' ? rep.name : a.data.patient.name

  const submit = async (withDoctor: boolean) => {
    setBusy(true)
    try {
      const body: Record<string, unknown> = { action }
      if (!doctorOnly) {
        body.patient = {
          signer, representative: signer === 'representative' ? { name: rep.name.trim(), dni: rep.dni, relation: rep.relation?.trim() } : undefined,
          unableReason: unable ? unableReason.trim() : undefined, signature: unable ? undefined : sig,
          witness: witnessOn ? { name: witness.name.trim(), dni: witness.dni || undefined, signature: witnessSig } : undefined, readConfirmed: true,
        }
      }
      if (withDoctor) body.doctor = { password, signature: redraw || !saved ? drawn : undefined, save: (redraw || !saved) && save }
      const r = await api<Authorization>(`/authorizations/${a.id}/sign`, { body })
      notify(r.status === 'pending' ? 'Firma del paciente guardada. Falta la firma del médico.' : r.status === 'signed' ? 'Autorización firmada en pantalla' : r.status === 'refused' ? 'Rechazo firmado en pantalla' : 'Revocación firmada en pantalla')
      onDone(r)
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const steps: Step[] = doctorOnly ? ['doctor'] : needsDoctor ? ['who', 'read', 'sign', 'doctor'] : ['who', 'read', 'sign']
  const at = steps.indexOf(step)
  const next = () => setStep(steps[at + 1])
  const back = () => (at > 0 ? setStep(steps[at - 1]) : onClose())
  const LABEL: Record<Step, string> = { who: 'Quién firma', read: 'Lectura', sign: 'Firmas', doctor: 'Médico' }

  return (
    <div className="signflow" role="dialog" aria-modal="true" aria-label={TITLE[action]}>
      <header className="signflow__head">
        <button className="icon-btn" aria-label={at > 0 ? 'Paso anterior' : 'Cerrar'} onClick={back}>{at > 0 ? <ChevronLeft size={20} /> : <X size={20} />}</button>
        <div>
          <strong>{TITLE[action]}</strong>
          <ol className="signflow__steps" aria-label="Pasos">
            {steps.map((s, i) => <li key={s} className={i === at ? 'is-on' : i < at ? 'is-done' : ''} aria-current={i === at ? 'step' : undefined}>{i + 1}. {LABEL[s]}</li>)}
          </ol>
        </div>
        {at > 0 && <button className="icon-btn" aria-label="Cerrar sin firmar" onClick={onClose}><X size={20} /></button>}
      </header>

      <div className="signflow__body">
        {step === 'who' && (
          <section className="signflow__sec">
            <h2>¿Quién firma?</h2>
            <div className="segmented signflow__choice" role="radiogroup" aria-label="Quién firma">
              <button type="button" role="radio" aria-checked={signer === 'patient'} disabled={minor} onClick={() => setSigner('patient')}>El paciente</button>
              <button type="button" role="radio" aria-checked={signer === 'representative'} onClick={() => setSigner('representative')}>Un representante legal</button>
            </div>
            {minor && <p className="muted">El paciente es menor de edad: firma su padre, madre o representante legal.</p>}
            {signer === 'representative' && (
              <div className="form-grid">
                <label className="field"><span>Nombre completo del representante</span><input className="input" value={rep.name} onChange={(e) => setRep({ ...rep, name: e.target.value })} autoComplete="off" /></label>
                <label className="field"><span>Identidad del representante</span><DniInput value={rep.dni ?? ''} onChange={(dni) => setRep({ ...rep, dni })} optional={false} /></label>
                <label className="field"><span>Parentesco</span><input className="input" value={rep.relation ?? ''} onChange={(e) => setRep({ ...rep, relation: e.target.value })} placeholder="Ej. Esposa, hijo, madre" /></label>
              </div>
            )}
            <label className="check-line"><input type="checkbox" checked={unable} onChange={(e) => setUnable(e.target.checked)} />
              <span><b>{signer === 'representative' ? 'El representante' : 'El paciente'} no puede firmar</b><small>No sabe escribir o está impedido. Firma un testigo y queda el motivo.</small></span></label>
            {unable && <label className="field"><span>Motivo</span><input className="input" value={unableReason} onChange={(e) => setUnableReason(e.target.value)} placeholder="Ej. No sabe escribir; fractura de la mano derecha" /></label>}
            {!unable && (
              <label className="check-line"><input type="checkbox" checked={withWitness} onChange={(e) => setWithWitness(e.target.checked)} />
                <span><b>Agregar un testigo</b><small>Opcional.</small></span></label>
            )}
            {witnessOn && (
              <div className="form-grid">
                <label className="field"><span>Nombre del testigo</span><input className="input" value={witness.name} onChange={(e) => setWitness({ ...witness, name: e.target.value })} autoComplete="off" /></label>
                <label className="field"><span>Identidad del testigo{unable ? '' : ' (opcional)'}</span><DniInput value={witness.dni ?? ''} onChange={(dni) => setWitness({ ...witness, dni })} optional={!unable} /></label>
              </div>
            )}
          </section>
        )}

        {step === 'read' && (
          <section className="signflow__sec signflow__doc">
            <p className="signflow__clinic">{a.data.clinic.name}</p>
            <h2>{doc.title}</h2>
            <dl className="signflow__facts">{doc.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            <p>{doc.intro}</p>
            <ol>{doc.items.map((x) => <li key={x}>{x}</li>)}</ol>
            {doc.closing && <p>{doc.closing}</p>}
            <label className="check-line signflow__confirm"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
              <span><b>{READ_CONFIRMATION}</b><small>{signerName} marca esta casilla antes de firmar.</small></span></label>
          </section>
        )}

        {step === 'sign' && (
          <section className="signflow__sec">
            <h2>Firmas</h2>
            {unable
              ? <p className="alert-strip alert-strip--calm">{signerName} no firma: {unableReason}. Firma el testigo.</p>
              : <SignaturePad label={`Firma de ${signerName}${signer === 'representative' ? ' (representante legal)' : ''}`} onChange={setSig} />}
            {witnessOn && <SignaturePad label={`Firma del testigo: ${witness.name}`} onChange={setWitnessSig} />}
          </section>
        )}

        {step === 'doctor' && (
          <section className="signflow__sec">
            <h2>Firma del médico</h2>
            {doctorOnly && a.signing && (
              <p className="alert-strip alert-strip--calm"><ShieldCheck size={16} />{a.signing.signer === 'representative' ? `Firmó el representante ${a.signing.representative?.name}` : 'Firmó el paciente'}
                {a.signing.witness ? ` con el testigo ${a.signing.witness.name}` : ''}. Falta tu firma para terminar.</p>
            )}
            {!isDoctor ? (
              <p>Se guardará la firma {signer === 'representative' ? 'del representante' : 'del paciente'}. La autorización queda pendiente hasta que un médico entre con su usuario y la firme desde Anexos.</p>
            ) : (<>
              <p className="muted">Confirma con tu contraseña. Se estampan tu nombre, tu número de colegiado y tu firma.</p>
              {saved === undefined ? <p className="muted">Buscando tu firma guardada…</p> : saved && !redraw ? (
                <div className="sig-saved">
                  <img src={saved} alt="Tu firma guardada" />
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRedraw(true)}>Dibujar otra</button>
                </div>
              ) : (<>
                <SignaturePad label={saved ? 'Tu firma nueva' : 'Tu firma (se dibuja una vez y se guarda en tu perfil)'} onChange={setDrawn} height={160} />
                <label className="check-line"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /><span><b>Guardar como mi firma</b><small>Para las próximas autorizaciones.</small></span></label>
              </>)}
              <label className="field"><span>Tu contraseña</span><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && doctorOk && !busy) void submit(true) }} /></label>
            </>)}
          </section>
        )}
      </div>

      <footer className="signflow__foot">
        {step === 'who' && <button className="btn btn--primary btn--lg" disabled={!whoOk} onClick={next}>Continuar a la lectura</button>}
        {step === 'read' && <button className="btn btn--primary btn--lg" disabled={!read} onClick={next}>Continuar a las firmas</button>}
        {step === 'sign' && (needsDoctor
          ? <button className="btn btn--primary btn--lg" disabled={!signOk} onClick={next}>Continuar</button>
          : <button className="btn btn--primary btn--lg" disabled={!signOk || busy} onClick={() => submit(false)}><FileSignature size={18} />{action === 'refuse' ? 'Registrar que no autoriza' : 'Registrar la revocación'}</button>)}
        {step === 'doctor' && (isDoctor
          ? <button className="btn btn--primary btn--lg" disabled={!doctorOk || busy} onClick={() => submit(true)}><FileSignature size={18} />{busy ? 'Firmando…' : 'Firmar y bloquear'}</button>
          : <button className="btn btn--primary btn--lg" disabled={busy || doctorOnly} onClick={() => submit(false)}>Guardar firma del paciente</button>)}
      </footer>
    </div>
  )
}
