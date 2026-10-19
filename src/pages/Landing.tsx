import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Minus, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Logo } from '../components/Logo'
import { CLINIC_PERMISSIONS, PERMISSIONS, ROLE_LABEL, ROLE_PERMISSIONS, ROLE_SUMMARY } from '../lib/permissions'
import type { Role } from '../lib/types'

const BEATS = [
  { x: 0.13, peak: 46, time: '08:30', name: 'Carlos Banegas', status: 'Atendida', tone: 'done' },
  { x: 0.36, peak: 30, time: '09:30', name: 'María José Castillo', status: 'Lista para consulta', tone: 'mint' },
  { x: 0.6, peak: 52, time: '10:00', name: 'Héctor Mondragón', status: 'En sala', tone: 'amber' },
  { x: 0.84, peak: 40, time: '11:00', name: 'Fernando Alvarado', status: 'Confirmada', tone: 'ink' },
]
const W = 1200
const BASE = 210

/** Construye un trazo de ECG cuyos complejos QRS caen sobre cada cita del día. */
function tracePath() {
  let d = `M0 ${BASE}`
  for (const b of BEATS) {
    const x = b.x * W
    d += ` L${x - 70} ${BASE} Q${x - 55} ${BASE - 16} ${x - 40} ${BASE}` // onda P
    d += ` L${x - 14} ${BASE} L${x - 8} ${BASE + 14} L${x} ${b.peak} L${x + 9} ${BASE + 30} L${x + 16} ${BASE}` // QRS
    d += ` L${x + 34} ${BASE} Q${x + 58} ${BASE - 26} ${x + 82} ${BASE}` // onda T
  }
  return d + ` L${W} ${BASE}`
}

const JOURNEY = [
  { t: 'Agenda', d: 'El paciente reserva en línea o por teléfono, y recibe un recordatorio por WhatsApp un día antes.', who: 'Paciente y recepción' },
  { t: 'Llegada', d: 'Un toque registra la llegada y el paciente pasa a la sala de espera con tiempo visible.', who: 'Recepción' },
  { t: 'Triaje', d: 'Signos vitales con alertas de rango. El médico los ve antes de llamar al paciente.', who: 'Enfermería' },
  { t: 'Consulta', d: 'Nota en formato SOAP, síntomas en un toque y diagnóstico con código CIE-10.', who: 'Médico' },
  { t: 'Receta y cobro', d: 'Receta con folio y cruce contra alergias. Recepción cobra y entrega el recibo.', who: 'Médico y recepción' },
]

const ROLES: Role[] = ['doctor', 'nurse', 'reception', 'admin']
const ALL_PERMS = CLINIC_PERMISSIONS

export default function Landing() {
  const [role, setRole] = useState<Role>('doctor')
  const granted = ROLE_PERMISSIONS[role]

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap">
          <Link to="/" aria-label="Clinara, inicio"><Logo /></Link>
          <nav aria-label="Secciones">
            <a href="#recorrido">Cómo funciona</a>
            <a href="#roles">Roles</a>
            <a href="#modulos">Módulos</a>
            <a href="#planes">Planes</a>
            <Link to="/reservar">Reservar cita</Link>
          </nav>
          <Link className="btn btn--ghost" to="/login">Iniciar sesión</Link>
          <Link className="btn btn--primary" to="/login">Probar la demo</Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="lp-wrap hero__grid">
            <h1>Cada paciente del día, en un solo pulso.</h1>
            <div>
              <p className="hero__lede">
                Clinara reúne la agenda, el triaje, la consulta y la receta de tu clínica en un mismo expediente.
                Cada persona del equipo ve exactamente lo que necesita para atender.
              </p>
              <div className="hero__cta">
                <Link className="btn btn--primary btn--lg" to="/login">Probar la demo</Link>
                <Link className="btn btn--ghost btn--lg" to="/reservar">Reservar una cita</Link>
              </div>
              <p className="hero__note">Demo con datos ficticios. No necesitas tarjeta.</p>
            </div>
          </div>

          <div className="lp-wrap">
            <div className="pulse" role="img" aria-label="Línea de pulso con las citas de la mañana: 08:30 atendida, 09:30 lista para consulta, 10:00 en sala, 11:00 confirmada">
              <div className="pulse__grid" />
              <svg viewBox={`0 0 ${W} 260`} preserveAspectRatio="none" aria-hidden="true">
                <path className="pulse__trace" d={tracePath()} vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="pulse__now" style={{ left: '50%' }}><span>Ahora</span></div>
              {BEATS.map((b, i) => (
                <div key={b.time} className={`pulse__beat ${i > 1 ? 'pulse__beat--extra' : ''}`} style={{ left: `${b.x * 100}%`, top: `${(b.peak / 260) * 100}%`, animationDelay: `${0.5 + i * 0.6}s` }}>
                  <div className="beat">
                    <b>{b.time}</b>
                    <p>{b.name}</p>
                    <span className={`badge badge--${b.tone}`}>{b.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="recorrido">
          <div className="lp-wrap">
            <div className="lp-intro">
              <h2 className="lp-h2">De la sala de espera a la receta firmada.</h2>
              <p>
                El estado de cada cita avanza a medida que el paciente recorre la clínica. Recepción, enfermería y
                el médico trabajan sobre el mismo registro, sin llamadas de pasillo ni papeles sueltos.
              </p>
            </div>
            <ol className="journey">
              {JOURNEY.map((j, i) => (
                <li key={j.t}>
                  <span className="journey__n">{i + 1}</span>
                  <h3>{j.t}</h3>
                  <p>{j.d}</p>
                  <div className="journey__who">{j.who}</div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-section--ward" id="roles">
          <div className="lp-wrap">
            <div className="lp-intro">
              <h2 className="lp-h2">Cada rol ve sólo lo que le toca.</h2>
              <p>
                Los permisos siguen el principio de mínimo privilegio. Recepción agenda sin leer notas clínicas;
                sólo el médico firma diagnósticos y recetas. Cada acceso queda en la bitácora.
              </p>
            </div>
            <div className="roles">
              <div className="roles__tabs" role="tablist" aria-label="Roles">
                {ROLES.map((r) => (
                  <button key={r} role="tab" aria-selected={role === r} className="roles__tab" onClick={() => setRole(r)}>
                    <strong>{ROLE_LABEL[r]}</strong>
                    <span>{ROLE_SUMMARY[r]}</span>
                  </button>
                ))}
              </div>
              <div className="roles__body" role="tabpanel">
                <div className="perm-list">
                  {ALL_PERMS.map((p) => {
                    const ok = granted.includes(p)
                    return (
                      <div key={p} className={`perm ${ok ? '' : 'perm--no'}`}>
                        {ok ? <Check size={18} color="var(--mint-ink)" aria-label="Permitido" /> : <Minus size={18} aria-label="Sin acceso" />}
                        <span>{PERMISSIONS[p]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="modulos">
          <div className="lp-wrap">
            <div className="lp-intro">
              <h2 className="lp-h2">Lo que tu clínica usa todos los días.</h2>
              <p>Sin módulos de relleno. Agenda, expediente y receta, hechos para que una consulta de 20 minutos se documente en 3.</p>
            </div>
            <div className="mods">
              <article className="mod mod--wide">
                <h3>Expediente clínico único</h3>
                <p>Antecedentes, alergias, signos vitales, consultas y recetas en una línea de tiempo. Las alergias aparecen arriba, siempre.</p>
                <div className="mod__demo allergy-demo">
                  <div className="allergy-demo__alert"><TriangleAlert size={18} /> María José Castillo es alérgica a Penicilina. Amoxicilina pertenece a ese grupo.</div>
                  <div className="chips"><span className="chip">Hipertensión arterial</span><span className="chip">O+</span><span className="chip">Seguros Atlántida</span></div>
                </div>
              </article>
              <article className="mod mod--narrow mod--ink">
                <h3>Recetas con folio</h3>
                <p>Firmadas por el médico, con dosis, frecuencia y duración.</p>
                <div className="mod__demo rx-mini">
                  <b>Receta RX-2026-1101</b>
                  <span>Paracetamol 500 mg — 1 tableta cada 8 horas por 5 días</span>
                  <span className="rx-mini__sig">L. Herrera</span>
                </div>
              </article>
              <article className="mod mod--half">
                <h3>Reserva en línea y recordatorios</h3>
                <p>Tus pacientes eligen médico, día y hora sin llamar. Recepción envía el recordatorio por WhatsApp con un toque.</p>
              </article>
              <article className="mod mod--half">
                <h3>Agenda por consultorio</h3>
                <p>Vista por médico con estados en color, citas urgentes resaltadas, choques de horario detectados y la línea de la hora actual.</p>
              </article>
              <article className="mod mod--narrow">
                <h3>Caja y recibos</h3>
                <p>Cobro por servicio, descuentos, varias formas de pago y cierre de caja del día.</p>
              </article>
              <article className="mod mod--narrow">
                <h3>Reportes</h3>
                <p>Ingresos, asistencia y diagnósticos frecuentes, exportables a Excel.</p>
              </article>
              <article className="mod mod--narrow">
                <h3>Archivos y constancias</h3>
                <p>Laboratorios e imágenes en el expediente, y constancias médicas con reposo listas para imprimir.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section lp-section--ward">
          <div className="lp-wrap">
            <div className="trust">
              <div><ShieldCheck size={22} color="var(--ink)" /><h3 style={{ marginTop: 12 }}>Bitácora de accesos</h3><p>Quién abrió qué expediente y cuándo, con registro inalterable.</p></div>
              <div><h3>Cifrado en reposo y tránsito</h3><p>TLS 1.3 y cifrado de base de datos. Respaldo diario con retención de 30 días.</p></div>
              <div><h3>Doble factor</h3><p>Obligatorio para médicos y administración. Sesiones que expiran por inactividad.</p></div>
              <div><h3>Datos de la clínica</h3><p>Cada clínica tiene su espacio aislado. Exporta tu información cuando quieras.</p></div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="planes">
          <div className="lp-wrap">
            <div className="lp-intro">
              <h2 className="lp-h2">Precio por médico, no por paciente.</h2>
              <p>Enfermería, recepción y administración no cuentan como usuarios de pago.</p>
            </div>
            <div className="plans">
              {[
                { n: 'Consultorio', p: 29, d: 'Un médico con su asistente.', f: ['Agenda y reserva en línea', 'Expediente, recetas y constancias', 'Hasta 2 usuarios de apoyo'] },
                { n: 'Clínica', p: 24, d: 'De 2 a 15 médicos con equipo completo.', f: ['Todo lo de Consultorio', 'Triaje y sala de espera', 'Caja, recibos y reportes', 'Roles, bitácora y verificación en dos pasos'], featured: true },
                { n: 'Red', p: null, d: 'Varias sedes bajo una misma administración.', f: ['Todo lo de Clínica', 'Expediente compartido entre sedes', 'Integraciones a medida'] },
              ].map((pl) => (
                <div key={pl.n} className={`plan ${pl.featured ? 'plan--featured' : ''}`}>
                  <h3>{pl.n}</h3>
                  <div className="plan__price">{pl.p ? <>${pl.p} <small>por médico al mes</small></> : 'A medida'}</div>
                  <p className="plan__desc">{pl.d}</p>
                  <ul>{pl.f.map((f) => <li key={f}><Check size={16} color={pl.featured ? 'var(--mint-strong)' : 'var(--ink)'} />{f}</li>)}</ul>
                  <Link className={`btn ${pl.featured ? 'btn--primary' : 'btn--ghost'}`} to="/login" style={pl.featured ? undefined : {}}>
                    {pl.p ? 'Probar la demo' : 'Hablar con ventas'}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" style={{ paddingTop: 0 }}>
          <div className="lp-wrap">
            <div className="cta-band">
              <div>
                <h2>Entra como médico, enfermería o recepción.</h2>
                <p>La demo trae una clínica completa con la agenda de hoy.</p>
              </div>
              <Link className="btn btn--primary btn--lg" to="/login">Abrir la demo</Link>
              <svg className="cta-band__trace" width="640" height="160" viewBox="0 0 640 160" aria-hidden="true">
                <path d="M0 120 H220 L240 130 L262 20 L284 150 L300 120 H360 Q390 90 420 120 H640" fill="none" stroke="#fff" strokeWidth="3" />
              </svg>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <Logo size={24} />
          <span>Clinara es un nombre temporal. Proyecto en etapa de prototipo.</span>
        </div>
      </footer>
    </div>
  )
}
