import { useMemo, useState } from 'react'
import { Plus, Star, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { ExamPicker } from '../components/Exams'
import { useExamCatalog } from '../lib/useExamCatalog'
import { examCatalog, examKey, GROUP_LABEL } from '../lib/exams'
import { normalize } from '../lib/patients'
import type { ExamGroup, ExamInput } from '../lib/types'

/**
 * MC6 + EX1: «Mis exámenes frecuentes». Los favoritos salen primero al ordenar; los perfiles propios agregan varios
 * exámenes de un toque (igual que los sets de órdenes).
 */
export function MyExams() {
  const { user, saveMyProfile, notify } = useStore()
  const { exams: clinicExams, profiles, reload } = useExamCatalog()
  const [q, setQ] = useState('')
  const [making, setMaking] = useState<{ name: string; items: ExamInput[] } | null>(null)
  const [picking, setPicking] = useState(false)
  const favs = useMemo(() => user?.prefs?.favExams ?? [], [user?.prefs?.favExams])
  const isFav = (name: string) => favs.some((f) => examKey(f) === examKey(name))
  const list = examCatalog(clinicExams).filter((e) => !q || normalize(e.name).includes(normalize(q)))
  const toggle = (name: string) => saveMyProfile({ favExams: isFav(name) ? favs.filter((f) => examKey(f) !== examKey(name)) : [...favs, name] })
  const mine = profiles.filter((p) => p.ownerId === user?.id)
  return (<>
    <section className="panel">
      <div className="panel__head"><div><h2>Mis exámenes frecuentes</h2><p>Marca con la estrella los que más pides: salen primero al ordenar exámenes.</p></div></div>
      <div className="panel__body" style={{ display: 'grid', gap: 12 }}>
        <input className="input" style={{ maxWidth: 360 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar examen" aria-label="Buscar examen" />
        {(['lab', 'imaging'] as ExamGroup[]).map((g) => (
          <div key={g}>
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>{GROUP_LABEL[g]}</h3>
            <div className="exam-picker__list">{list.filter((e) => e.group === g).map((e) => (
              <button key={e.name} type="button" className={`exam-pick${isFav(e.name) ? ' is-on' : ''}`} aria-pressed={isFav(e.name)} onClick={() => toggle(e.name)}>
                <Star size={13} fill={isFav(e.name) ? 'currentColor' : 'none'} className="exam-pick__fav" />{e.name}</button>
            ))}</div>
          </div>
        ))}
      </div>
    </section>
    <section className="panel">
      <div className="panel__head"><div><h2>Mis perfiles de exámenes</h2><p>Varios exámenes con un nombre («Control de mi paciente diabético») para pedirlos de un toque.</p></div>
        {!making && <button className="btn btn--primary btn--sm" onClick={() => setMaking({ name: '', items: [] })}><Plus size={15} />Nuevo perfil</button>}</div>
      <div className="panel__body" style={{ display: 'grid', gap: 10 }}>
        {making && (
          <div className="new-svc" style={{ gridTemplateColumns: '1fr' }}>
            <label className="field"><span>Nombre del perfil</span><input className="input" value={making.name} onChange={(e) => setMaking({ ...making, name: e.target.value })} /></label>
            <p style={{ fontSize: 14 }}>{making.items.length ? making.items.map((i) => i.name).join(', ') : 'Sin exámenes todavía.'}</p>
            <div className="new-svc__actions">
              <button className="btn btn--soft btn--sm" onClick={() => setPicking(true)}><Plus size={14} />Elegir exámenes</button>
              <button className="btn btn--primary btn--sm" disabled={making.name.trim().length < 3 || making.items.length < 2} onClick={async () => {
                try { await api('/exams/profiles', { body: { name: making.name.trim(), items: making.items.map(({ group, name }) => ({ group, name })) } }); setMaking(null); reload(); notify('Perfil guardado') } catch (e) { notify((e as Error).message, 'error') }
              }}>Guardar perfil</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setMaking(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {mine.length ? <ul className="fav-list">{mine.map((p) => (
          <li key={p.id}><span><b>{p.name}</b> <span className="muted">{p.items.map((i) => i.name).join(', ')}</span></span>
            <button className="icon-btn" aria-label={`Quitar el perfil ${p.name}`} onClick={async () => { await api(`/exams/profiles/${p.id}`, { method: 'DELETE' }).catch(() => null); reload() }}><Trash2 size={15} /></button></li>
        ))}</ul> : !making && <p className="muted">Todavía no tienes perfiles propios. Los de la clínica y los básicos (Control de diabetes, Preoperatorio…) ya están al ordenar.</p>}
      </div>
      {picking && making && <ExamPicker current={making.items} title="Exámenes del perfil" onClose={() => setPicking(false)} onAdd={(l) => { setMaking({ ...making, items: [...making.items, ...l] }); setPicking(false) }} />}
    </section>
  </>)
}
