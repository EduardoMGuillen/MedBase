import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dateFromDisplay, fromDisplay, fromLocalValue, localValueToIso, timeFromDisplay, toLocalValue } from '../src/lib/dateInput.js'
import { dmyTime, time } from '../src/lib/format.js'

describe('GE3: fecha y hora en 24 horas, hora de Honduras', () => {
  test('se escribe y se lee dd/mm/aaaa HH:mm; fechas imposibles se rechazan', () => {
    assert.equal(fromDisplay('31/10/2026 23:05'), '2026-10-31T23:05')
    assert.equal(fromDisplay('31/02/2026 10:00'), null)
    assert.equal(dateFromDisplay('31/02/2026'), null)
    assert.equal(timeFromDisplay('24:00'), null)
    assert.equal(timeFromDisplay('20:14'), '20:14')
  })
  test('sin corrimientos: guardar y reabrir da la misma hora, en cualquier zona del navegador', () => {
    const iso = localValueToIso('2026-11-02T20:14')
    assert.equal(iso, '2026-11-03T02:14:00.000Z')
    assert.equal(toLocalValue(fromLocalValue('2026-11-02T20:14')), '2026-11-02T20:14')
    assert.equal(time(iso), '20:14')
    assert.equal(dmyTime(iso), '02/11/2026 20:14')
    // En otra zona horaria (un navegador en Nueva York), lo mismo
    const out = execFileSync('npx', ['tsx', '-e', "import('./src/lib/format.ts').then((f) => console.log(f.dmyTime('2026-11-03T02:14:00.000Z'), f.inputDateTime(new Date('2026-11-03T02:14:00.000Z'))))"],
      { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' }).trim()
    assert.equal(out, '02/11/2026 20:14 2026-11-02T20:14')
  })
  test('no quedan campos nativos de fecha u hora ni formatos de 12 horas en el código', () => {
    execFileSync('node', ['scripts/check-dates.mjs'], { encoding: 'utf8' })
  })
})
