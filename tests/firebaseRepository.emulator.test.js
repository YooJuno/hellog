import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { signInAnonymously } from 'firebase/auth'
import { deleteApp } from 'firebase/app'

const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST)

test('repository CRUD uses Firebase emulators and isolates two actual authenticated users', {
  skip: emulatorEnabled ? false : 'Run with both Auth and Firestore emulators via firebase emulators:exec.',
  timeout: 30000,
}, async (t) => {
  const clientUrl = new URL('../frontend/src/lib/firebaseClient.js', import.meta.url).href
  const env = {
    VITE_FIREBASE_API_KEY: 'emulator-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo-hellog.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'demo-hellog',
    VITE_FIREBASE_APP_ID: 'demo-hellog-web',
    VITE_USE_FIREBASE_EMULATORS: 'true',
  }
  // Inject build-time env into this test process only; production source stays intact.
  const hook = registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context)
      if (url !== clientUrl) return result
      const source = String(result.source)
      assert.ok(source.includes('const env = import.meta.env || {}'), 'Firebase env declaration changed; update the test injection.')
      return { ...result, source: source.replace('const env = import.meta.env || {}', `const env = ${JSON.stringify(env)}`) }
    },
  })
  t.after(() => hook.deregister())
  const client = await import(clientUrl)
  const repository = await import('../frontend/src/lib/firebaseRepository.js')
  const { auth } = client.getFirebaseServices()
  t.after(async () => {
    await client.signOut()
    await deleteApp(auth.app)
  })

  await signInAnonymously(auth)
  const firstUid = auth.currentUser.uid
  const initialMachines = await repository.listMachines()
  assert.equal(initialMachines.length, 50)
  const payload = {
    workoutDate: '2026-10-14', title: '에뮬레이터 루틴', memo: '운동 메모',
    exercises: [{ category: 'CHEST', exerciseName: '체스트 프레스', equipment: '머신', manufacturer: '뉴텍', memo: null, sets: [{ weightKg: 40.5, reps: 10 }] }],
  }
  const created = await repository.saveWorkout(payload)
  assert.equal(typeof created.id, 'string')
  assert.equal(created.totalVolume, 405)
  assert.equal(created.exercises[0].manufacturer, '뉴텍')
  assert.ok(created.createdAt)
  assert.equal((await repository.listWorkouts()).length, 1)

  const updated = await repository.saveWorkout({ ...payload, title: '수정한 루틴' }, created.id)
  assert.equal(updated.title, '수정한 루틴')
  assert.equal(updated.createdAt, created.createdAt)
  const earlier = await repository.saveWorkout({ ...payload, workoutDate: '2026-10-13' })
  assert.deepEqual((await repository.listWorkouts()).map((item) => item.id), [created.id, earlier.id])
  await repository.deleteWorkout(earlier.id)
  assert.deepEqual((await repository.listWorkouts()).map((item) => item.id), [created.id])

  const machinePayload = { category: 'BACK', name: '내 테스트 머신', equipmentType: '머신', manufacturer: '뉴텍' }
  let personal = await repository.saveMachine(machinePayload)
  assert.equal(personal.defaultMachine, false)
  assert.equal((await repository.listMachines()).length, 51)
  await assert.rejects(repository.saveMachine({ category: 'BACK', name: '내 테스트 머신', equipmentType: '머신' }), /이미 등록/)
  await repository.deleteMachine(personal.id)
  assert.equal((await repository.listMachines()).length, 50)
  personal = await repository.saveMachine(machinePayload)
  const defaultId = initialMachines[0].id
  await repository.deleteMachine(defaultId)
  assert.equal((await repository.listMachines()).some((machine) => machine.id === defaultId), false)

  await client.signOut()
  await assert.rejects(repository.listWorkouts(), /로그인/)
  await signInAnonymously(auth)
  assert.notEqual(auth.currentUser.uid, firstUid)
  assert.deepEqual(await repository.listWorkouts(), [])
  assert.equal((await repository.listMachines()).length, 50)
  assert.equal((await repository.listMachines()).some((machine) => machine.id === defaultId), true)
  // Identical workout IDs are scoped to the current uid, so this cannot update user one's record.
  await assert.rejects(repository.saveWorkout(payload, created.id))
  await repository.deleteWorkout(created.id)
  await repository.deleteMachine(personal.id)
  assert.deepEqual(await repository.listWorkouts(), [])
})
