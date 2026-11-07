import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { BedDouble, Building2, CalendarClock, Download, FlaskConical, Package, Pill, Plus, Receipt, Upload } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Modal, PageHead, SectionHead } from '../components/ui'
import { DrugForm } from '../components/DrugForm'
import { DRUG_ORIGIN, drugProvider } from '../lib/drugProvider'
import { routeWords } from '../lib/lnme/route'
import { Pagination, paginate, usePage } from '../components/Pagination'
import { normalize } from '../lib/patients'
import { download, parseCsv, toCsv } from '../lib/csv'
import { ExamCatalogAdmin, LabProfilesAdmin } from './ExamCatalogAdmin'
import { clinicWhatsapp, contactLine, date, fillTemplate, fullName, METHOD_LABEL, money } from '../lib/format'
import { ContactsEditor } from '../components/Contacts'
import type { Bed, ClinicDrug, ClinicSettings, PaymentMethod, Service, Staff } from '../lib/types'
import { ScheduleEditor } from './ScheduleEditor'
import { Roster } from './Roster'
import { features, hasRole } from '../lib/permissions'
import { SupplyCatalog } from './SupplyCatalog'

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

/** Un bloque de la sección con algo por guardar: campos de la configuración (`patch`) o su propio guardado (`save`). */
interface Block { dirty: boolean; patch?: Partial<ClinicSettings>; save?: () => Promise<boolean>; reset: () => void }
const SectionCtx = createContext<((id: string, b: Block | null) => void) | null>(null)

/** Registra un bloque en la sección (en cada render, para que la sección tenga siempre sus valores al guardar). */
function useSectionBlock(id: string, b: Block) {
  const register = useContext(SectionCtx)
  useEffect(() => { register?.(id, b) })
  useEffect(() => () => register?.(id, null), [id, register])
}

/**
 * Campos de la configuración de la clínica que se editan en un bloque. Lo cambiado queda como borrador encima de lo
 * guardado; «Guardar cambios» manda los borradores de la sección juntos (un solo PUT con la configuración completa) y
 * luego los limpia.
 */
function useSettingsDraft(id: string) {
  const { settings } = useStore()
  const [draft, setDraft] = useState<Partial<ClinicSettings>>({})
  const v: ClinicSettings = { ...settings, ...draft }
  const patch = Object.fromEntries(Object.entries(draft).filter(([k, x]) => JSON.stringify(x) !== JSON.stringify(settings[k as keyof ClinicSettings]))) as Partial<ClinicSettings>
  const dirty = Object.keys(patch).length > 0
  useSectionBlock(id, { dirty, patch, reset: () => setDraft({}) })
  const set = <K extends keyof ClinicSettings>(k: K, x: ClinicSettings[K]) => setDraft((d) => ({ ...d, [k]: x }))
  const setMany = (p: Partial<ClinicSettings>) => setDraft((d) => ({ ...d, ...p }))
  return { v, set, setMany }
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

/** Un panel con su título, para las secciones que juntan varios. */
function Panel({ title, sub, children, tour }: { title: string; sub?: ReactNode; children: ReactNode; tour?: string }) {
  return (
    <section className="panel" data-tour={tour}>
      <div className="panel__head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div></div>
      {children}
    </section>
  )
}

const IMPORT_COLUMNS = ['nombre_generico', 'nombre_comercial', 'presentacion', 'concentracion', 'via', 'dosis_habitual', 'indicaciones'] as const
const IMPORT_FIELDS: Record<(typeof IMPORT_COLUMNS)[number], string> = {
  nombre_generico: 'name', nombre_comercial: 'brand', presentacion: 'presentation', concentracion: 'concentration', via: 'route', dosis_habitual: 'usualDose', indicaciones: 'usualUse',
}

/**
 * AD4: el vademécum completo de la clínica (el catálogo base y lo que agregó la clínica), con buscador. Lo agregado se
 * edita (quien lo agregó o administración) y se desactiva; el catálogo base no se edita. Se puede importar una lista.
 */
function ClinicDrugs() {
  const { clinicDrugs = [], user, can, importClinicDrugs } = useStore()
  const [editing, setEditing] = useState<ClinicDrug | null>(null)
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [via, setVia] = useState('')
  const [sort, setSort] = useState<{ key: 'name' | 'route'; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [result, setResult] = useState<{ added: number; skipped: { row: number; name: string; reason: string }[] } | null>(null)
  const canEdit = (d: ClinicDrug) => can('drugs.manage') || d.createdBy === user?.id
  // ME7 (ronda 10): una sola lista con todo el vademécum (el catálogo base que no es una fila del listado y lo de la clínica:
  // las 530 del .md y lo agregado a mano). Los archivados no salen. Todos dicen «Catálogo base Clinara» (A11).
  const rows = useMemo(() => {
    const listed = new Set(clinicDrugs.flatMap((d) => (d.lnme ? [d.lnme.no] : [])))
    const base = drugProvider.catalog([]).filter((d) => !(d.lnme && listed.has(d.lnme.no))).map((d) => ({
      key: `base|${d.name}|${d.presentation}`, name: d.name, brand: d.brand, presentation: d.presentation, route: d.usual?.route ?? '', aliases: d.aliases ?? [], use: undefined as string | undefined, drug: undefined as ClinicDrug | undefined,
    }))
    const own = clinicDrugs.filter((d) => d.active).map((d) => ({
      key: d.id, name: d.name, brand: d.brand, presentation: [d.presentation, d.concentration].filter(Boolean).join(' '),
      route: d.lnme ? routeWords(d.lnme.routes) : d.route ?? '', aliases: d.lnme?.aliases ?? [], use: d.usualUse, drug: d as ClinicDrug | undefined,
    }))
    return [...base, ...own]
  }, [clinicDrugs])
  // Filtro por vía: cada vía que aparece (una fila con «Intravenosa, intramuscular» sale en las dos)
  const routesOf = (r: string) => r.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.charAt(0).toLocaleUpperCase('es') + x.slice(1))
  const routeOptions = useMemo(() => [...new Set(rows.flatMap((r) => routesOf(r.route)))].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })), [rows])
  const n = normalize(q)
  const coll = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' })
  const shown = rows
    .filter((r) => !n || normalize(`${r.name} ${r.brand ?? ''} ${r.aliases.join(' ')}`).includes(n))
    .filter((r) => !via || routesOf(r.route).includes(via))
    .sort((a, b) => {
      if (sort.key === 'route') {
        // Por la primera vía; los que no tienen vía van al final en los dos sentidos
        if (!a.route !== !b.route) return a.route ? -1 : 1
        return sort.dir * coll(routesOf(a.route)[0] ?? '', routesOf(b.route)[0] ?? '') || coll(a.name, b.name)
      }
      return sort.dir * (coll(a.name, b.name) || coll(a.presentation, b.presentation))
    })
  // GE5: por páginas sobre la lista completa; buscar, filtrar u ordenar vuelve a la página 1
  const [pageNo, setPage] = usePage(JSON.stringify([q, via, sort]))
  const pg = paginate(shown, pageNo)
  const toggle = (key: 'name' | 'route') => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))
  const arrow = (key: 'name' | 'route') => (sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : '')
  const aria = (key: 'name' | 'route') => (sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none')
  const importFile = async (file: File) => {
    const parsed = parseCsv(await file.text())
    if (parsed.length < 2) return setResult({ added: 0, skipped: [{ row: 1, name: '', reason: 'El archivo no tiene filas debajo del encabezado.' }] })
    const head = parsed[0].map((h) => normalize(h).replace(/\s+/g, '_'))
    const idx = (c: string) => head.indexOf(c)
    if (idx('nombre_generico') < 0) return setResult({ added: 0, skipped: [{ row: 1, name: '', reason: 'Falta la columna nombre_generico. Usa la plantilla.' }] })
    const list = parsed.slice(1).map((r) => Object.fromEntries(IMPORT_COLUMNS.filter((c) => idx(c) >= 0 && r[idx(c)]?.trim()).map((c) => [IMPORT_FIELDS[c], r[idx(c)].trim()])))
    const r = await importClinicDrugs(list)
    if (r) setResult(r)
  }
  return (
    <section className="panel table-wrap">
      <SectionHead title="Vademécum" sub={`${rows.length} medicamentos. Un medicamento archivado ya no se ofrece al recetar.`} action={<>
          <button className="btn btn--ghost btn--sm" onClick={() => download('plantilla-vademecum.csv', toCsv([[...IMPORT_COLUMNS], ['Ademetionina', 'Heptral', 'Tabletas', '400 mg', 'Oral', '1 tableta cada 12 horas', 'Colestasis intrahepática']]))}>
            <Download size={15} />Plantilla</button>
          <label className="btn btn--ghost btn--sm"><Upload size={15} />Importar CSV
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f) }} /></label>
          <button className="btn btn--primary btn--sm" onClick={() => setAdding(true)}><Plus size={15} />Agregar medicamento</button>
        </>} />
      <div className="panel__body vdm-tools">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre genérico, comercial o alias" aria-label="Buscar medicamento" />
        <label className="field field--inline"><span>Vía</span>
          <select className="select" value={via} onChange={(e) => setVia(e.target.value)} aria-label="Filtrar por vía">
            <option value="">Todas</option>{routeOptions.map((r) => <option key={r}>{r}</option>)}
          </select></label>
      </div>
      {result && (
        <div className={`alert-strip ${result.added ? 'alert-strip--calm' : 'alert-strip--amber'}`} style={{ margin: '12px 22px 0', flexDirection: 'column', alignItems: 'stretch' }}>
          <span>Se importaron {result.added} medicamento(s).{result.skipped.length ? ` ${result.skipped.length} fila(s) no se importaron:` : ''}</span>
          {result.skipped.length > 0 && <ul className="note__list" style={{ margin: 0, fontWeight: 400 }}>{result.skipped.slice(0, 8).map((x) => <li key={x.row}>Fila {x.row}{x.name ? ` (${x.name})` : ''}: {x.reason}</li>)}</ul>}
          <button className="linklike self-start" onClick={() => setResult(null)}>Cerrar</button>
        </div>
      )}
      <table className="table table--sticky table--cards vdm-table">
        <thead><tr>
          <th aria-sort={aria('name')}><button className="th-sort" onClick={() => toggle('name')}>Nombre genérico{arrow('name')}</button></th>
          <th>Comercial</th><th>Presentación</th>
          <th aria-sort={aria('route')}><button className="th-sort" onClick={() => toggle('route')}>Vía{arrow('route')}</button></th>
          <th>Origen</th><th />
        </tr></thead>
        <tbody>
          {pg.rows.map((r) => (
            <tr key={r.key}>
              <td className="tc-full"><b>{r.name}</b>{r.use && <small className="muted" style={{ display: 'block' }}>{r.use}</small>}</td>
              <td data-label="Comercial">{r.brand ?? '—'}</td>
              <td data-label="Presentación">{r.presentation || '—'}</td>
              <td data-label="Vía">{r.route || '—'}</td>
              <td data-label="Origen" className="muted">{DRUG_ORIGIN}</td>
              <td className="tc-actions" style={{ textAlign: 'right' }}>{r.drug && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(r.drug!)}>{canEdit(r.drug) ? 'Editar' : 'Ver'}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination {...pg} onPage={setPage} label="Páginas del vademécum" />
      {!shown.length && <div className="empty">Ningún medicamento coincide.</div>}
      {editing && <DrugForm drug={editing} onClose={() => setEditing(null)} />}
      {adding && <DrugForm onClose={() => setAdding(false)} />}
    </section>
  )
}

/**
 * Camas (AD3): sin especialidad fija. El estado sale solo de los pacientes hospitalizados (Libre u Ocupada, con el
 * paciente y la especialidad de su ingreso); "Fuera de servicio" es lo único que se marca a mano (mantenimiento).
 */
function Beds() {
  const { beds, bedStays = [], patient, createBed, updateBed } = useStore()
  const [room, setRoom] = useState('')
  const [label, setLabel] = useState('')
  // CF5 (ronda 6): «Agregar cama» arriba, en el encabezado; abre la misma fila de alta, al principio
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const sorted = [...beds].sort((a, b) => a.room.localeCompare(b.room, 'es', { numeric: true }) || a.label.localeCompare(b.label))
  const stayIn = (id: string) => bedStays.find((h) => h.bedId === id)
  const counts = { free: sorted.filter((b) => b.active && !stayIn(b.id)).length, busy: sorted.filter((b) => stayIn(b.id)).length, off: sorted.filter((b) => !b.active).length }
  return (
    <section className="panel table-wrap" data-tour="tab:camas">
      <SectionHead title="Camas" sub={`${counts.free} libres · ${counts.busy} ocupadas${counts.off ? ` · ${counts.off} fuera de servicio` : ''}. Se ocupan al ingresar a un paciente y se liberan al darle de alta o trasladarlo.`}
        action={<button className="btn btn--primary btn--sm" onClick={() => setAdding(true)}><Plus size={15} />Agregar cama</button>} />
      <table className="table table--sticky table--cards">
        <thead><tr><th>Cuarto</th><th>Cama</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {adding && (
            <tr className="row-new">
              <td data-label="Cuarto"><input className="input" autoFocus placeholder="Ej. 106" value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Cuarto" /></td>
              <td data-label="Cama"><input className="input" placeholder="Opcional, ej. A" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Cama" /></td>
              <td />
              <td className="tc-actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn btn--primary btn--sm" disabled={!room.trim()} onClick={async () => {
                if (await createBed({ room: room.trim(), label: label.trim(), active: true })) { setRoom(''); setLabel(''); setAdding(false) }
              }}><Plus size={14} />Agregar cama</button>{' '}
                <button className="btn btn--ghost btn--sm" onClick={() => { setAdding(false); setRoom(''); setLabel('') }}>Cancelar</button></td>
            </tr>
          )}
          {sorted.map((b) => {
            const h = stayIn(b.id)
            const p = h && patient(h.patientId)
            return (
              <tr key={b.id} style={b.active ? undefined : { opacity: 0.7 }}>
                {editing === b.id ? <BedRename b={b} onDone={() => setEditing(null)} /> : <><td data-label="Cuarto" className="num">{b.room}</td><td data-label="Cama">{b.label || '—'}</td></>}
                <td data-label="Estado" className="tc-full">{!b.active ? <><span className="badge badge--amber">Fuera de servicio</span>{b.outOfServiceNote && <small className="muted" style={{ display: 'block' }}>{b.outOfServiceNote}</small>}</>
                  : h ? <><span className="badge badge--ink">Ocupada</span> <span style={{ fontSize: 14 }}>{p ? fullName(p) : 'Paciente'}{h.specialty ? ` · ${h.specialty}` : ''}</span></>
                    : <span className="badge badge--mint">Libre</span>}</td>
                <td className="tc-actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {editing !== b.id && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(b.id)}>Renombrar</button>}{' '}
                  {b.active
                    ? <button className="btn btn--ghost btn--sm" disabled={!!h} title={h ? 'Tiene un paciente: dale de alta o trasládalo primero' : undefined} onClick={() => {
                      const note = prompt('Motivo (por ejemplo, mantenimiento):', 'Mantenimiento')
                      if (note !== null) updateBed(b.id, { active: false, outOfServiceNote: note.trim() || undefined }, 'Cama fuera de servicio')
                    }}>Fuera de servicio</button>
                    : <button className="btn btn--soft btn--sm" onClick={() => updateBed(b.id, { active: true }, 'Cama en servicio')}>Volver a servicio</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!beds.length && !adding && <div className="empty">Agrega las camas de la clínica con su número de cuarto: «Agregar cama», arriba.</div>}
    </section>
  )
}

function BedRename({ b, onDone }: { b: Bed; onDone: () => void }) {
  const { updateBed } = useStore()
  const [room, setRoom] = useState(b.room)
  const [label, setLabel] = useState(b.label)
  const save = async () => { if (room.trim() && (room !== b.room || label !== b.label)) { if (!(await updateBed(b.id, { room: room.trim(), label: label.trim() }, 'Cama renombrada'))) return } onDone() }
  return (<>
    <td data-label="Cuarto"><input className="input" value={room} autoFocus onChange={(e) => setRoom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone() }} aria-label="Cuarto" /></td>
    <td data-label="Cama"><div style={{ display: 'flex', gap: 6 }}><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone() }} aria-label="Cama" />
      <button className="btn btn--primary btn--sm" onClick={save}>Guardar</button></div></td>
  </>)
}

/** Reduce el logo a 240 px de alto como máximo para que no pese en cada carga. */
function shrinkLogo(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 240 / img.height, 480 / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    img.src = URL.createObjectURL(file)
  })
}

/** CF1: Datos de la clínica (o del consultorio): lo que sale en recetas, constancias y recibos. */
function ClinicDataForm() {
  const { settings } = useStore()
  const { v: f, set, setMany } = useSettingsDraft('datos')
  const [converting, setConverting] = useState(false)
  const office = features(settings).office
  return (
    <div className="cfg-grid">
      <section className="panel">
        <div className="panel__head"><h2>Nombre y contactos</h2></div>
        <div className="panel__body form-grid">
          <label className="field span-2"><span>Nombre</span><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="field span-2"><span>Dirección</span><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
          <div className="field span-2"><span>Teléfonos y WhatsApp</span>
            <ContactsEditor value={f.contacts ?? []} onChange={(contacts) => setMany({ contacts, phone: contacts.find((c) => c.primary)?.number ?? '' })} />
            <label className="check-line"><input type="checkbox" checked={!!f.docsWhatsapp} onChange={(e) => set('docsWhatsapp', e.target.checked)} />
              <span><b>Poner también el WhatsApp en recetas, constancias y recibos</b><small>{f.docsWhatsapp ? contactLine(f) : `Tel. ${f.phone} · WhatsApp ${clinicWhatsapp(f)}`}</small></span></label>
          </div>
          <label className="field span-2"><span>Correo</span><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
        </div>
      </section>
      <section className="panel">
        <div className="panel__head"><div><h2>Recetas, constancias y recibos</h2><p>El encabezado, la moneda y cómo se escribe el documento de identidad.</p></div></div>
        <div className="panel__body form-grid">
          {office && <>
            <label className="field"><span>Especialidad (encabezado de recetas)</span><input className="input" value={f.specialty ?? ''} onChange={(e) => set('specialty', e.target.value)} /></label>
            <label className="field"><span>Número de colegiación</span><input className="input" value={f.license ?? ''} onChange={(e) => set('license', e.target.value)} /></label>
          </>}
          <label className="field"><span>Símbolo de moneda</span><input className="input" value={f.currency} maxLength={4} onChange={(e) => set('currency', e.target.value)} /></label>
          <label className="field span-2" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={f.recordUsesDni} onChange={(e) => set('recordUsesDni', e.target.checked)} />
            <span style={{ margin: 0 }}>Usar el número de identidad como número de expediente en recetas y constancias</span></label>
          <label className="field span-2"><span>Formato del documento de identidad</span>
            <input className="input num" value={f.dniMask ?? '0000-0000-00000'} maxLength={30} onChange={(e) => set('dniMask', e.target.value.replace(/[^0\- /.]/g, ''))} />
            <small className="muted">Cada 0 es un dígito; los guiones se ponen solos. El de Honduras es 0000-0000-00000. Déjalo vacío si la clínica registra otro tipo de documento con letras.</small></label>
          <div className="field span-2"><span>Logo (aparece en recetas y constancias)</span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {f.logo ? <img src={f.logo} alt="Logo de la clínica" style={{ height: 48, maxWidth: 160, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 8, padding: 4 }} />
                : <span className="muted">Sin logo; se usa el de Clinara.</span>}
              <label className="btn btn--soft btn--sm">{f.logo ? 'Cambiar' : 'Subir logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) set('logo', await shrinkLogo(file).catch(() => f.logo))
                }} /></label>
              {f.logo && <button className="btn btn--ghost btn--sm" onClick={() => set('logo', undefined)}>Quitar</button>}
            </div>
          </div>
        </div>
      </section>
      {office && (
        <section className="panel span-all">
          <div className="panel__head"><div><h2>¿El consultorio crece?</h2><p>Si vas a sumar a otro médico, conviértelo en clínica: aparecen enfermería, recepción, administración y hospitalización. No se pierde ni se mueve ningún dato.</p></div>
            <button className="btn btn--ghost" onClick={() => setConverting(true)}>Convertir en clínica</button></div>
        </section>
      )}
      {converting && <ConvertToClinic onClose={() => setConverting(false)} />}
    </div>
  )
}

/** CF1: el mensaje de recordatorio por WhatsApp (sección Agenda y recordatorios), con un ejemplo. */
function ReminderForm() {
  const { v: f, set } = useSettingsDraft('recordatorio')
  const preview = fillTemplate(f.reminderTemplate, {
    paciente: 'María José', clinica: f.name, medico: 'Dra. Valeria Solórzano', fecha: 'martes 20 de octubre', hora: '09:30', telefono: clinicWhatsapp(f),
  })
  return (
    <Panel title="Recordatorio por WhatsApp" sub={<>El mensaje que se envía antes de cada cita. Variables: {'{paciente} {clinica} {medico} {fecha} {hora} {telefono}'}</>}>
      <div className="panel__body cfg-reminder">
        <textarea className="textarea" rows={5} value={f.reminderTemplate} onChange={(e) => set('reminderTemplate', e.target.value)} aria-label="Plantilla del recordatorio" />
        <div className="wa-preview"><span>Ejemplo con una cita ficticia</span><p>{preview}</p></div>
      </div>
    </Panel>
  )
}

/**
 * CF1: Hospitalización y observación (en el consultorio, Observación): horas para resaltar, checklist de órdenes (OB1),
 * curva térmica y fiebre. En el consultorio, si usa observación.
 */
function ObservationForm() {
  const { settings } = useStore()
  const { v: f, set } = useSettingsDraft('observacion')
  const office = features(settings).office
  const on = !office || f.observationEnabled !== false
  return (
    <div className="cfg-grid">
      <Panel title="Observación" sub={office ? 'Para aplicar medicamentos o hidratar en el consultorio.' : 'Pacientes en observación corta, sin cama.'}>
        <div className="panel__body form-grid">
          {office && <label className="check-line span-2"><input type="checkbox" checked={f.observationEnabled !== false} onChange={(e) => set('observationEnabled', e.target.checked)} />
            <span><b>Uso observación</b><small>Para aplicar medicamentos o hidratar en el consultorio, con su hoja de medicamentos. Si la apagas, la consulta sólo emite receta.</small></span></label>}
          {on && <label className="field span-2"><span>Resaltar después de (horas)</span>
            <input className="input num" style={{ maxWidth: 160 }} type="number" min={1} max={240} value={f.obsAlertHours ?? 24} onChange={(e) => set('obsAlertHours', Math.max(1, Number(e.target.value) || 24))} />
            <small className="muted">Quien lleva más tiempo que esto en observación se resalta en la lista.</small></label>}
          {/* OB1 (ronda 17): viene activado; la migración v90 lo activó una vez en las clínicas que ya existían */}
          {!office && <label className="check-line span-2"><input type="checkbox" checked={!!f.obsOrderChecklist} onChange={(e) => set('obsOrderChecklist', e.target.checked)} />
            <span><b>Órdenes en observación: enfermería las revisa como checklist</b><small>Enfermería revisa una por una las órdenes de cada nota de observación, como en hospitalización.</small></span></label>}
        </div>
      </Panel>
      {on && (
        <Panel title="Curva térmica y fiebre" sub="Los colores de la curva y la alerta de fiebre del expediente.">
          <div className="panel__body form-grid">
            <label className="field"><span>Temperatura normal desde (°C)</span>
              <input className="input num" type="number" step={0.1} min={34} max={38} value={f.tempLow ?? 36} onChange={(e) => set('tempLow', Math.round(Number(e.target.value) * 10) / 10)} />
              <small className="muted">Por debajo es hipotermia (azul en la curva).</small></label>
            <label className="field"><span>Fiebre desde (°C)</span>
              <input className="input num" type="number" step={0.1} min={36} max={41} value={f.tempHigh ?? 38} onChange={(e) => set('tempHigh', Math.round(Number(e.target.value) * 10) / 10)} />
              <small className="muted">Desde este valor es fiebre (rojo en la curva y alerta del expediente).</small></label>
          </div>
        </Panel>
      )}
    </div>
  )
}

/**
 * Consultorio → clínica. Se elige quién administrará la clínica (con otro correo) y a qué pasa cada asistente.
 * Al terminar se muestra la contraseña temporal de administración y todos vuelven a iniciar sesión.
 */
function ConvertToClinic({ onClose }: { onClose: () => void }) {
  const { staff, convertToClinic, signOut } = useStore()
  const assistants = staff.filter((s) => hasRole(s, 'assistant'))
  const [admin, setAdmin] = useState({ name: '', email: '' })
  const [roles, setRoles] = useState<Record<string, 'reception' | 'nurse'>>(() => Object.fromEntries(assistants.map((a) => [a.id, 'reception'])))
  const [sure, setSure] = useState(false)
  const [done, setDone] = useState<{ email: string; password: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (done) {
    return (
      <Modal title="Ya es una clínica" onClose={async () => { await signOut() }} footer={<button className="btn btn--primary" onClick={async () => { await signOut() }}>Volver a iniciar sesión</button>}>
        <p>Entrega estos datos a quien administrará la clínica. La contraseña sólo se muestra esta vez.</p>
        <div className="field"><span>Correo</span><div className="secret">{done.email}</div></div>
        <div className="field"><span>Contraseña temporal</span><div className="secret">{done.password}</div></div>
        <p className="muted" style={{ fontSize: 13.5 }}>Los permisos cambiaron: todos vuelven a iniciar sesión.</p>
      </Modal>
    )
  }
  return (
    <Modal title="Convertir el consultorio en clínica" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!sure || admin.name.trim().length < 3 || !/\S+@\S+\.\S+/.test(admin.email) || busy} onClick={async () => {
        setBusy(true)
        const r = await convertToClinic({ admin: { name: admin.name.trim(), email: admin.email.trim() }, assistants: roles })
        setBusy(false)
        if (r) setDone({ email: r.admin.email, password: r.password })
      }}>Convertir</button>
    </>}>
      <p>Tú sigues como médico. Una clínica la administra un usuario de administración (personal, precios, configuración y reportes); créalo con otro correo, aunque seas tú.</p>
      <div className="form-grid">
        <label className="field"><span>Nombre de quien administrará</span><input className="input" value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} /></label>
        <label className="field"><span>Correo de acceso (distinto al tuyo)</span><input className="input" type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} /></label>
      </div>
      {assistants.length > 0 && <fieldset className="fs"><legend>Tus asistentes pasan a</legend>
        {assistants.map((a) => (
          <label key={a.id} className="field"><span>{a.name}</span>
            <select className="select" value={roles[a.id]} onChange={(e) => setRoles({ ...roles, [a.id]: e.target.value as 'reception' | 'nurse' })}>
              <option value="reception">Recepción (agenda, llegadas, caja)</option><option value="nurse">Enfermería (preclínica, medicamentos, notas)</option>
            </select></label>
        ))}</fieldset>}
      <label className="check-line"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        <span><b>Entiendo que no se puede volver a consultorio</b><small>Queda en la bitácora. Ningún dato se borra.</small></span></label>
    </Modal>
  )
}

/**
 * EX1: áreas de servicio. Si la clínica tiene laboratorio o imágenes propios, los exámenes se dirigen a esa área; si no
 * (por omisión), los atiende enfermería. Hoy la app no tiene esos roles: las alertas siguen yendo a enfermería hasta que
 * se creen y se asignen. También los umbrales críticos de laboratorio, por grupo (fuera de ellos, alerta crítica al médico).
 */
function ServiceAreas() {
  const { settings, saveExamAreas } = useStore()
  // CF1 (ronda 17): borrador encima de lo guardado; lo guarda «Guardar cambios» de la sección
  const [draft, setDraft] = useState<{ hasLab?: boolean; hasImaging?: boolean }>({})
  const lab = draft.hasLab ?? !!settings.hasLab
  const img = draft.hasImaging ?? !!settings.hasImaging
  const setLab = (x: boolean) => setDraft((d) => ({ ...d, hasLab: x }))
  const setImg = (x: boolean) => setDraft((d) => ({ ...d, hasImaging: x }))
  useSectionBlock('areas', {
    dirty: lab !== !!settings.hasLab || img !== !!settings.hasImaging,
    save: async () => { const ok = !!(await saveExamAreas({ hasLab: lab, hasImaging: img })); if (ok) setDraft({}); return ok },
    reset: () => setDraft({}),
  })
  return (
    <div>
      <section className="panel" data-tour="tab:areas">
        <div className="panel__head"><div><h2>Áreas de servicio</h2><p>¿Quién realiza los exámenes en {features(settings).office ? 'el consultorio' : 'la clínica'}?</p></div></div>
        <div className="panel__body" style={{ display: 'grid', gap: 10 }}>
          <label className="check-line"><input type="checkbox" checked={lab} onChange={(e) => setLab(e.target.checked)} />
            <span><b>Laboratorio propio</b><small>Los exámenes de laboratorio quedan dirigidos al laboratorio. Sin él, enfermería toma la muestra.</small></span></label>
          <label className="check-line"><input type="checkbox" checked={img} onChange={(e) => setImg(e.target.checked)} />
            <span><b>Imágenes propias</b><small>Rayos X, ultrasonido, EKG… quedan dirigidos al área de imágenes. Sin ella, enfermería los coordina o realiza.</small></span></label>
          <p className="muted" style={{ fontSize: 13.5 }}>Mientras no haya personas con rol de laboratorio o de imágenes, los pendientes siguen llegando a la bandeja de enfermería. Cuando se agreguen esos roles, bastará con asignarlos.</p>
        </div>
      </section>
    </div>
  )
}

/** AD9: formas de pago que acepta la clínica. Al cobrar sólo aparecen éstas. Al menos una queda activa. */
function PaymentMethods() {
  const { settings, savePaymentMethods } = useStore()
  const all: PaymentMethod[] = ['cash', 'transfer', 'card', 'deposit', 'insurance', 'other']
  const saved = settings.paymentMethods ?? ['cash', 'transfer']
  // CF1 (ronda 17): borrador encima de lo guardado; lo guarda «Guardar cambios» de la sección
  const [draft, setOn] = useState<PaymentMethod[] | null>(null)
  const on = draft ?? saved
  const hint: Record<PaymentMethod, string> = {
    cash: 'Con cálculo del cambio y arqueo al cierre.', transfer: 'Se anota el banco y, si la dan, la referencia.', card: 'Sólo si la clínica tiene terminal (POS). Pide el número de autorización.',
    deposit: 'Depósito en la cuenta de la clínica, con banco y referencia.', insurance: 'Pagos que cubre la aseguradora, con número de póliza o autorización.', other: 'Cualquier otra forma, con una nota.',
  }
  const same = on.length === saved.length && on.every((m) => saved.includes(m))
  useSectionBlock('pagos', {
    dirty: !same,
    save: async () => { const ok = !!(await savePaymentMethods(on)); if (ok) setOn(null); return ok },
    reset: () => setOn(null),
  })
  return (
    <section className="panel" data-tour="tab:pagos">
      <div className="panel__head"><div><h2>Formas de pago</h2><p>Marca las que acepta {features(settings).office ? 'el consultorio' : 'la clínica'}. Al cobrar sólo aparecen éstas.</p></div></div>
      <div className="panel__body" style={{ display: 'grid', gap: 8, maxWidth: 640 }}>
        {all.map((m) => (
          <label key={m} className="check-line"><input type="checkbox" checked={on.includes(m)} disabled={on.length === 1 && on.includes(m)}
            onChange={(e) => setOn(e.target.checked ? all.filter((x) => x === m || on.includes(x)) : on.filter((x) => x !== m))} />
            <span><b>{METHOD_LABEL[m]}</b><small>{hint[m]}</small></span></label>
        ))}
        <p className="muted" style={{ fontSize: 13.5 }}>Al menos una queda activa.</p>
      </div>
    </section>
  )
}

/** CF1 (ronda 6): encabezado con el botón azul «Agregar servicio» arriba; abre la misma fila de alta de antes, al principio. */
function Services() {
  const { services, settings, createService } = useStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  return (
    <section className="panel table-wrap" data-tour="tab:servicios">
      <SectionHead title="Servicios y precios" sub="Lo que se cobra en caja, con su precio. Ocultar un servicio lo quita de la caja; los cobros anteriores no cambian."
        action={<button className="btn btn--primary btn--sm" onClick={() => setAdding(true)}><Plus size={15} />Agregar servicio</button>} />
      <table className="table table--sticky table--cards">
        <thead><tr><th>Servicio</th><th style={{ width: 160 }}>Precio ({settings.currency})</th><th style={{ width: 130 }}>Estado</th><th>Origen</th><th style={{ width: 120 }} /></tr></thead>
        <tbody>
          {adding && (
            <tr className="row-new">
              <td data-label="Servicio" className="tc-full"><input className="input" autoFocus placeholder="Nuevo servicio, p. ej. Retiro de puntos" aria-label="Nombre del servicio" value={name} onChange={(e) => setName(e.target.value)} /></td>
              <td data-label={`Precio (${settings.currency})`}><input className="input num" type="number" min={0} step="0.01" placeholder="0.00" aria-label="Precio" value={price} onChange={(e) => setPrice(e.target.value)} /></td>
              <td />
              <td />
              <td className="tc-actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn btn--primary btn--sm" disabled={name.trim().length < 2 || price === ''} onClick={async () => {
                  if (await createService({ name: name.trim(), price: Number(price), active: true })) { setName(''); setPrice(''); setAdding(false) }
                }}><Plus size={15} />Agregar</button>{' '}
                <button className="btn btn--ghost btn--sm" onClick={() => { setAdding(false); setName(''); setPrice('') }}>Cancelar</button>
              </td>
            </tr>
          )}
          {services.map((s) => <ServiceRow key={s.id} s={s} />)}
        </tbody>
      </table>
    </section>
  )
}

function ServiceRow({ s }: { s: Service }) {
  const { updateService, settings, staffById } = useStore()
  const [name, setName] = useState(s.name)
  const [price, setPrice] = useState(String(s.price))
  const dirty = name !== s.name || Number(price) !== s.price
  // CF1 (ronda 17): un precio o nombre cambiado también lo guarda «Guardar cambios» de la sección (y avisa al cambiar de sección)
  useSectionBlock(`servicio:${s.id}`, {
    dirty, save: async () => !!(await updateService(s.id, { name: name.trim(), price: Number(price) })),
    reset: () => { setName(s.name); setPrice(String(s.price)) },
  })
  return (
    <tr style={s.active ? undefined : { opacity: 0.55 }}>
      <td data-label="Servicio" className="tc-full"><input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del servicio" /></td>
      <td data-label={`Precio (${settings.currency})`}><input className="input num" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} aria-label={`Precio de ${s.name}`} title={money(s.price, settings.currency)} /></td>
      <td data-label="Estado">{s.active ? <span className="badge badge--mint">Activo</span> : <span className="badge">Oculto en caja</span>}</td>
      <td data-label="Origen" className="tc-full" style={{ fontSize: 13.5 }}>{s.createdBy ? <>Agregado al cobrar por {staffById(s.createdBy)?.name ?? '—'}<br /><small className="muted">{s.createdAt ? date(s.createdAt) : ''}</small></> : <span className="muted">Configuración</span>}</td>
      <td className="tc-actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {dirty
          ? <button className="btn btn--primary btn--sm" onClick={() => updateService(s.id, { name: name.trim(), price: Number(price) })}>Guardar</button>
          : <button className="btn btn--ghost btn--sm" onClick={() => updateService(s.id, { active: !s.active })}>{s.active ? 'Ocultar' : 'Activar'}</button>}
      </td>
    </tr>
  )
}

const LAST_DOCTOR = 'clinara.horarios.medico'

/**
 * AD2 (ronda 5): un médico a la vez. Se elige en la lista (con buscador) y se ve sólo su horario, con el mismo
 * formulario. Si hay cambios sin guardar, se pregunta antes de cambiar. Se recuerda el último consultado. En un
 * consultorio (un solo médico) no hay lista.
 */
function Schedules() {
  const { staff, settings } = useStore()
  const office = features(settings).office
  const doctors = staff.filter((s) => hasRole(s, 'doctor')).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'))
  const [q, setQ] = useState('')
  const [id, setId] = useState<string>(() => { try { return localStorage.getItem(LAST_DOCTOR) ?? '' } catch { return '' } })
  const [unsaved, setUnsaved] = useState<(() => Promise<boolean>) | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  // CF1 (ronda 17): el horario sin guardar cuenta como cambio de la sección; «Descartar» vuelve a montar el formulario
  const [resetKey, setResetKey] = useState(0)
  useSectionBlock('horario', { dirty: !!unsaved, save: async () => (unsaved ? unsaved() : true), reset: () => { setUnsaved(null); setResetKey((k) => k + 1) } })
  const current = doctors.find((d) => d.id === id) ?? doctors[0]
  const n = normalize(q)
  const list = doctors.filter((d) => !n || normalize(`${d.name} ${d.specialty ?? ''}`).includes(n))
  const select = (next: string) => {
    setId(next)
    setUnsaved(null)
    try { localStorage.setItem(LAST_DOCTOR, next) } catch { /* sin almacenamiento */ }
  }
  const choose = (next: string) => { if (next !== current?.id) { if (unsaved) setAsking(next); else select(next) } }
  if (!current) return <div className="empty">No hay médicos en {office ? 'el consultorio' : 'la clínica'}.</div>
  return (
    <div style={{ display: 'grid', gap: 16 }} data-tour="tab:horarios">
      <p style={{ color: 'var(--muted)' }}>Cada día puede tener una o más franjas (por ejemplo, de 08:00 AM a 12:00 PM y de 02:00 PM a 05:00 PM). La agenda y la reserva en línea solo ofrecen horas dentro del horario. Cada médico también puede cambiar el suyo en su <i>Configuración</i>.</p>
      <div className={office || doctors.length < 2 ? '' : 'sched-pick'}>
        {!office && doctors.length > 1 && (
          <nav className="panel sched-pick__list" aria-label="Médicos">
            <div className="panel__body" style={{ paddingBottom: 8 }}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar médico por nombre" aria-label="Buscar médico por nombre" />
            </div>
            <ul role="listbox" aria-label="Elige un médico">
              {list.map((d) => (
                <li key={d.id}>
                  <button type="button" role="option" aria-selected={d.id === current.id} className={`sched-pick__item${d.id === current.id ? ' is-on' : ''}`} onClick={() => choose(d.id)}>
                    <Avatar name={d.name} color={d.color} /><span><b>{d.name}</b><small>{[d.specialty, d.active ? '' : 'desactivado'].filter(Boolean).join(' · ')}</small></span>
                  </button>
                </li>
              ))}
              {!list.length && <li className="muted" style={{ padding: '8px 16px' }}>Ningún médico coincide.</li>}
            </ul>
          </nav>
        )}
        <ScheduleCard key={`${current.id}-${resetKey}`} d={current} onDirty={(save) => setUnsaved(() => save)} />
      </div>
      {asking && (
        <Modal title="Hay cambios sin guardar" onClose={() => setAsking(null)} footer={<>
          <button className="btn btn--ghost" onClick={() => setAsking(null)}>Cancelar</button>
          <button className="btn btn--soft" onClick={() => { select(asking); setAsking(null) }}>Descartar</button>
          <button className="btn btn--primary" onClick={async () => { if (unsaved && await unsaved()) { select(asking); setAsking(null) } }}>Guardar</button>
        </>}>
          <p>Hay cambios sin guardar en el horario de {current.name}. ¿Guardar antes de cambiar?</p>
        </Modal>
      )}
    </div>
  )
}

function ScheduleCard({ d, onDirty }: { d: Staff; onDirty?: (save: (() => Promise<boolean>) | null) => void }) {
  const { services, updateStaff } = useStore()
  return (
    <section className="panel">
      <div className="panel__head">
        <div className="cell-person"><Avatar name={d.name} color={d.color} /><div><h2 style={{ fontSize: 16 }}>{d.name}</h2><p>{d.specialty}{d.active ? '' : ', desactivado'}</p></div></div>
      </div>
      <div className="panel__body">
        <ScheduleEditor d={d} onDirty={onDirty} extra={
          <label className="field"><span>Se cobra por defecto</span>
            <select className="select" value={d.serviceId ?? ''} onChange={(e) => updateStaff(d.id, { serviceId: e.target.value }, 'Servicio por defecto guardado')}>
              <option value="">Ninguno</option>{services.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        } />
      </div>
    </section>
  )
}
