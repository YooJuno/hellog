import { loadEnv } from 'vite'

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env }
const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']
const missing = required.filter((key) => !env[key]?.trim())

if (missing.length) {
  console.error(`Firebase 배포 설정이 필요합니다: ${missing.join(', ')}`)
  console.error('frontend/.env.local에 Firebase 콘솔의 웹 앱 설정값을 입력하세요.')
  process.exit(1)
}
if (env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  console.error('에뮬레이터 연결을 끈 다음 배포하세요: VITE_USE_FIREBASE_EMULATORS=false')
  process.exit(1)
}
if (env.VITE_FIREBASE_PROJECT_ID.startsWith('demo-')) {
  console.error('에뮬레이터용 demo 프로젝트는 실제 Hosting에 배포할 수 없습니다.')
  process.exit(1)
}
const targetProject = process.env.GCLOUD_PROJECT
if (targetProject && env.VITE_FIREBASE_PROJECT_ID !== targetProject) {
  console.error('Firebase CLI 배포 대상과 웹 앱의 projectId가 다릅니다. 설정을 확인하세요.')
  process.exit(1)
}
console.log(`Firebase 설정 확인: ${env.VITE_FIREBASE_PROJECT_ID}`)
