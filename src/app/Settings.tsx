import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { BedDouble, Building2, CalendarClock, FlaskConical, Package, Pill, Receipt } from 'lucide-react'
import { useStore } from '../lib/store'
import { Modal, PageHead } from '../components/ui'
import { ExamCatalogAdmin, LabProfilesAdmin } from './ExamCatalogAdmin'
import type { ClinicSettings } from '../lib/types'
import { Roster } from './Roster'
import { features } from '../lib/permissions'
import { SupplyCatalog } from './SupplyCatalog'
import { Beds } from './settings/Beds'
import { ClinicDataForm } from './settings/ClinicData'
import { ClinicDrugs } from './settings/ClinicDrugs'
import { ObservationForm } from './settings/ClinicData'
import { PaymentMethods } from './settings/Services'
import { ReminderForm } from './settings/ClinicData'
import { Schedules } from './settings/Schedules'
import { ServiceAreas } from './settings/Services'
import { Services } from './settings/Services'
import { type Block } from './settings/section'
import { SectionCtx } from './settings/section'

/**
 * CF1 (ronda 17): «Configuración de la clínica» (en el consultorio, «Configuración del consultorio») por secciones, cada una
 * con su URL (`/app/configuracion/<sección>`): un índice a la izquierda en pantallas anchas y una fila desplazable en el
 * teléfono, como en «Configuración» de cada persona. `/app/configuracion` abre la primera. «Guardar cambios» guarda lo que
 * se cambió en la sección que se ve; al cambiar de sección con algo sin guardar, se pregunta.
 */
export type SettingsSection = 'datos' | 'agenda' | 'cobros' | 'observacion' | 'examenes' | 'vademecum' | 'material'

type Features = ReturnType<typeof features>
interface SectionDef { key: SettingsSection; label: (f: Features) => string; icon: typeof Pill; sub: (f: Features) => string; save?: boolean }

const SECTIONS: SectionDef[] = [
  { key: 'datos', label: (f) => (f.office ? 'Datos del consultorio' : 'Datos de la clínica'), icon: Building2, save: true,
    sub: (f) => `Nombre, dirección, contactos, correo, moneda, documento de identidad y logo: lo que sale en recetas, constancias y recibos${f.office ? ', con tu especialidad y colegiación' : ''}.` },
  { key: 'agenda', label: () => 'Agenda y recordatorios', icon: CalendarClock, save: true,
    sub: (f) => (f.office ? 'Tu horario de atención y el mensaje de recordatorio por WhatsApp.' : 'El horario de cada médico, el rol de turnos y el mensaje de recordatorio por WhatsApp.') },
  { key: 'cobros', label: () => 'Cobros', icon: Receipt, save: true, sub: () => 'Los servicios que se cobran en caja, con su precio, y las formas de pago que se aceptan.' },
  { key: 'observacion', label: (f) => (f.hospital ? 'Hospitalización y observación' : 'Observación'), icon: BedDouble, save: true,
    sub: (f) => (f.hospital ? 'Cuándo resaltar a quien lleva mucho en observación, cómo revisa enfermería las órdenes, la curva térmica y las camas.' : 'Si usas observación, cuándo resaltar a quien lleva mucho tiempo y la curva térmica.') },
  { key: 'examenes', label: () => 'Exámenes', icon: FlaskConical, save: true, sub: (f) => `Quién realiza los exámenes en ${f.office ? 'el consultorio' : 'la clínica'}, el catálogo de exámenes y los perfiles de laboratorio.` },
  { key: 'vademecum', label: () => 'Vademécum', icon: Pill, sub: () => 'Los medicamentos que se ofrecen al recetar y en la hoja de medicamentos.' },
  { key: 'material', label: () => 'Material médico quirúrgico', icon: Package, sub: () => 'El catálogo de material, los sets y el periodo de registro.' },
]

export default function Settings() {
  const { seccion } = useParams()
  const { settings } = useStore()
  const f = features(settings)
  const section = SECTIONS.find((s) => s.key === seccion)
  // La URL vieja (/app/configuracion) y una sección que no existe abren la primera
  if (!section) return <Navigate to="/app/configuracion/datos" replace />
  return (
    <div className="page">
      <PageHead title={f.office ? 'Configuración del consultorio' : 'Configuración de la clínica'}
        sub={f.office ? 'Lo que aparece en tus recetas y recibos, tus precios, tu horario y lo que usa tu consultorio.' : 'Lo que aparece en recetas y recibos, precios, horarios, camas, exámenes y material de la clínica.'} />
      <SectionForms key={section.key} section={section} f={f} />
    </div>
  )
}

function SectionForms({ section, f }: { section: SectionDef; f: Features }) {
  const { settings, saveSettings } = useStore()
  const navigate = useNavigate()
  const blocks = useRef(new Map<string, Block>())
  const [dirtyIds, setDirtyIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<SettingsSection | null>(null)
  const register = useCallback((id: string, b: Block | null) => {
    if (b) blocks.current.set(id, b); else blocks.current.delete(id)
    const ids = [...blocks.current].filter(([, x]) => x.dirty).map(([k]) => k).sort()
    setDirtyIds((prev) => (prev.join('|') === ids.join('|') ? prev : ids))
  }, [])
  const dirty = dirtyIds.length > 0
  // Al cerrar o recargar la pestaña con cambios sin guardar, el navegador pregunta
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const saveAll = async () => {
    const list = [...blocks.current.values()].filter((b) => b.dirty)
    const patch = Object.assign({}, ...list.map((b) => b.patch ?? {})) as Partial<ClinicSettings>
    setBusy(true)
    let ok = true
    if (Object.keys(patch).length) {
      const merged = { ...settings, ...patch }
      ok = !!(await saveSettings({ ...merged, logo: merged.logo ?? '' }))
      if (ok) for (const b of list) if (b.patch) b.reset()
    }
    for (const b of list) if (ok && b.save) ok = await b.save()
    setBusy(false)
    return ok
  }
  const discard = () => { for (const b of blocks.current.values()) if (b.dirty) b.reset() }
  const go = (k: SettingsSection) => navigate(`/app/configuracion/${k}`)
  // En el teléfono el índice es una fila que se desplaza a lo ancho: la sección abierta queda a la vista
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = nav.current
    const on = el?.querySelector<HTMLElement>('.is-on')
    if (el && on && el.scrollWidth > el.clientWidth) el.scrollLeft = on.offsetLeft - el.offsetLeft - 16
  }, [])
  return (
    <SectionCtx.Provider value={register}>
      <div className="myconf cfg">
        <nav ref={nav} className="myconf__nav" aria-label="Secciones de la configuración">
          {SECTIONS.map((s) => (
            <Link key={s.key} to={`/app/configuracion/${s.key}`} className={`myconf__tab${s.key === section.key ? ' is-on' : ''}`} data-tour={`cfg:${s.key}`}
              aria-current={s.key === section.key ? 'page' : undefined}
              onClick={(e) => { if (s.key === section.key) e.preventDefault(); else if (dirty) { e.preventDefault(); setAsking(s.key) } }}>
              <s.icon size={16} />{s.label(f)}
            </Link>
          ))}
        </nav>
        <div className="myconf__body">
          <div className="cfg__head"><h2>{section.label(f)}</h2><p>{section.sub(f)}</p></div>
          {section.key === 'datos' && <ClinicDataForm />}
          {section.key === 'agenda' && <><Schedules />{!f.office && <Roster />}<ReminderForm /></>}
          {section.key === 'cobros' && <><Services /><PaymentMethods /></>}
          {section.key === 'observacion' && <><ObservationForm />{f.hospital && <Beds />}</>}
          {section.key === 'examenes' && <><ServiceAreas /><ExamCatalogAdmin /><LabProfilesAdmin /></>}
          {section.key === 'vademecum' && <ClinicDrugs />}
          {section.key === 'material' && <SupplyCatalog />}
          {section.save && (
            <div className="cfg-savebar" role="region" aria-label="Guardar la sección">
              <span className={`cfg-savebar__msg${dirty ? ' is-dirty' : ''}`}>{dirty ? 'Hay cambios sin guardar en esta sección.' : 'Todo guardado.'}</span>
              {dirty && <button className="btn btn--ghost" disabled={busy} onClick={discard}>Descartar</button>}
              <button className="btn btn--primary" disabled={!dirty || busy} onClick={() => void saveAll()}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          )}
        </div>
      </div>
      {asking && (
        <Modal title="Hay cambios sin guardar" onClose={() => setAsking(null)} footer={<>
          <button className="btn btn--ghost" onClick={() => setAsking(null)}>Seguir aquí</button>
          <button className="btn btn--soft" onClick={() => { discard(); go(asking); setAsking(null) }}>Descartar y cambiar</button>
          <button className="btn btn--primary" disabled={busy} onClick={async () => { if (await saveAll()) { go(asking); setAsking(null) } }}>Guardar y cambiar</button>
        </>}>
          <p>Cambiaste algo en «{section.label(f)}» y no lo guardaste. ¿Lo guardas antes de ir a «{SECTIONS.find((s) => s.key === asking)!.label(f)}»?</p>
        </Modal>
      )}
    </SectionCtx.Provider>
  )
}
