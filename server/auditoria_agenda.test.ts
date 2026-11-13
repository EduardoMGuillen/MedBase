import './tz.js'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { gridHours } from '../src/lib/schedule.js'

// Auditoría (nov. 2026), punto 4: la cuadrícula de la agenda se alarga hasta la primera y la última cita visibles
describe('Auditoría, punto 4: horario de la cuadrícula de la agenda', () => {
  test('sin citas fuera del horario, la cuadrícula va de 07:00 a 19:00', () => {
    assert.deepEqual(gridHours([]), { from: 7, to: 19 })
    assert.deepEqual(gridHours(['2026-11-12T07:00:00', '2026-11-12T18:30:00']), { from: 7, to: 19 })
  })

  test('con una cita a las 05:35 empieza a las 05:00', () => {
    assert.deepEqual(gridHours(['2026-11-12T05:35:00', '2026-11-12T09:00:00']), { from: 5, to: 19 })
  })

  test('con una cita tarde termina después de su bloque de 30 minutos, sin pasar de medianoche', () => {
    assert.deepEqual(gridHours(['2026-11-12T19:00:00']), { from: 7, to: 20 })
    assert.deepEqual(gridHours(['2026-11-12T18:45:00']), { from: 7, to: 20 })
    assert.deepEqual(gridHours(['2026-11-12T20:40:00']), { from: 7, to: 22 })
    assert.deepEqual(gridHours(['2026-11-12T23:50:00', '2026-11-12T00:10:00']), { from: 0, to: 24 })
  })
})
