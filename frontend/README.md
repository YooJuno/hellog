# HelloG frontend

React 19 + Vite + Firebase Web SDK로 구성한 운동 기록 화면입니다.

프로젝트 루트의 [README](../README.md)와 [Firebase 배포 가이드](../FIREBASE_DEPLOYMENT.md)를 참고하세요.

- `src/App.jsx`: 기록·조회·운동 목록과 계정별 초안 관리
- `src/components/WorkoutSidebar.jsx`: 입력한 운동의 요약
- `src/lib/firebaseClient.js`: Firebase 초기화, Google 로그인과 인증 구독
- `src/lib/firebaseRepository.js`: 사용자 UID별 Firestore 저장·조회·검증
- `src/data/defaultMachines.js`: 기존 기본 운동 50개
- `src/index.css`, `src/App.css`: 단색 토큰, 화면 스타일과 반응형 레이아웃

`npm run dev`로 개발하고 `npm run lint`, `npm run build`로 확인합니다. 실제 배포는 프로젝트 루트의 `npm run deploy`를 사용하며, 필수 Firebase 설정과 에뮬레이터 비활성화를 검사합니다.
