import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarClock, Compass, ListChecks, LogOut, PenLine, Pill, Plus, Settings2, ShieldCheck, Star, UserRound } from 'lucide-react'
import { useStore } from '../lib/store'
import { Avatar, Modal, PageHead } from '../components/ui'
import { SignaturePad } from '../components/SignaturePad'
import { ScheduleEditor } from './ScheduleEditor'
import { PasswordPanel, TwoFactorPanel } from './Account'
import { PERMISSIONS, permissionsFor, ROLE_LABEL, VIEW_LABEL, viewsOf } from '../lib/permissions'
import { drugKey, useVademecum } from '../lib/vademecum'
import { normalize } from '../lib/patients'
import { ROUTES } from '../lib/format'
import { api } from '../lib/api'

type Section = 'pro' | 'firma' | 'horario' | 'vademecum' | 'sets' | 'prefs' | 'seguridad'

const SECTIONS: { key: Section; label: string; icon: typeof Pill; doctor?: boolean }[] = [
  { key: 'pro', label: 'Datos profesionales', icon: UserRound, doctor: true },
  { key: 'firma', label: 'Firma electrónica', icon: PenLine, doctor: true },
  { key: 'horario', label: 'Mi horario', icon: CalendarClock, doctor: true },
  { key: 'vademecum', label: 'Mi vademécum', icon: Pill, doctor: true },
  { key: 'sets', label: 'Mis sets de órdenes', icon: ListChecks, doctor: true },
  { key: 'prefs', label: 'Preferencias', icon: Settings2, doctor: true },
  { key: 'seguridad', label: 'Seguridad', icon: ShieldCheck },
]

/**
 * MC6: "Mi configuración". El médico prepara aquí lo que usa al atender (firma, horario, vademécum, sets, exámenes,
 * preferencias). Recepción, enfermería y administración ven sólo Seguridad y Mi actividad. Cada apartado guarda solo.
 */
export default function MyConfig() {
  const { user } = useStore()
  const [params, setParams] = useSearchParams()
  if (!user) return null
  const doctor = user.role === 'doctor'
  const sections = SECTIONS.filter((s) => !s.doctor || doctor)
  const current = sections.find((s) => s.key === params.get('seccion'))?.key ?? sections[0].key
  const go = (k: Section) => setParams({ seccion: k }, { replace: true })
  return (
    <div className="page">
      <PageHead title={doctor ? 'Mi configuración' : 'Mi cuenta'} sub={doctor ? 'Lo que preparas una vez y usas al atender: tu firma, tu horario, tus medicamentos y tus preferencias.' : 'Tu contraseña, la verificación en dos pasos y lo que has hecho en el sistema.'}
        actions={<button className="btn btn--ghost" onClick={() => window.dispatchEvent(new Event('start-tour'))}><Compass size={16} />Ver el recorrido</button>} />
      <div className="chart-head" style={{ gridTemplateColumns: 'auto 1fr' }}>
        <Avatar name={user.name} color={user.color} />
        <div>
          <h1 style={{ fontSize: 24 }}>{user.name}</h1>
          <div className="chart-meta"><span>{viewsOf(user).length > 1 ? `${(user.roles ?? []).map((r) => ROLE_LABEL[r]).join(' y ')} · ${VIEW_LABEL[user.role]}` : ROLE_LABEL[user.role]}{user.specialty ? `, ${user.specialty}` : ''}</span>
            <span>{user.email}</span>{user.license && <span>Colegiación <b>{user.license}</b></span>}</div>
        </div>
      </div>
      <div className="myconf">
        <nav className="myconf__nav" aria-label="Apartados">
          {sections.map((s) => (
            <button key={s.key} type="button" className={`myconf__tab${current === s.key ? ' is-on' : ''}`} aria-current={current === s.key ? 'page' : undefined} onClick={() => go(s.key)}>
              <s.icon size={16} />{s.label}
            </button>
          ))}
        </nav>
        <div className="myconf__body">
          {current === 'pro' && <ProfessionalPanel />}
          {current === 'firma' && <SignaturePanel />}
          {current === 'horario' && <SchedulePanel />}
          {current === 'vademecum' && <VademecumPanel />}
          {current === 'sets' && <SetsPanel />}
          {current === 'prefs' && <PreferencesPanel />}
          {current === 'seguridad' && <SecurityPanel />}
        </div>
      </div>
    </div>
  )
}

/** Nombre como aparece en recetas, constancias y epicrisis; especialidad; colegiación; sello. */
function ProfessionalPanel() {
  const { user, saveMyProfile } = useStore()
  const [f, setF] = useState({ docName: user?.docName ?? user?.name ?? '', specialty: user?.specialty ?? '', license: user?.license ?? '' })
  const [stamp, setStamp] = useState<string | null | undefined>(undefined)
  useEffect(() => { api<{ stamp: string | null }>('/me/marks').then((r) => setStamp(r.stamp)).catch(() => setStamp(null)) }, [])
  if (!user) return null
  const dirty = f.docName !== (user.docName ?? user.name) || f.specialty !== (user.specialty ?? '') || f.license !== (user.license ?? '')
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Datos profesionales</h2><p>Así apareces en tus recetas, constancias, autorizaciones y epicrisis.</p></div></div>
      <div className="panel__body" style={{ display: 'grid', gap: 14 }}>
        <div className="form-grid">
          <label className="field span-2"><span>Nombre como aparece en documentos</span><input className="input" value={f.docName} onChange={(e) => setF({ ...f, docName: e.target.value })} placeholder="Ej. Dra. Lucía Herrera Mejía" /></label>
          <label className="field"><span>Especialidad</span><input className="input" value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} /></label>
          <label className="field"><span>Número de colegiado (CMH)</span><input className="input" value={f.license} onChange={(e) => setF({ ...f, license: e.target.value })} placeholder="CMH-00000" /></label>
        </div>
        <button className="btn btn--primary" style={{ justifySelf: 'start' }} disabled={!dirty || f.license.trim().length < 3 || f.docName.trim().length < 3}
          onClick={() => saveMyProfile({ docName: f.docName.trim() === user.name ? '' : f.docName.trim(), specialty: f.specialty.trim(), license: f.license.trim() }, 'Datos profesionales guardados')}>Guardar datos</button>
        <div className="field"><span>Sello (imagen opcional)</span>
          <div className="mark-box">
            {stamp ? <img src={stamp} alt="Tu sello" /> : <span className="muted">{stamp === undefined ? 'Cargando…' : 'Sin sello. Los documentos dejan el espacio para sellar a mano.'}</span>}
            <label className="btn btn--soft btn--sm">{stamp ? 'Cambiar sello' : 'Subir sello'}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const img = await shrinkImage(file, 360)
                if (await saveMyProfile({ stamp: img }, 'Sello guardado')) setStamp(img)
              }} /></label>
            {stamp && <button className="btn btn--ghost btn--sm" onClick={async () => { if (await saveMyProfile({ stamp: '' }, 'Sello quitado')) setStamp(null) }}>Quitar</button>}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Firma: dibujarla o subir una imagen. Los documentos ya firmados guardaron su copia: cambiarla no los altera. */
function SignaturePanel() {
  const { saveMySignature } = useStore()
  const [saved, setSaved] = useState<string | null | undefined>(undefined)
  const [mode, setMode] = useState<'view' | 'draw'>('view')
  const [drawn, setDrawn] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api<{ signature: string | null }>('/me/marks').then((r) => setSaved(r.signature)).catch(() => setSaved(null)) }, [])
  const save = async () => {
    if (!drawn || !password) return
    setBusy(true)
    const ok = await saveMySignature(drawn, password)
    setBusy(false)
    if (ok) { setSaved(drawn); setDrawn(null); setPassword(''); setMode('view') }
  }
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Firma electrónica</h2><p>Se usa en autorizaciones, recetas, constancias y epicrisis. Cambiarla no altera los documentos ya firmados: cada uno guardó su copia.</p></div></div>
      <div className="panel__body" style={{ display: 'grid', gap: 14 }}>
        {mode === 'view' && (<>
          <div className="mark-box mark-box--sig">
            {saved ? <img src={saved} alt="Tu firma guardada" /> : <span className="muted">{saved === undefined ? 'Cargando…' : 'Todavía no tienes firma guardada.'}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={() => { setMode('draw'); setDrawn(null); setUploaded(false) }}><PenLine size={16} />{saved ? 'Cambiar mi firma' : 'Dibujar mi firma'}</button>
            <label className="btn btn--soft">Subir una imagen
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) { setDrawn(await shrinkImage(file, 600)); setUploaded(true); setMode('draw') }
              }} /></label>
          </div>
        </>)}
        {mode === 'draw' && (<>
          {!uploaded && <SignaturePad label="Firma aquí con el dedo, el lápiz o el mouse" onChange={setDrawn} height={170} />}
          {drawn && <div className="mark-box mark-box--sig"><span className="muted">Vista previa</span><img src={drawn} alt="Vista previa de tu firma" /></div>}
          <label className="field" style={{ maxWidth: 320 }}><span>Tu contraseña, para confirmar</span><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--primary" disabled={!drawn || !password || busy} onClick={save}>Guardar firma</button>
            <button className="btn btn--ghost" onClick={() => { setMode('view'); setDrawn(null); setPassword('') }}>Cancelar</button>
          </div>
        </>)}
      </div>
    </section>
  )
}

function SchedulePanel() {
  const { user, staffById } = useStore()
  if (!user) return null
  const me = staffById(user.id) ?? user
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Mi horario de atención</h2><p>La agenda y la reserva en línea sólo ofrecen horas dentro de tu horario. Administración ve los mismos datos y también puede cambiarlos.</p></div></div>
      <div className="panel__body"><ScheduleEditor key={JSON.stringify(me.schedule)} d={me} /></div>
    </section>
  )
}

/** Mi vademécum: favoritos (salen primero al recetar) y medicamentos nuevos para la clínica. */
function VademecumPanel() {
  const { user, saveMyProfile } = useStore()
  const drugs = useVademecum()
  const [q, setQ] = useState('')
  const [onlyFav, setOnlyFav] = useState(false)
  const [adding, setAdding] = useState(false)
  const favs = useMemo(() => new Set(user?.prefs?.favDrugs ?? []), [user?.prefs?.favDrugs])
  const n = normalize(q)
  const list = drugs.filter((d) => (!onlyFav || favs.has(drugKey(d))) && (!n || normalize(`${d.name} ${d.brand ?? ''} ${d.presentation}`).includes(n)))
  const toggle = (key: string) => saveMyProfile({ favDrugs: favs.has(key) ? [...favs].filter((x) => x !== key) : [...favs, key] })
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Mi vademécum</h2><p>Marca con la estrella los que más recetas: salen primero al buscar. Si uno no está, agrégalo para toda la clínica.</p></div>
        <button className="btn btn--primary btn--sm" onClick={() => setAdding(true)}><Plus size={15} />Agregar medicamento</button></div>
      <div className="panel__body" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" style={{ maxWidth: 360 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar medicamento" aria-label="Buscar medicamento" />
          <label className="check-inline"><input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />Sólo mis favoritos ({favs.size})</label>
        </div>
        <ul className="fav-list">
          {list.slice(0, 60).map((d) => {
            const key = drugKey(d)
            return (
              <li key={key}>
                <button type="button" className={`icon-btn fav${favs.has(key) ? ' is-on' : ''}`} aria-pressed={favs.has(key)} aria-label={`${favs.has(key) ? 'Quitar de' : 'Agregar a'} favoritos ${d.name}`} onClick={() => toggle(key)}>
                  <Star size={17} fill={favs.has(key) ? 'currentColor' : 'none'} /></button>
                <span><b>{d.name}</b> <span className="muted">{d.presentation}{d.brand ? ` · ${d.brand}` : ''}</span></span>
                {d.clinicId && <span className="badge">De la clínica</span>}
              </li>
            )
          })}
        </ul>
        {list.length > 60 && <p className="muted" style={{ fontSize: 13.5 }}>Mostrando 60 de {list.length}. Escribe para buscar.</p>}
        {!list.length && <div className="empty">{onlyFav ? 'Todavía no marcas favoritos.' : 'Ningún medicamento coincide.'}</div>}
      </div>
      {adding && <NewDrugModal onClose={() => setAdding(false)} />}
    </section>
  )
}

/** Medicamento nuevo para el vademécum de la clínica (lo mismo que desde la consulta o desde Configuración). */
export function NewDrugModal({ onClose, initialName = '' }: { onClose: () => void; initialName?: string }) {
  const { addClinicDrug } = useStore()
  const [f, setF] = useState({ name: initialName, brand: '', presentation: '', concentration: '', route: 'Oral', usualDose: '', usualUse: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal title="Agregar medicamento" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={f.name.trim().length < 2 || busy} onClick={async () => {
        setBusy(true)
        const r = await addClinicDrug({ name: f.name.trim(), brand: f.brand.trim() || undefined, presentation: f.presentation.trim() || undefined, concentration: f.concentration.trim() || undefined,
          route: f.route, usualDose: f.usualDose.trim() || undefined, usualUse: f.usualUse.trim() || undefined })
        setBusy(false)
        if (r) onClose()
      }}>Agregar</button>
    </>}>
      <div className="form-grid">
        <label className="field span-2"><span>Nombre genérico (obligatorio)</span><input className="input" autoFocus value={f.name} onChange={set('name')} placeholder="Ej. Ademetionina" /></label>
        <label className="field span-2"><span>Nombre comercial</span><input className="input" value={f.brand} onChange={set('brand')} placeholder="Ej. Heptral" /></label>
        <label className="field"><span>Presentación</span><input className="input" value={f.presentation} onChange={set('presentation')} placeholder="Ej. Tabletas" /></label>
        <label className="field"><span>Concentración</span><input className="input" value={f.concentration} onChange={set('concentration')} placeholder="Ej. 400 mg" /></label>
        <label className="field"><span>Vía</span><select className="select" value={f.route} onChange={set('route')}>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="field"><span>Dosis habitual (opcional)</span><input className="input" value={f.usualDose} onChange={set('usualDose')} placeholder="Ej. 1 tableta cada 12 horas" /></label>
        <label className="field span-2"><span>Indicaciones de uso habitual (opcional)</span><input className="input" value={f.usualUse} onChange={set('usualUse')} placeholder="Ej. Colestasis intrahepática" /></label>
      </div>
    </Modal>
  )
}

function SetsPanel() {
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Mis sets de órdenes</h2><p>Órdenes que usas siempre igual, guardadas con un nombre para aplicarlas en un solo paso en la consulta y en las notas.</p></div>
        <Link className="btn btn--primary" to="/app/sets-de-ordenes"><ListChecks size={16} />Abrir mis sets</Link></div>
    </section>
  )
}

function PreferencesPanel() {
  const { user, saveMyProfile } = useStore()
  const [days, setDays] = useState(String(user?.prefs?.rxValidityDays ?? 30))
  if (!user) return null
  const format = user.prefs?.noteFormat ?? 'dx'
  const n = Math.round(Number(days))
  const valid = n >= 1 && n <= 365
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>Preferencias</h2><p>Cómo empiezan tus notas y tus recetas. Las puedes cambiar en cada nota o receta.</p></div></div>
      <div className="panel__body" style={{ display: 'grid', gap: 18 }}>
        <div className="field"><span>Formato de nota de evolución por defecto</span>
          <div className="segmented" role="radiogroup" aria-label="Formato de nota por defecto">
            <button role="radio" aria-checked={format === 'dx'} onClick={() => format !== 'dx' && saveMyProfile({ noteFormat: 'dx' }, 'Formato Estándar por defecto')}>Estándar</button>
            <button role="radio" aria-checked={format === 'soap'} onClick={() => format !== 'soap' && saveMyProfile({ noteFormat: 'soap' }, 'Formato SOAP por defecto')}>SOAP</button>
          </div>
          <small className="muted">Estándar: diagnóstico, examen físico y observaciones. SOAP: subjetivo, objetivo, análisis y plan. Las órdenes van a la derecha en los dos.</small>
        </div>
        <form style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); if (valid) saveMyProfile({ rxValidityDays: n }, 'Vigencia de tus recetas guardada') }}>
          <label className="field"><span>Vigencia de mis recetas (días)</span>
            <input className="input num" style={{ width: 120 }} type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} /></label>
          <button className="btn btn--primary" disabled={!valid || n === (user.prefs?.rxValidityDays ?? 30)}>Guardar</button>
        </form>
      </div>
    </section>
  )
}

function SecurityPanel() {
  const { user, closeOtherSessions } = useStore()
  if (!user) return null
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <PasswordPanel />
        <TwoFactorPanel />
      </div>
      {user.role === 'doctor' && <PinPanel />}
      <section className="panel">
        <div className="panel__head"><div><h2>Sesiones abiertas</h2><p>Si dejaste tu cuenta abierta en otra computadora o teléfono, ciérrala desde aquí. Esta sesión sigue abierta.</p></div>
          <button className="btn btn--ghost" onClick={() => { if (confirm('¿Cerrar tu sesión en todos los demás equipos?')) closeOtherSessions() }}><LogOut size={16} />Cerrar las demás sesiones</button></div>
      </section>
      <section className="panel">
        <div className="panel__head"><h2>Lo que tu {viewsOf(user).length > 1 ? 'vista' : 'rol'} permite</h2></div>
        <div className="panel__body"><div className="chips">{permissionsFor(user.role, user.clinicKind).map((p) => <span key={p} className="chip">{PERMISSIONS[p]}</span>)}</div></div>
      </section>
    </div>
  )
}

/** PIN de 4 a 6 números para confirmar firmas sin escribir la contraseña completa. */
function PinPanel() {
  const { user, setMyPin } = useStore()
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const [open, setOpen] = useState(false)
  const done = async (value: string) => { if (await setMyPin(password, value)) { setPin(''); setPassword(''); setOpen(false) } }
  return (
    <section className="panel">
      <div className="panel__head"><div><h2>PIN para confirmar firmas</h2><p>{user?.hasPin ? 'Tienes un PIN. Al firmar una autorización puedes usarlo en lugar de tu contraseña.' : 'Al firmar una autorización se pide tu contraseña. Con un PIN de 4 a 6 números es más rápido.'}</p></div>
        {!open && <button className="btn btn--ghost" onClick={() => setOpen(true)}>{user?.hasPin ? 'Cambiar o quitar' : 'Crear PIN'}</button>}</div>
      {open && (
        <form className="panel__body form-grid" onSubmit={(e) => { e.preventDefault(); if (/^\d{4,6}$/.test(pin) && password) void done(pin) }}>
          <label className="field"><span>PIN nuevo (4 a 6 números)</span><input className="input num" inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
          <label className="field"><span>Tu contraseña</span><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <div className="span-2" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--primary" disabled={!/^\d{4,6}$/.test(pin) || !password}>Guardar PIN</button>
            {user?.hasPin && <button type="button" className="btn btn--danger" disabled={!password} onClick={() => done('')}>Quitar PIN</button>}
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  )
}

/** Reduce una imagen subida (firma o sello) a un tamaño razonable, en PNG si tiene transparencia o JPEG. */
function shrinkImage(file: File, max: number) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88))
    }
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    img.src = URL.createObjectURL(file)
  })
}
