import { useEffect, useState } from 'react'
import { BedDouble, Clock, FileSignature, PenLine, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { Modal } from '../components/ui'
import { DniInput } from '../components/DniInput'
import { authTitle } from '../lib/consent'
import { defaultSpecialty, yearsOld } from '../lib/inpatient'
import { formatPhone } from '../lib/format'
import { BedFields } from '../components/BedFields'
import type { Authorization, Hospitalization, Patient } from '../lib/types'
import { ConsentSigning } from './ConsentSigning'

/**
 * MC1 y MC2: la autorización recién generada (de hospitalización al ingresar, o quirúrgica) con sus tres salidas a la
 * mano: firmar ahora en pantalla (el camino principal), imprimirla para firmar en papel (la foto o el PDF se sube
 * después desde Anexos) o firmarla después (queda pendiente en Anexos, con su alerta). Las tres terminan en `onDone`.
 * Si al paciente adulto le falta la identidad, se escribe aquí y la autorización se actualiza.
 */
export function ConsentChoice({ authorizationId, p, onDone }: { authorizationId: string; p: Patient; onDone: (how: 'signed' | 'print' | 'later') => void }) {
  const { fetchAuthorization, updatePatient, notify } = useStore()
  const [a, setA] = useState<Authorization | null>(null)
  const [signing, setSigning] = useState(false)
  const [dni, setDni] = useState(p.dni ?? '')
  useEffect(() => { fetchAuthorization(authorizationId).then(setA).catch((e: Error) => notify(e.message, 'error')) }, [authorizationId, fetchAuthorization, notify])
  if (!a) return null
  const surgical = a.template === 'surgical'
  const needsDni = !a.data.patient.dni && !a.data.patient.minor && !!p.birthDate && yearsOld(p.birthDate) >= 18
  const print = () => {
    // La hoja se abre en otra pestaña para imprimirla; aquí se sigue al expediente
    window.open(`/app/autorizaciones/${a.id}?imprimir=1`, '_blank', 'noopener')
    onDone('print')
  }
  if (signing) return <ConsentSigning a={a} p={p} action="accept" onClose={() => setSigning(false)} onDone={() => onDone('signed')} />
  return (
    <Modal title={authTitle(a)} onClose={() => onDone('later')} footer={<span className="muted" style={{ fontSize: 13.5, marginRight: 'auto' }}>Ya está llena con los datos del paciente y del ingreso.</span>}>
      <div className="consent-choice__doc">
        <FileSignature size={20} />
        <div>
          <b>{a.data.patient.name}</b>
          <span>{surgical ? `Procedimiento: ${a.data.procedure}` : `Ingreso: ${a.data.admission?.diagnosis ?? a.data.diagnosis ?? ''}`}</span>
          {surgical && a.data.diagnosis && <span>Diagnóstico: {a.data.diagnosis}</span>}
          {!surgical && a.data.companion && <span>Acompañante: {a.data.companion.name}{a.data.companion.relation ? ` (${a.data.companion.relation})` : ''}</span>}
        </div>
      </div>
      {needsDni && (
        <div className="consent-choice__dni">
          <label className="field"><span>Identidad del paciente (falta en su ficha)</span><DniInput value={dni} onChange={setDni} /></label>
          <button className="btn btn--soft btn--sm" disabled={dni.replace(/\D/g, '').length < 6} onClick={async () => {
            if (await updatePatient(p.id, { dni })) setA(await fetchAuthorization(a.id))
          }}>Guardar identidad</button>
        </div>
      )}
      <div className="choice-grid choice-grid--3">
        <button className="choice choice--primary" onClick={() => setSigning(true)} autoFocus><PenLine size={22} /><b>{surgical ? 'Firmar ahora en pantalla' : 'Firmar ahora'}</b>
          <small>{a.data.patient.minor ? 'Firma su representante' : 'El paciente'} lee, marca que entendió y firma con el dedo; tú confirmas con tu firma guardada.</small></button>
        <button className="choice" onClick={print}><Printer size={22} /><b>Imprimir para firmar en papel</b><small>Después subes la foto o el PDF desde Anexos.</small></button>
        <button className="choice" onClick={() => onDone('later')}><Clock size={22} /><b>Firmar después</b><small>Queda pendiente de firma en Anexos, con su alerta.</small></button>
      </div>
    </Modal>
  )
}

/**
 * MC1, paso 1: el médico firmó la consulta con «Ingreso a hospitalización». Elige una cama libre (AD3), confirma la
 * especialidad y anota quién acompaña (va en la autorización). Al confirmar se abre de inmediato la autorización.
 */
export function AdmitBedStep({ h, p, onClose, onDone }: { h: Hospitalization; p: Patient; onClose: () => void; onDone: () => void }) {
  const { updateAdmission, staffById } = useStore()
  const [f, setF] = useState({
    bedId: h.bedId ?? '', specialty: h.specialty ?? defaultSpecialty(staffById(h.admittedBy)),
    companionName: h.companionName ?? p.emergencyName ?? '', companionRelation: h.companionRelation ?? p.emergencyRelation ?? '', companionPhone: h.companionPhone ?? p.emergencyPhone ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'companionPhone' ? formatPhone(e.target.value) : e.target.value })
  return (
    <Modal title="Ingreso a hospitalización" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Después</button>
      <button className="btn btn--primary" disabled={!f.bedId || busy} onClick={async () => {
        setBusy(true)
        const changes = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => v !== String(h[k as keyof Hospitalization] ?? '')))
        const ok = !Object.keys(changes).length || await updateAdmission(h.id, changes)
        setBusy(false)
        if (ok) onDone()
      }}><BedDouble size={16} />Confirmar y pasar a la autorización</button>
    </>}>
      <p className="muted" style={{ fontSize: 14 }}>{p.firstName} ya quedó ingresado con la nota de consulta como nota de ingreso. Elige la cama; luego firma la autorización de hospitalización.</p>
      <BedFields bedId={f.bedId} specialty={f.specialty} onChange={(v) => setF({ ...f, ...v })} />
      <fieldset className="fs"><legend>Quién lo acompaña (va en la autorización)</legend>
        <div className="form-grid">
          <label className="field"><span>Nombre</span><input className="input" value={f.companionName} onChange={set('companionName')} /></label>
          <label className="field"><span>Parentesco</span><input className="input" value={f.companionRelation} onChange={set('companionRelation')} /></label>
          <label className="field"><span>Teléfono</span><input className="input" inputMode="tel" value={f.companionPhone} onChange={set('companionPhone')} placeholder="0000-0000" /></label>
        </div>
      </fieldset>
    </Modal>
  )
}
