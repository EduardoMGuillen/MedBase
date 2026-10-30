import { MessageCircle, Phone, Plus, X } from 'lucide-react'
import { formatPhone, telUrl, whatsappUrl } from '../lib/format'
import type { ClinicContact } from '../lib/types'

const TYPE_LABEL: Record<ClinicContact['type'], string> = { call: 'Llamadas', whatsapp: 'WhatsApp', both: 'Llamadas y WhatsApp' }

/**
 * AD1: teléfonos de la clínica. Cada uno con su etiqueta libre ("Recepción", "Citas por WhatsApp", "Emergencias") y su
 * tipo. Uno es el principal (sale en los documentos) y uno puede ser el WhatsApp de la clínica (el del recordatorio).
 */
export function ContactsEditor({ value, onChange }: { value: ClinicContact[]; onChange: (v: ClinicContact[]) => void }) {
  const set = (i: number, patch: Partial<ClinicContact>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const only = (i: number, key: 'primary' | 'whatsapp') => onChange(value.map((c, j) => ({ ...c, [key]: j === i ? !c[key] || key === 'primary' : false })))
  const add = () => onChange([...value, { id: `c${Date.now().toString(36)}`, number: '', label: '', type: 'whatsapp', primary: !value.length }])
  return (
    <div className="contacts">
      {value.map((c, i) => (
        <div key={c.id} className="contacts__row">
          <label className="field"><span>Número</span><input className="input num" inputMode="tel" value={c.number} onChange={(e) => set(i, { number: formatPhone(e.target.value) })} placeholder="2232-7710" /></label>
          <label className="field"><span>Etiqueta</span><input className="input" value={c.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Ej. Recepción, Citas por WhatsApp" maxLength={40} /></label>
          <label className="field"><span>Tipo</span>
            <select className="select" value={c.type} onChange={(e) => set(i, { type: e.target.value as ClinicContact['type'], whatsapp: e.target.value === 'call' ? false : c.whatsapp })}>
              {(Object.keys(TYPE_LABEL) as ClinicContact['type'][]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select></label>
          <div className="contacts__marks">
            <label className="check-inline"><input type="radio" name="contact-primary" checked={!!c.primary} onChange={() => only(i, 'primary')} />Principal</label>
            <label className="check-inline" title={c.type === 'call' ? 'Este número no acepta WhatsApp' : undefined}>
              <input type="checkbox" checked={!!c.whatsapp} disabled={c.type === 'call'} onChange={() => only(i, 'whatsapp')} />WhatsApp de la clínica</label>
          </div>
          <button type="button" className="icon-btn contacts__x" aria-label={`Quitar ${c.label || c.number || 'contacto'}`} disabled={value.length === 1}
            onClick={() => { const rest = value.filter((_, j) => j !== i); onChange(c.primary && rest.length ? rest.map((x, j) => (j === 0 ? { ...x, primary: true } : x)) : rest) }}><X size={16} /></button>
        </div>
      ))}
      <button type="button" className="btn btn--soft btn--sm" style={{ justifySelf: 'start' }} onClick={add}><Plus size={15} />Agregar contacto</button>
    </div>
  )
}

/** Contactos con botón de llamar y de abrir WhatsApp, para las pantallas que ve el paciente. */
export function ContactButtons({ contacts, clinicName }: { contacts: ClinicContact[]; clinicName: string }) {
  if (!contacts.length) return null
  return (
    <ul className="contact-buttons">
      {contacts.map((c) => (
        <li key={c.id}>
          <span><b>{c.label || (c.primary ? 'Teléfono' : 'Contacto')}</b> {c.number}</span>
          {c.type !== 'whatsapp' && <a className="btn btn--ghost btn--sm" href={telUrl(c.number)}><Phone size={14} />Llamar</a>}
          {c.type !== 'call' && <a className="btn btn--soft btn--sm" href={whatsappUrl(c.number, `Hola, les escribo a ${clinicName}.`)} target="_blank" rel="noreferrer"><MessageCircle size={14} />WhatsApp</a>}
        </li>
      ))}
    </ul>
  )
}
