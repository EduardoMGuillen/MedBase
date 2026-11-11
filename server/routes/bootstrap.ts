import type { Express } from 'express'
import { type Ctx, localDate, type Row } from '../http.js'
import { clinicSettings, toAppointment, toAudit, toBed, toClinicDrug, toFollowup, toHospitalization, toPatient, toPrescription, toService, toStaff, toVitals } from '../mappers.js'
import { ORDERS_PENDING_SQL, pendingOrders } from './inpatient.js'
import { sweepFollowupReminders } from './followups.js'
import { can } from '../../src/lib/permissions.js'

/** Datos iniciales de la sesión según el rol (lo que la interfaz carga al entrar y en cada sincronización). */
export function registerBootstrap(app: Express, ctx: Ctx) {
  const { sql, auth, userOf, settings } = ctx
  // ---------- Datos iniciales según el rol ----------
  app.get('/api/bootstrap', auth, async (req, res) => {
    const user = userOf(req)
    // La administración de la plataforma no carga datos de ninguna clínica
    if (!user.clinicId) {
      return res.json({ staff: [], patients: [], appointments: [], prescriptions: [], audit: [], vitals: [], services: [], beds: [], inpatients: [], followups: [], discharges: [], clinicDrugs: [], pendingOrders: [], stays: [], bedStays: [],
        settings: { ...clinicSettings({ name: 'Clinara' }) } })
    }
    const cid = user.clinicId
    const clinical = can(user, 'chart.view')
    const billing = can(user, 'billing.manage')
    const since = new Date(); since.setDate(since.getDate() - 90)
    const none = Promise.resolve([] as Row[])
    if (can(user, 'followups.view')) await sweepFollowupReminders(sql, cid)
    const [staff, patients, appts, prescriptions, auditLog, vitals, services, cfg, beds, inpatients, followups, discharges, clinicDrugs, pending, stays, bedStays] = await Promise.all([
      sql.query('SELECT * FROM staff WHERE clinic_id = ? ORDER BY name', [cid]),
      // Los pendientes de registro sí viajan (agenda y 'Por llegar'); los que se unieron a otro expediente no
      sql.query('SELECT * FROM patients WHERE clinic_id = ? AND merged_into IS NULL ORDER BY last_name', [cid]),
      // Ventana de agenda: 90 días atrás y todo lo futuro
      sql.query(`SELECT a.*, EXISTS(SELECT 1 FROM payments p WHERE p.appointment_id = a.id AND NOT p.voided) AS paid
        FROM appointments a WHERE a.clinic_id = ? AND a.start >= ? ORDER BY a.start`, [cid, localDate(since)]),
      can(user, 'rx.view') ? sql.query('SELECT * FROM prescriptions WHERE clinic_id = ? ORDER BY issued_at DESC LIMIT 500', [cid]) : Promise.resolve([]),
      can(user, 'audit.view') ? sql.query('SELECT * FROM audit WHERE clinic_id = ? ORDER BY id DESC LIMIT 500', [cid]) : Promise.resolve([]),
      clinical ? sql.query(`SELECT v.* FROM vitals v JOIN appointments a ON a.id = v.appointment_id WHERE v.clinic_id = ? AND a.start LIKE ?`, [cid, `${localDate(new Date())}%`]) : Promise.resolve([]),
      sql.query('SELECT * FROM services WHERE clinic_id = ? ORDER BY name', [cid]),
      settings(cid),
      // AD3: todos los roles ven el estado de las camas (libre u ocupada); sólo administración las edita
      sql.query('SELECT * FROM beds WHERE clinic_id = ? ORDER BY room, label', [cid]),
      // Con aviso de la autorización de hospitalización pendiente de firma, para enfermería y el médico
      // HO2 (ronda 16): y si es un ingreso directo sin nota de ingreso firmada («Sin órdenes de ingreso»)
      can(user, 'inpatient.view') ? sql.query(`SELECT h.*, EXISTS(SELECT 1 FROM authorizations a WHERE a.hospitalization_id = h.id AND a.template = 'hospital' AND a.status = 'pending') AS auth_pending,
        ${ORDERS_PENDING_SQL} AS orders_pending
        FROM hospitalizations h WHERE h.clinic_id = ? AND h.status = 'active' ORDER BY h.admitted_at`, [cid]) : none,
      can(user, 'followups.view') ? sql.query('SELECT * FROM followups WHERE clinic_id = ? AND active ORDER BY due_date', [cid]) : none,
      sql.query(`SELECT DISTINCT ON (patient_id) patient_id, discharged_at FROM hospitalizations
        WHERE clinic_id = ? AND status = 'discharged' AND discharged_at IS NOT NULL ORDER BY patient_id, discharged_at DESC`, [cid]),
      can(user, 'rx.write') || can(user, 'drugs.manage') ? sql.query('SELECT * FROM clinic_drugs WHERE clinic_id = ? ORDER BY name', [cid]) : none,
      can(user, 'orders.review') ? pendingOrders(sql, cid) : Promise.resolve([]),
      // Estado del paciente (hospitalizado o en observación) para todos los roles, sin datos clínicos
      // CX2 (ronda 8): también dónde está y desde cuándo, para el aviso de la consulta externa y la agenda
      sql.query(`SELECT h.id, h.patient_id, h.kind, h.admitted_at, h.observation_at, b.room, b.label FROM hospitalizations h LEFT JOIN beds b ON b.id = h.bed_id
        WHERE h.clinic_id = ? AND h.status = 'active'`, [cid]),
      // AD3: estado de cada cama (quién la ocupa y la especialidad del ingreso), sin datos clínicos, para todos los roles
      // HO2 (ronda 16): con el médico tratante (recepción y administración ven el tablero de camas para ingresar)
      sql.query(`SELECT id, bed_id, patient_id, specialty, attending_ids, admitted_by FROM hospitalizations WHERE clinic_id = ? AND status = 'active' AND bed_id IS NOT NULL AND kind = 'hospital'`, [cid]),
    ])
    res.json({
      staff: staff.map(toStaff),
      patients: patients.map((r) => toPatient(r, clinical)),
      appointments: appts.map((r) => ({ ...toAppointment(r), paid: billing ? Boolean(r.paid) : undefined })),
      prescriptions: prescriptions.map(toPrescription),
      audit: auditLog.map(toAudit),
      vitals: vitals.map(toVitals),
      services: services.map(toService),
      settings: cfg,
      beds: beds.map(toBed),
      inpatients: inpatients.map(toHospitalization),
      followups: followups.map(toFollowup),
      discharges: discharges.map((r) => ({ patientId: String(r.patient_id), at: String(r.discharged_at) })),
      clinicDrugs: clinicDrugs.map(toClinicDrug),
      pendingOrders: pending,
      stays: stays.map((r) => ({ id: String(r.id), patientId: String(r.patient_id), kind: String(r.kind), since: String(r.observation_at ?? r.admitted_at),
        room: r.room ? `${r.room}${r.label ? `-${r.label}` : ''}` : undefined })),
      bedStays: bedStays.map((r) => ({ id: String(r.id), bedId: String(r.bed_id), patientId: String(r.patient_id), specialty: r.specialty ? String(r.specialty) : undefined,
        attendingIds: toHospitalization(r).attendingIds ?? [] })),
    })
  })
}
