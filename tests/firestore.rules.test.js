import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

let environment
const workout = () => ({
  workoutDate: '2026-10-14',
  title: '가슴 운동',
  memo: null,
  exercises: [{ category: 'CHEST', exerciseName: '체스트 프레스', equipment: '머신', manufacturer: null, memo: null, sets: [{ weightKg: 40, reps: 10 }] }],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})
const machine = () => ({
  category: 'CHEST', name: '나의 체스트 프레스', equipmentType: '머신', manufacturer: '뉴텍',
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
})
const ownDb = () => environment.authenticatedContext('alice').firestore()

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')
  environment = await initializeTestEnvironment({
    projectId: 'demo-hellog-rules',
    firestore: { host, port: Number(port), rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
})
beforeEach(async () => environment.clearFirestore())
after(async () => environment?.cleanup())

test('회원은 자기 기록을 생성, 조회, 수정, 삭제할 수 있다', async () => {
  const reference = doc(ownDb(), 'users/alice/workouts/first')
  await assertSucceeds(setDoc(reference, workout()))
  await assertSucceeds(getDoc(reference))
  await assertSucceeds(getDocs(collection(ownDb(), 'users/alice/workouts')))
  await assertSucceeds(updateDoc(reference, { title: '가슴·팔', updatedAt: serverTimestamp() }))
  await assertSucceeds(deleteDoc(reference))
})

test('비로그인과 다른 회원은 기록을 읽거나 변경할 수 없다', async () => {
  await setDoc(doc(ownDb(), 'users/alice/workouts/first'), workout())
  for (const db of [environment.unauthenticatedContext().firestore(), environment.authenticatedContext('bob').firestore()]) {
    const reference = doc(db, 'users/alice/workouts/first')
    await assertFails(getDoc(reference))
    await assertFails(getDocs(collection(db, 'users/alice/workouts')))
    await assertFails(setDoc(doc(db, 'users/alice/workouts/other'), workout()))
    await assertFails(updateDoc(reference, { title: '변경', updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(reference))
  }
})

test('빈 기록, 잘못된 날짜 형식, 추가 필드와 초과한 메모를 거절한다', async () => {
  const reference = doc(ownDb(), 'users/alice/workouts/invalid')
  for (const invalid of [
    { exercises: [] }, { exercises: Array(31).fill({}) }, { workoutDate: '2026-13-32' },
    { title: '' }, { memo: 'x'.repeat(2001) }, { owner: 'bob' }, { createdAt: new Date(0) },
  ]) await assertFails(setDoc(reference, { ...workout(), ...invalid }))
})

test('생성일을 수정하거나 갱신 시각을 누락할 수 없다', async () => {
  const reference = doc(ownDb(), 'users/alice/workouts/first')
  await setDoc(reference, workout())
  await assertFails(updateDoc(reference, { createdAt: new Date(0), updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(reference, { title: '임의 수정', updatedAt: new Date(0) }))
})

test('내 운동 등록과 삭제를 허용하고 부위·방식·필드를 검증한다', async () => {
  const reference = doc(ownDb(), 'users/alice/machines/custom')
  await assertSucceeds(setDoc(reference, machine()))
  await assertSucceeds(getDocs(collection(ownDb(), 'users/alice/machines')))
  await assertSucceeds(updateDoc(reference, { manufacturer: '직접 등록', updatedAt: serverTimestamp() }))
  for (const invalid of [{ category: 'INVALID' }, { equipmentType: 'INVALID' }, { name: '' }, { defaultMachine: true }]) {
    await assertFails(setDoc(doc(ownDb(), 'users/alice/machines/invalid'), { ...machine(), ...invalid }))
  }
  const other = doc(environment.authenticatedContext('bob').firestore(), 'users/alice/machines/custom')
  await assertFails(getDoc(other))
  await assertFails(deleteDoc(other))
  await assertSucceeds(deleteDoc(reference))
})

test('기본 운동 숨김은 내 계정의 유효한 기본 운동 ID에만 허용한다', async () => {
  const reference = doc(ownDb(), 'users/alice/hiddenMachines/default-chest-01')
  await assertSucceeds(setDoc(reference, { hidden: true }))
  await assertSucceeds(getDocs(collection(ownDb(), 'users/alice/hiddenMachines')))
  await assertFails(setDoc(reference, { hidden: true, owner: 'bob' }))
  await assertFails(setDoc(doc(ownDb(), 'users/alice/hiddenMachines/arbitrary'), { hidden: true }))
  await assertFails(getDoc(doc(environment.authenticatedContext('bob').firestore(), 'users/alice/hiddenMachines/default-chest-01')))
  await assertSucceeds(deleteDoc(reference))
})

test('정의되지 않은 경로는 회원에게도 접근을 허용하지 않는다', async () => {
  await assertFails(setDoc(doc(ownDb(), 'users/alice'), { admin: true }))
  await assertFails(setDoc(doc(ownDb(), 'settings/public'), { admin: true }))
})
