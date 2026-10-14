import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DEFAULT_MACHINES } from '../frontend/src/data/defaultMachines.js'
import { firebaseConfigured, subscribeAuth } from '../frontend/src/lib/firebaseClient.js'
import {
  normalizeMachinePayload,
  normalizeWorkoutPayload,
  workoutFromDocument,
} from '../frontend/src/lib/firebaseRepository.js'

const workout = () => ({
  workoutDate: '2026-10-14',
  title: ' 상체 루틴 ',
  memo: ' 의자 높이 3 ',
  exercises: [{
    category: 'CHEST',
    exerciseName: ' 체스트 프레스 ',
    equipment: '머신',
    manufacturer: ' 뉴텍 ',
    memo: '',
    sets: [{ weightKg: '40.5', reps: '10' }, { weightKg: 0, reps: 8 }],
  }],
})

test('workout normalization preserves names and manufacturer, trims text, and parses numeric inputs', () => {
  const normalized = normalizeWorkoutPayload(workout())
  assert.equal(normalized.title, '상체 루틴')
  assert.equal(normalized.memo, '의자 높이 3')
  assert.equal(normalized.exercises[0].exerciseName, '체스트 프레스')
  assert.equal(normalized.exercises[0].manufacturer, '뉴텍')
  assert.equal(normalized.exercises[0].memo, null)
  assert.deepEqual(normalized.exercises[0].sets[0], { weightKg: 40.5, reps: 10 })
})

test('workout model recomputes totals and returns string IDs and ISO timestamps', () => {
  const result = workoutFromDocument('firestore-string-id', {
    ...workout(),
    totalSets: 100, totalReps: 1000, totalVolume: 999,
    createdAt: { toDate: () => new Date('2026-10-14T01:00:00.000Z') },
  })
  assert.deepEqual([result.totalSets, result.totalReps, result.totalVolume], [2, 18, 405])
  assert.equal(result.id, 'firestore-string-id')
  assert.equal(result.createdAt, '2026-10-14T01:00:00.000Z')
  assert.equal(result.exercises[0].sets[1].setNumber, 2)
  assert.equal(new Set(result.exercises[0].sets.map((set) => set.id)).size, 2)
})

test('workout validation rejects invalid dates, empty routines, and excessive text or exercise counts', () => {
  for (const changes of [
    { workoutDate: '2026-02-30' },
    { workoutDate: '2026-13-01' },
    { workoutDate: '26-10-14' },
    { title: ' ' },
    { title: 'x'.repeat(101) },
    { memo: 'x'.repeat(2001) },
    { exercises: [] },
    { exercises: Array(31).fill(workout().exercises[0]) },
  ]) assert.throws(() => normalizeWorkoutPayload({ ...workout(), ...changes }))
  assert.equal(normalizeWorkoutPayload({ ...workout(), workoutDate: '2028-02-29' }).workoutDate, '2028-02-29')
})

test('set validation rejects negative or nonfinite weights, missing values, and nonpositive or fractional reps', () => {
  for (const sets of [
    [],
    [{ weightKg: -1, reps: 10 }],
    [{ weightKg: Infinity, reps: 10 }],
    [{ weightKg: NaN, reps: 10 }],
    [{ weightKg: '', reps: 10 }],
    [{ weightKg: null, reps: 10 }],
    [{ weightKg: true, reps: 10 }],
    [{ weightKg: 20, reps: 0 }],
    [{ weightKg: 20, reps: 1.5 }],
  ]) {
    const payload = workout()
    payload.exercises[0].sets = sets
    assert.throws(() => normalizeWorkoutPayload(payload))
  }
})

test('workout totals reject numeric overflow instead of displaying unusable statistics', () => {
  const payload = workout()
  payload.exercises[0].sets = [{ weightKg: 1e308, reps: 1 }, { weightKg: 1e308, reps: 1 }]
  assert.throws(() => workoutFromDocument('overflow', payload))
})

test('machine normalization validates the catalog options and keeps manufacturer for machines only', () => {
  const payload = { category: 'CHEST', name: ' 벤치 프레스 ', equipmentType: '바벨', manufacturer: '뉴텍' }
  assert.equal(normalizeMachinePayload(payload).name, '벤치 프레스')
  assert.equal(normalizeMachinePayload(payload).manufacturer, null)
  assert.equal(normalizeMachinePayload({ ...payload, equipmentType: '머신' }).manufacturer, '뉴텍')
  for (const changes of [{ category: 'UNKNOWN' }, { equipmentType: 'UNKNOWN' }, { name: '' }, { manufacturer: 'x'.repeat(101), equipmentType: '머신' }]) {
    assert.throws(() => normalizeMachinePayload({ ...payload, ...changes }))
  }
})

test('the 50 static default machines match the legacy seed and have unique stable IDs', () => {
  const source = readFileSync(new URL('../backend/src/main/java/com/healthlogger/backend/gym/GymMachineSeeder.java', import.meta.url), 'utf8')
  const seeded = [...source.matchAll(/new SeedMachine\("([A-Z]+)", "([^"]+)", "([^"]+)"\)/g)]
    .map((match) => `${match[1]}::${match[2]}::${match[3]}`)
  assert.equal(DEFAULT_MACHINES.length, 50)
  assert.deepEqual(DEFAULT_MACHINES.map((machine) => `${machine.category}::${machine.name}::${machine.equipmentType}`), seeded)
  assert.equal(new Set(DEFAULT_MACHINES.map((machine) => machine.id)).size, 50)
  assert.equal(DEFAULT_MACHINES[0].id, 'default-chest-01')
  assert.equal(DEFAULT_MACHINES.at(-1).id, 'default-core-06')
  assert.ok(DEFAULT_MACHINES.every((machine) => /^default-[a-z]+-\d{2}$/.test(machine.id)))
})

test('unconfigured authentication reports a checked signed-out state and honors immediate cleanup', async () => {
  assert.equal(firebaseConfigured, false)
  let cancelledCalls = 0
  const cancel = subscribeAuth(() => { cancelledCalls += 1 })
  cancel()
  let status
  const unsubscribe = subscribeAuth((value) => { status = value })
  await Promise.resolve()
  assert.equal(cancelledCalls, 0)
  assert.deepEqual(status, { checked: true, authenticated: false, googleLoginEnabled: false, user: null })
  unsubscribe()
})
