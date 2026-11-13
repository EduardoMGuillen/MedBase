import { useMemo, useState } from 'react'
import { Combo } from '../../components/Combo'
import { Download, Plus, Upload } from 'lucide-react'
import { useStore } from '../../lib/store'
import { SectionHead } from '../../components/ui'
import { DrugForm } from '../../components/DrugForm'
import { DRUG_ORIGIN, drugProvider } from '../../lib/drugProvider'
import { routeWords } from '../../lib/lnme/route'
import { Pagination, paginate, usePage } from '../../components/Pagination'
import { normalize } from '../../lib/patients'
import { download, parseCsv, toCsv } from '../../lib/csv'
import type { ClinicDrug } from '../../lib/types'

// Configuración: vademécum propio de la clínica (alta, edición e importación).
export const IMPORT_COLUMNS = ['nombre_generico', 'nombre_comercial', 'presentacion', 'concentracion', 'via', 'dosis_habitual', 'indicaciones'] as const
export const IMPORT_FIELDS: Record<(typeof IMPORT_COLUMNS)[number], string> = {
  nombre_generico: 'name', nombre_comercial: 'brand', presentacion: 'presentation', concentracion: 'concentration', via: 'route', dosis_habitual: 'usualDose', indicaciones: 'usualUse',
}

/**
 * AD4: el vademécum completo de la clínica (el catálogo base y lo que agregó la clínica), con buscador. Lo agregado se
 * edita (quien lo agregó o administración) y se desactiva; el catálogo base no se edita. Se puede importar una lista.
 */
export function ClinicDrugs() {
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
          <Combo value={via} onChange={setVia} label="Filtrar por vía" options={[{ value: '', label: 'Todas' }, ...routeOptions.map((r) => ({ value: r, label: r }))]} /></label>
      </div>
      {result && (
        <div className={`alert-strip ${result.added ? 'alert-strip--calm' : 'alert-strip--amber'}`} style={{ margin: '12px 22px 0', flexDirection: 'column', alignItems: 'stretch' }}>
          <span>Se importaron {result.added} medicamento(s).{result.skipped.length ? ` ${result.skipped.length} fila(s) no se importaron:` : ''}</span>
          {result.skipped.length > 0 && <ul className="note__list m-0 fw-normal">{result.skipped.slice(0, 8).map((x) => <li key={x.row}>Fila {x.row}{x.name ? ` (${x.name})` : ''}: {x.reason}</li>)}</ul>}
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
              <td className="tc-full"><b>{r.name}</b>{r.use && <small className="c-muted block">{r.use}</small>}</td>
              <td data-label="Comercial">{r.brand ?? '—'}</td>
              <td data-label="Presentación">{r.presentation || '—'}</td>
              <td data-label="Vía">{r.route || '—'}</td>
              <td data-label="Origen" className="muted">{DRUG_ORIGIN}</td>
              <td className="tc-actions ta-r">{r.drug && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(r.drug!)}>{canEdit(r.drug) ? 'Editar' : 'Ver'}</button>}</td>
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
