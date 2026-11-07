import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { api } from '../lib/api'
import { Modal } from './ui'
import { dateTime, shortStaff } from '../lib/format'
import { examLine, GROUP_LABEL, isPending } from '../lib/exams'
import type { ExamGroup, ExamOrder } from '../lib/types'

/**
 * EX5 (ronda 10) y EX11 (ronda 14): la ventana «Imprimir orden» con una casilla por examen. La misma en la pestaña Exámenes
 * (los pendientes de una sección) y en la tarjeta de la nota («Órdenes de exámenes», con los exámenes de esa nota).
 *  - Vienen marcados los «Externo»; los de la clínica y los que ya tienen resultado, sin marcar. Los cancelados no salen.
 *  - Con laboratorio e imagen, dos secciones; se genera un documento por tipo y uno por médico que los pidió (EX5).
 *  - Sale con los datos del médico que los pidió y sin su firma y sello en papel no vale. Cada impresión queda en «Órdenes
 *    impresas» y cuenta para GE4.
 */
export function ExamPrintModal({ exams, onClose, title }: { exams: ExamOrder[]; onClose: () => void; title?: string }) {
  const { notify, staffById } = useStore()
  const nav = useNavigate()
  const list = exams.filter((e) => e.status !== 'cancelled')
  const groups = (['lab', 'imaging'] as ExamGroup[]).filter((g) => list.some((e) => e.group === g))
  const [picked, setPicked] = useState<string[]>(() => list.filter((e) => e.place === 'external' && isPending(e)).map((e) => e.id))
  const [busy, setBusy] = useState(false)
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  const all = picked.length === list.length
  const go = async (how: 'imprimir' | 'pdf') => {
    setBusy(true)
    try {
      const { id } = await api<{ id: string }>('/print-jobs', { body: { kind: 'exams', examIds: picked } })
      nav(`/app/impresion/${id}?accion=${how}`)
    } catch (x) { notify((x as Error).message, 'error'); setBusy(false) }
  }
  const doctors = new Set(list.filter((e) => picked.includes(e.id)).map((e) => e.orderedBy)).size
  const heading = title ?? (groups.length === 1 ? `Imprimir orden de ${GROUP_LABEL[groups[0]].toLowerCase()}` : 'Imprimir órdenes de exámenes')
  return (
    <Modal title={heading} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn--soft" disabled={!picked.length || busy} onClick={() => go('pdf')}><Download size={15} />Descargar PDF</button>
      <button className="btn btn--primary" disabled={!picked.length || busy} onClick={() => go('imprimir')}><Printer size={15} />Imprimir</button>
    </>}>
      <p className="muted" style={{ fontSize: 14, margin: 0 }}>Los externos ya van marcados. Sale con los datos del médico que los pidió y sin su firma y sello en papel no vale.</p>
      {list.length > 1 && <button type="button" className="btn btn--ghost btn--sm self-start" onClick={() => setPicked(all ? [] : list.map((e) => e.id))}>{all ? 'Desmarcar todos' : 'Marcar todos'}</button>}
      {groups.map((g) => (
        <div key={g} className="print-pick">
          {groups.length > 1 && <h4 className="print-pick__title">{GROUP_LABEL[g]}</h4>}
          {list.filter((e) => e.group === g).map((e) => (
            <label key={e.id} className={`exam-row-pick${picked.includes(e.id) ? ' is-on' : ''}`}>
              <input type="checkbox" checked={picked.includes(e.id)} onChange={() => toggle(e.id)} />
              <span><b>{examLine(e)}</b>{e.place === 'external' && <span className="badge" style={{ marginLeft: 6 }}>Externo</span>}{e.priority === 'urgent' && <span className="badge badge--red" style={{ marginLeft: 6 }}>Urgente</span>}
                {!isPending(e) && <span className="badge badge--mint" style={{ marginLeft: 6 }}>Con resultado</span>}
                <small className="muted" style={{ display: 'block' }}>Pedido {dateTime(e.orderedAt)} por {shortStaff(staffById(e.orderedBy)?.name)}</small></span>
            </label>
          ))}
        </div>
      ))}
      {groups.length > 1 && <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>Sale una orden de laboratorio y otra de imagen y gabinete.</p>}
      {doctors > 1 && <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>Los pidieron {doctors} médicos: sale una orden por cada uno.</p>}
    </Modal>
  )
}

/** EX11 (ronda 14): ¿puede esta persona usar la ventana? Quien ordena o procesa exámenes y ve el expediente (Recepción no). */
export const canPrintExamOrders = (can: (p: 'chart.view' | 'exams.order' | 'exams.process') => boolean) => can('chart.view') && (can('exams.order') || can('exams.process'))
