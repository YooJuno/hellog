import assert from 'node:assert/strict'
import test from 'node:test'
import { fromWorkout, mergeWorkout, normalizeSearch, toPayload, workoutSearchText } from '../frontend/src/lib/workoutUtils.js'
import { normalizeWorkoutPayload } from '../frontend/src/lib/firebaseRepository.js'

const workout = (id, date, createdAt = '') => ({ id, workoutDate: date, createdAt, title: '가슴 루틴', memo: null, exercises: [] })

test('a saved or edited record updates locally once and moves to its correct date without changing the previous list', () => {
  const first = workout('first', '2026-11-12', '2026-11-12T10:00:00Z')
  const older = workout('older', '2026-11-10')
  const previous = Object.freeze([first, older])
  const saved = { ...first, title: '수정한 루틴', workoutDate: '2026-11-09' }
  const result = mergeWorkout(previous, saved)
  assert.deepEqual(result.map((item) => item.id), ['older', 'first'])
  assert.equal(result.at(-1), saved)
  assert.equal(result[0], older)
  assert.equal(previous[0].title, '가슴 루틴')
  assert.equal(mergeWorkout(result, saved).length, 2)
})

test('records saved on the same date keep newest creation first, including a new unsorted result', () => {
  const previous = [workout('a', '2026-11-12', '2026-11-12T08:00:00Z')]
  const result = mergeWorkout(previous, workout('b', '2026-11-12', '2026-11-12T09:00:00Z'))
  assert.deepEqual(result.map((item) => item.id), ['b', 'a'])
})

test('search finds routine notes and exercise notes regardless of spacing or letter case', () => {
  const record = { ...workout('one', '2026-11-12'), memo: '컨디션 좋음', exercises: [{ category: 'CHEST', exerciseName: '체스트 프레스', manufacturer: 'Life Fitness', memo: '의자 높이 3' }] }
  const text = workoutSearchText(record, [])
  for (const query of ['컨디션좋음', '체스트프레스', 'LIFE fitness', '의자높이 3']) assert.ok(text.includes(normalizeSearch(query)))
})

test('editing a record whose machine was removed preserves its equipment, manufacturer, memo and zero-weight sets', () => {
  const record = { ...workout('one', '2026-11-12'), memo: '컨디션 메모', exercises: [{ category: 'CHEST', exerciseName: '이전 운동', equipment: '머신', manufacturer: '뉴텍', memo: '그립 메모', sets: [{ weightKg: 0, reps: 12 }] }] }
  const form = fromWorkout(record, [])
  assert.equal(form.exercises[0].machineId, '')
  assert.ok(form.exercises[0].uiId)
  const payload = toPayload(form, [])
  assert.deepEqual(payload.exercises, record.exercises)
  assert.equal('uiId' in payload.exercises[0], false)
  assert.equal(normalizeWorkoutPayload(payload).exercises[0].sets[0].weightKg, 0)
})

test('form conversion keeps invalid empty inputs and zero reps available for validation instead of silently replacing them', () => {
  const form = { workoutDate: '2026-11-12', title: '검증 루틴', exercises: [{ exerciseName: '벤치 프레스', sets: [{ weightKg: '', reps: 0 }] }] }
  const payload = toPayload(form, [])
  assert.equal(payload.exercises[0].sets[0].weightKg, '')
  assert.equal(payload.exercises[0].sets[0].reps, 0)
  assert.throws(() => normalizeWorkoutPayload(payload))
})
