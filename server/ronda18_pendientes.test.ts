import './tz.js'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileAlerts } from '../src/lib/alerts.js'
import { isMine, ownersText, PENDING_TYPES, splitPendings, type PendingViewer } from '../src/lib/pendings.js'
import { pendingOrdersOf } from '../src/lib/inpatient.js'
import type { Authorization, ExamOrder, Hospitalization, InpatientNote } from '../src/lib/types.js'

// PD1 (ronda 18): cada pendiente tiene responsable y cada quien cuenta solo lo suyo
const now = new Date('2026-11-12T15:00:00.000Z')
const stay = { id: 'h1', patientId: 'p1', status: 'active', kind: 'hospital', bedId: 'b1', admittedAt: '2026-11-12T14:00:00.000Z', admittedBy: 'd-tratante', attendingIds: ['d-tratante'], consultationId: 'c1', diagnoses: [], reason: '' } as unknown as Hospitalization
const auth = (x: Partial<Authorization>): Authorization => ({ id: 'a1', hospitalizationId: 'h1', patientId: 'p1', template: 'surgical', status: 'pending', createdBy: 'd-tratante', createdAt: '2026-11-12T14:10:00.000Z',
  data: { procedure: 'Apendicectomía' } as Authorization['data'], ...x })
const exam = (x: Partial<ExamOrder>): ExamOrder => ({ id: 'e1', patientId: 'p1', group: 'lab', name: 'Hemograma', status: 'result', priority: 'routine', place: 'clinic', area: 'lab', orderedBy: 'd-pidio', orderedAt: '2026-11-12T14:05:00.000Z',
  batchId: 'b', result: { at: '2026-11-12T14:40:00.000Z', by: 'lab1' }, ...x } as ExamOrder)
const file = (x: { authorizations?: Authorization[]; exams?: ExamOrder[]; notes?: InpatientNote[] }) => ({ hospitalization: stay, notes: x.notes ?? [], marks: [], meds: [], doses: [], vitals: [], consultOrders: [], authorizations: x.authorizations ?? [], exams: x.exams ?? [] })
const band = { low: 36, high: 37.5 }
const alerts = (x: Parameters<typeof file>[0]) => fileAlerts(file(x) as Parameters<typeof fileAlerts>[0], band, now).filter((a) => a.type !== 'vitals-due')
const nurse: PendingViewer = { id: 'n1', role: 'nurse', position: 'nurse_aux' }
const attending: PendingViewer = { id: 'd-tratante', role: 'doctor' }
const otherDoctor: PendingViewer = { id: 'd-otro', role: 'doctor' }
const keys = (l: { type: string }[]) => l.map((a) => a.type).sort()

describe('PD1 (ronda 18): responsables', () => {
  test('la tabla cubre todos los tipos y cada uno tiene responsable', () => {
    for (const [k, t] of Object.entries(PENDING_TYPES)) assert.ok(t.owners.length > 0 && t.label && t.many(2), k)
  })

  test('autorización sin firmar: la firma del paciente es compartida (enfermería y tratante); la del médico, solo del médico', () => {
    const all = alerts({ authorizations: [auth({})] })
    assert.deepEqual(keys(all), ['sign-doctor', 'sign-patient'])
    assert.ok(all.every((a) => /falta la firma/.test(a.text)), 'cada pendiente dice qué firma falta')
    assert.deepEqual(keys(splitPendings(all, nurse).mine), ['sign-patient'])
    assert.deepEqual(keys(splitPendings(all, nurse).others), ['sign-doctor'])
    assert.deepEqual(keys(splitPendings(all, attending).mine), ['sign-doctor', 'sign-patient'])
    assert.equal(splitPendings(all, otherDoctor).mine.length, 0, 'a otro médico le sale en «Pendientes de otros»')
    assert.equal(splitPendings(all, otherDoctor).others.length, 2)
  })

  test('enfermería recoge la firma del paciente: ese pendiente se cierra para todos; al médico le sigue faltando firmar', () => {
    const all = alerts({ authorizations: [auth({ signing: { action: 'accept', signer: 'patient' } as Authorization['signing'] })] })
    assert.deepEqual(keys(all), ['sign-doctor'])
    assert.equal(splitPendings(all, nurse).mine.length, 0)
    assert.equal(splitPendings(all, nurse).others[0].other, 'firmar la autorización quirúrgica')
    assert.equal(ownersText(all[0]), 'Médico')
    assert.deepEqual(keys(splitPendings(all, attending).mine), ['sign-doctor'])
  })

  test('resultado listo: del médico que lo pidió y del tratante; para enfermería es «Médico: revisar…»', () => {
    const all = alerts({ exams: [exam({})] })
    assert.deepEqual(keys(all), ['result-review'])
    assert.ok(isMine(all[0], attending)); assert.ok(isMine(all[0], { id: 'd-pidio', role: 'doctor' }))
    assert.ok(!isMine(all[0], otherDoctor)); assert.ok(!isMine(all[0], nurse))
    assert.equal(`${ownersText(all[0])}: ${all[0].other}`, 'Médico: revisar 1 resultado de Hemograma')
  })

  test('toma de muestra: compartida entre laboratorio y enfermería; sin laboratorio en la clínica, solo enfermería; imagen, del técnico o del radiólogo', () => {
    const lab = alerts({ exams: [exam({ status: 'ordered', result: undefined })] })[0]
    assert.deepEqual(lab.owners, ['lab', 'nursing'])
    assert.ok(isMine(lab, nurse)); assert.ok(isMine(lab, { id: 'l', role: 'lab' })); assert.ok(!isMine(lab, attending))
    assert.deepEqual(alerts({ exams: [exam({ status: 'ordered', result: undefined, area: 'nursing' })] })[0].owners, ['nursing'])
    const img = alerts({ exams: [exam({ group: 'imaging', area: 'imaging', name: 'Rayos X', status: 'ordered', result: undefined })] })[0]
    assert.ok(isMine(img, { id: 't', role: 'imaging', position: 'imaging_tech' })); assert.ok(!isMine(img, { id: 'r', role: 'imaging', position: 'radiologist' })); assert.ok(!isMine(img, nurse))
  })

  test('Laboratorio e Imágenes ven solo lo suyo, sin «Pendientes de otros» (DP11)', () => {
    const all = alerts({ authorizations: [auth({})], exams: [exam({ status: 'ordered', result: undefined })] })
    const s = splitPendings(all, { id: 'l', role: 'lab' })
    assert.deepEqual(keys(s.mine), ['sample-pending']); assert.equal(s.others.length, 0)
  })

  test('Consultorio: sin enfermera, la titular cuenta todo como suyo; con enfermera activa, lo de enfermería pasa a «Pendientes de otros»', () => {
    const vitals = { type: 'vitals-due', owners: PENDING_TYPES['vitals-due'].owners }
    assert.ok(isMine(vitals, { id: 'x', role: 'doctor', office: true, hasNurse: false }))
    assert.ok(!isMine(vitals, { id: 'x', role: 'doctor', office: true, hasNurse: true }))
    assert.ok(isMine(vitals, { id: 'a', role: 'assistant', office: true, hasNurse: true }))
    assert.ok(isMine({ owners: ['doctor'], doctorIds: ['otra'] }, { id: 'x', role: 'doctor', office: true }), 'en el consultorio solo hay una médica')
    assert.ok(!isMine(vitals, attending), 'en una clínica, lo de enfermería no es del médico')
  })
})

describe('Auditoría (nov. 2026), punto 3: solo cuentan las órdenes nuevas, cambiadas u omitidas', () => {
  const note = (lines: InpatientNote['lines']): InpatientNote => ({ id: 'n1', hospitalizationId: 'h1', kind: 'evolution', authorId: 'd-tratante', at: '2026-11-12T14:30:00.000Z', checklist: true,
    orders: lines!.map((l) => l.text), lines } as InpatientNote)
  const line = (text: string, tag: 'continue' | 'new' | 'modified' | 'omitted') => ({ id: text, kind: 'ind' as const, text, tag })
  test('una indicación nueva entre cinco que continúan cuenta 1; una omitida cuenta 1; sin cambios, 0', () => {
    const cont = ['a', 'b', 'c', 'd', 'e'].map((x) => line(x, 'continue'))
    assert.equal(pendingOrdersOf({ notes: [note([...cont, line('Nueva', 'new')])], marks: [] }).length, 1)
    assert.equal(pendingOrdersOf({ notes: [note([...cont, line('OMITIR x', 'omitted')])], marks: [] }).length, 1)
    assert.equal(pendingOrdersOf({ notes: [note(cont)], marks: [] }).length, 0)
    assert.equal(pendingOrdersOf({ notes: [note([line('Cambiada', 'modified')])], marks: [{ noteId: 'n1', index: 0, action: 'check', by: 'n', at: '2026-11-12T14:40:00.000Z' }] as never }).length, 0)
  })
  test('la orden nueva sin revisar es de enfermería: al médico que la dio no le cuenta', () => {
    const all = fileAlerts(file({ notes: [note([line('Nueva', 'new')])] }) as Parameters<typeof fileAlerts>[0], band, now).filter((a) => a.type === 'orders-review')
    assert.equal(all.length, 1)
    assert.ok(isMine(all[0], nurse)); assert.ok(!isMine(all[0], attending))
    assert.equal(`${ownersText(all[0])}: ${all[0].other}`, 'Enfermería: revisar orden nueva (1)')
  })
})
