import { getApps, initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const env = import.meta.env || {}
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
}

export const firebaseConfigured = ['apiKey', 'authDomain', 'projectId', 'appId']
  .every((key) => typeof firebaseConfig[key] === 'string' && firebaseConfig[key].trim())

let services = null

export function firebaseErrorMessage(error, fallback = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.') {
  const messages = {
    'auth/popup-blocked': '로그인 팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.',
    'auth/popup-closed-by-user': '로그인 창이 닫혔습니다. 다시 로그인해주세요.',
    'auth/cancelled-popup-request': '로그인이 이미 진행 중입니다.',
    'auth/unauthorized-domain': '현재 주소에서 로그인할 수 없습니다. Firebase 인증 도메인 설정을 확인해주세요.',
    'auth/operation-not-allowed': 'Google 로그인이 아직 연결되지 않았습니다.',
    'auth/network-request-failed': '인터넷 연결을 확인한 후 다시 시도해주세요.',
    'auth/account-exists-with-different-credential': '이 이메일은 다른 로그인 방식으로 등록되어 있습니다.',
    'auth/invalid-api-key': 'Firebase 연결 설정을 확인해주세요.',
    'auth/invalid-user-token': '로그인이 만료되었습니다. 다시 로그인해주세요.',
    'auth/user-token-expired': '로그인이 만료되었습니다. 다시 로그인해주세요.',
    'auth/user-disabled': '이 계정으로 로그인할 수 없습니다.',
    'auth/too-many-requests': '요청이 많습니다. 잠시 후 다시 시도해주세요.',
    'permission-denied': '기록에 접근할 권한이 없습니다. 로그인 상태를 확인해주세요.',
    'unauthenticated': '로그인이 필요합니다.',
    'unavailable': '저장소에 연결하지 못했습니다. 인터넷 연결을 확인해주세요.',
    'resource-exhausted': '저장소가 잠시 바쁩니다. 잠시 후 다시 시도해주세요.',
    'failed-precondition': '저장소 설정을 확인해주세요.',
    'not-found': '기록을 찾을 수 없습니다. 목록을 새로 불러와주세요.',
  }
  if (messages[error?.code]) return messages[error.code]
  if (error instanceof Error && !error.code) return error.message || fallback
  return fallback
}

export function friendlyFirebaseError(error, fallback) {
  const translated = new Error(firebaseErrorMessage(error, fallback))
  translated.code = error?.code
  return translated
}

export function getFirebaseServices() {
  if (!firebaseConfigured) throw new Error('로그인 연결을 준비하고 있습니다.')
  if (services) return services

  const existingApp = getApps().find((app) => app.name === 'hellog')
  const app = existingApp || initializeApp(firebaseConfig, 'hellog')
  const auth = getAuth(app)
  const db = getFirestore(app)
  if (env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    // Firebase service instances survive Vite module replacement.
    if (!auth.emulatorConfig) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    if (!app.__hellogFirestoreEmulatorConnected) {
      connectFirestoreEmulator(db, '127.0.0.1', 8080)
      app.__hellogFirestoreEmulatorConnected = true
    }
  }
  services = { auth, db }
  return services
}

export function requireFirebaseUser() {
  const { auth, db } = getFirebaseServices()
  if (!auth.currentUser) throw new Error('로그인이 필요합니다.')
  return { uid: auth.currentUser.uid, db }
}

function authStatus(user, enabled = firebaseConfigured) {
  return {
    checked: true,
    authenticated: Boolean(user),
    googleLoginEnabled: enabled,
    user: user ? {
      id: user.uid,
      name: user.displayName || user.email?.split('@')[0] || '회원',
      email: user.email || '',
      pictureUrl: user.photoURL || '',
    } : null,
  }
}

/**
 * Auth persistence is restored before the first SDK callback.
 * Returns cleanup synchronously, including when configuration is absent.
 */
export function subscribeAuth(listener, errorCallback = () => {}) {
  let active = true
  const notify = (status) => {
    if (active) listener(status)
  }
  if (!firebaseConfigured) {
    queueMicrotask(() => notify(authStatus(null, false)))
    return () => { active = false }
  }

  let unsubscribe = () => {}
  try {
    const { auth } = getFirebaseServices()
    unsubscribe = onAuthStateChanged(auth, (user) => notify(authStatus(user)), (error) => {
      if (!active) return
      notify(authStatus(null))
      errorCallback(friendlyFirebaseError(error, '로그인 상태를 확인하지 못했습니다.'))
    })
  } catch (error) {
    queueMicrotask(() => {
      if (!active) return
      notify(authStatus(null, false))
      errorCallback(friendlyFirebaseError(error, '로그인 연결 설정을 확인해주세요.'))
    })
  }
  return () => {
    active = false
    unsubscribe()
  }
}

export async function signIn() {
  try {
    const { auth } = getFirebaseServices()
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    const result = await signInWithPopup(auth, provider)
    return authStatus(result.user)
  } catch (error) {
    throw friendlyFirebaseError(error, '로그인하지 못했습니다. 다시 시도해주세요.')
  }
}

export async function signOut() {
  if (!firebaseConfigured) return
  try {
    await firebaseSignOut(getFirebaseServices().auth)
  } catch (error) {
    throw friendlyFirebaseError(error, '로그아웃하지 못했습니다. 다시 시도해주세요.')
  }
}
