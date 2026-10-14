# HelloG

간결하게 운동·세트·무게·횟수를 기록하는 앱입니다. `feat/firebase-clean-ui` 브랜치는 React + Firebase Hosting / Authentication / Cloud Firestore로 구성되어 별도 Java 서버 없이 운영합니다.

운영 주소: **[https://hellog-juno.web.app](https://hellog-juno.web.app)**

## 기능

- 기록하기: 부위와 기구 선택, 세트별 무게·횟수·메모, 실시간 루틴 요약
- 기록보기: 검색·부위·날짜 필터, 운동 추이와 통계, 수정·복제·삭제
- 운동 목록: 기존 기본 운동 50개, 개인 운동과 머신 제조사 등록·삭제
- Google 로그인과 회원별 데이터 분리, 계정별 임시 저장·복구
- 그라데이션 없는 단색 UI, 데스크톱과 모바일 대응

## 시작하기

Node.js 22.15 이상을 준비한 뒤 프로젝트 루트에서 실행합니다.

```bash
npm ci
npm --prefix frontend ci
cp frontend/.env.example frontend/.env.local
```

이미 설정한 `.env.local`이 있다면 복사로 덮어쓰지 마세요. 웹 앱의 Firebase 설정값을 입력한 뒤 개발 서버를 실행합니다.

```bash
npm run dev
```

## 확인과 배포

```bash
npm run lint
npm test
npm run build
```

실제 Firebase SDK의 CRUD와 회원별 접근 규칙은 Java 21 이상을 설치한 뒤 에뮬레이터로 검증합니다.

```bash
npm run test:firebase
```

기본 배포 대상은 `hellog-juno`입니다. Google 로그인과 서울 지역의 기본 Firestore 데이터베이스가 구성되어 있습니다. CLI 로그인 후 다시 배포할 수 있습니다.

```bash
npx firebase login --interactive
npm run deploy
```

배포 전에 필수 설정, 에뮬레이터 연결 여부와 프로젝트 일치 여부를 확인하고 운영 빌드를 생성합니다. 상세 설정과 무료 한도는 [Firebase 배포 가이드](./FIREBASE_DEPLOYMENT.md)에 있습니다.

Spark 무료 한도 안에서는 상시 운영할 수 있습니다. 무료 한도 초과 시 이용이 제한될 수 있습니다. [공식 요금제 안내](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

## 기존 백엔드

`backend/`의 Spring Boot API와 H2 데이터는 보존됩니다. 이 브랜치의 화면은 Firebase를 사용하며 기존 Java API를 호출하지 않습니다. 기존 H2 기록은 Firestore에 자동으로 이전되지 않습니다. `deploy.sh`, `DEPLOYMENT.md`, `QUICK_START.md` 등 기존 서버 배포 문서는 이전 Java 배포 구조용입니다.

## 자동 배포

`main`을 대상으로 하는 PR에서 린트·테스트·빌드를 실행하며, `main`에 반영된 변경은 검증 후 Firebase로 자동 배포합니다. [GitHub Actions](https://github.com/YooJuno/hellog/actions/workflows/firebase.yml)에서 실행 결과와 수동 재배포를 확인할 수 있습니다.

GitHub와 Google Cloud의 배포 인증·변수 설정은 [CI/CD 설명](./FIREBASE_DEPLOYMENT.md#github-cicd)에 있습니다.
