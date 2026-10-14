# Firebase에서 HelloG 운영하기

이 구성은 React 앱을 Firebase Hosting에 올리고, Google 로그인과 회원별 기록을 Firebase Authentication / Cloud Firestore에 저장합니다. 운영용 Java 서버나 별도 서버 인스턴스는 필요하지 않습니다. 저장소의 `backend/`와 기존 H2 파일은 그대로 남아 있으며, 기존 기록을 Firestore로 자동 이전하지는 않습니다.

현재 기본 배포 대상은 `hellog-juno`입니다. 제공받은 웹 앱 설정값은 Git에서 제외되는 `frontend/.env.local`에 반영했습니다. 새로 체크아웃한 환경에서는 아래 방법으로 설정값을 다시 입력해야 합니다.

2026-10-14에 **[https://hellog-juno.web.app](https://hellog-juno.web.app)**로 배포했습니다. Google 로그인은 활성화되어 있으며, Firestore는 서울(`asia-northeast3`)의 `(default)` Standard 데이터베이스를 사용합니다. 결제 계정이 연결되지 않은 상태(`billingEnabled: false`)를 확인했습니다. 모바일·데스크톱의 세 화면, Google OAuth 로그인 페이지 연결과 비로그인 Firestore 접근 차단을 확인했습니다. 실제 Google 계정으로 로그인한 뒤 기록을 저장하는 사용자 동작은 직접 확인하지 않았습니다.

## 무료 운영 범위

Spark 요금제를 유지하고 사용량이 무료 한도 안에 있으면 기간 제한 없이 운영할 수 있습니다. Spark는 결제 수단을 요구하지 않습니다. 이 앱은 Firebase **Hosting**을 사용하며, App Hosting / Cloud Functions / Cloud Storage를 사용하지 않습니다. Google 로그인은 전화 인증과 별개인 Firebase Authentication 서비스입니다. [Firebase 요금제](https://firebase.google.com/pricing), [Spark와 Blaze 설명](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

2026-10-14에 확인한 주요 한도는 아래와 같습니다. 프로젝트 전체 사용량 기준이며 무료라는 뜻이 무제한이라는 뜻은 아닙니다.

| 서비스 | Spark 무료 범위 |
| --- | --- |
| Firestore Standard 저장량 | 1 GiB |
| Firestore 문서 읽기 | 하루 50,000회 |
| Firestore 문서 쓰기 / 삭제 | 각각 하루 20,000회 |
| Firestore 외부 데이터 전송 | 월 10 GiB |
| Hosting 저장량 | 10 GB, 보관된 이전 배포도 포함 |
| Hosting 데이터 전송 | 요금표는 하루 360 MB, Hosting 상세 문서는 월 10 GB로 표기 |

Firestore의 일일 한도는 태평양 시간 자정 무렵 초기화됩니다. 프로젝트당 무료 데이터베이스는 하나이며 이 앱은 `(default)` 데이터베이스를 사용합니다. [Firestore 한도](https://firebase.google.com/docs/firestore/quotas).

Hosting 전송량은 현재 공식 요금표와 상세 문서의 표기가 다릅니다. 실제 프로젝트의 Hosting 사용량 화면과 최신 문서를 확인하세요. 상세 문서는 무료 저장량을 넘으면 새 배포가 막히고, 전송량을 넘으면 유예 기간 뒤 사이트가 다음 달까지 비활성화될 수 있다고 설명합니다. Spark에서 자동으로 초과 요금이 청구되는 방식은 아니지만 서비스 사용에 제한이 생길 수 있습니다. [Hosting 사용량과 한도](https://firebase.google.com/docs/hosting/usage-quotas-pricing), [요금표](https://firebase.google.com/pricing).

기록 목록을 새로 불러오면 읽은 문서 수만큼 사용량이 늘어납니다. Firebase 콘솔의 Firestore / Hosting 사용량을 확인하고 오래된 Hosting 릴리스를 필요에 따라 정리하세요.

## 1. Firebase 프로젝트 준비

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트를 만들고 Spark 요금제를 유지합니다. Analytics는 이 앱에 필수가 아닙니다.
2. 프로젝트 설정에서 웹 앱을 등록하고 Firebase SDK 설정의 `apiKey`, `authDomain`, `projectId`, `appId` 값을 확인합니다.
3. 이 프로젝트는 `firebase.json`의 `auth.providers.googleSignIn`으로 Google 로그인과 OAuth 브랜드를 관리합니다. 다른 프로젝트에 사용할 때는 지원 이메일을 해당 프로젝트에서 사용할 계정의 이메일로 변경합니다. 배포 시 제공업체가 활성화됩니다. [CLI 인증 제공업체 설정](https://firebase.google.com/docs/auth/configure-providers-cli).
4. Authentication의 설정 → 승인된 도메인에 사용할 Hosting 도메인과 사용자 지정 도메인이 있는지 확인합니다. 실제 Firebase 계정으로 로컬 개발을 할 때는 `localhost`를 추가합니다. **2025-04-28 이후 생성된 프로젝트에서는 `localhost`가 기본 추가되지 않습니다.** [인증 도메인 안내](https://firebase.google.com/docs/auth/faq-and-troubleshooting).
5. `firebase.json`은 **Standard edition**, 데이터베이스 ID `(default)`, 서울 지역을 지정합니다. 데이터베이스가 없으면 배포 중 생성되며, 회원별 접근 규칙을 함께 적용합니다. 콘솔에서 미리 생성한다면 **프로덕션 모드**를 선택합니다. [Firestore 시작하기](https://firebase.google.com/docs/firestore/quickstart).
6. 한국에서 주로 사용하는 앱이라면 데이터베이스 위치로 `asia-northeast3`(서울)를 선택할 수 있습니다. 생성 전에 위치를 확인하세요. [Firestore 위치](https://firebase.google.com/docs/firestore/locations).

## 2. 환경 변수와 의존성

Firebase CLI에는 Node.js 22 또는 24 LTS를 권장합니다. 저장소의 SDK 통합 테스트는 Node.js 22.15 이상을 사용합니다. 프로젝트 루트에서 실행합니다.

```bash
npm install
npm --prefix frontend ci
cp frontend/.env.example frontend/.env.local
```

`frontend/.env.local`에 웹 앱 설정을 입력합니다. 예제 파일의 빈 값은 실제 설정으로 바꿔야 합니다.

```dotenv
VITE_FIREBASE_API_KEY=웹앱의_apiKey
VITE_FIREBASE_AUTH_DOMAIN=프로젝트ID.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=프로젝트ID
VITE_FIREBASE_APP_ID=웹앱의_appId
VITE_FIREBASE_MESSAGING_SENDER_ID=웹앱의_messagingSenderId
VITE_USE_FIREBASE_EMULATORS=false
```

`MESSAGING_SENDER_ID`는 선택값입니다. 나머지 네 가지 Firebase 설정값은 필수입니다. Vite는 환경 변수를 빌드할 때 포함하므로 변경한 뒤 개발 서버를 다시 시작하거나 다시 빌드해야 합니다.

Firebase 웹 설정은 브라우저에 공개되는 값입니다. 서비스 계정 JSON이나 Google OAuth client secret을 `VITE_` 변수에 넣지 마세요. 데이터 접근 권한은 이 저장소의 Firestore 규칙과 로그인 UID로 제한합니다. [Firebase API 키의 역할](https://firebase.google.com/docs/projects/api-keys).

## 3. 프로젝트 연결과 배포

Firebase CLI는 루트 개발 의존성에 `15.33.0`으로 고정되어 있습니다. 별도 전역 설치 없이 동일한 버전으로 실행할 수 있습니다.

```bash
npx firebase-tools@15.33.0 login --interactive
npx firebase-tools@15.33.0 use --add
```

`use --add`에서 준비한 프로젝트를 선택하고 별칭을 `default`로 지정합니다. 또는 `.firebaserc.example`을 `.firebaserc`로 복사한 뒤 `projects.default`를 실제 프로젝트 ID로 바꿉니다. 이 프로젝트 ID는 `VITE_FIREBASE_PROJECT_ID`와 같아야 합니다. [Firebase CLI 사용법](https://firebase.google.com/docs/cli).

환경 변수 설정과 프로젝트 연결이 끝나면 확인 후 배포합니다.

```bash
npm run lint
npm test
npm run build
npm run deploy
```

`deploy`는 Hosting, Google 로그인 설정, Firestore 규칙, 인덱스를 함께 배포합니다. Hosting의 `predeploy`에서 `build:firebase`를 실행해 필수 환경 변수와 에뮬레이터 설정을 검증하고 프론트엔드를 운영 모드로 빌드합니다. 직접 Firebase CLI로 배포해도 같은 검증을 거칩니다. `firebase init`은 필요하지 않습니다. 기존 구성 파일이 이미 있으므로 초기화로 덮어쓰지 마세요.

Hosting은 `frontend/dist`를 배포하고 SPA 경로를 `index.html`로 연결합니다. HTML과 일반 경로는 캐시하지 않고, 파일명에 해시가 붙는 `/assets/` 파일은 장기 캐시합니다. [Hosting 설정](https://firebase.google.com/docs/hosting/full-config).

배포 명령이 출력한 `https://프로젝트ID.web.app`에서 Google 로그인 → 운동 저장 → 새로고침 후 조회 → 삭제를 확인합니다. 다른 Google 계정에서 첫 계정의 기록이 보이지 않는지도 확인하세요. 사용자 지정 도메인을 연결하면 해당 도메인을 Authentication의 승인된 도메인에도 추가합니다.

## 4. 실제 프로젝트 없이 로컬 확인

Authentication / Firestore 에뮬레이터는 실제 프로젝트를 만들지 않고 `demo-hellog` 프로젝트 ID로 실행할 수 있습니다. Firestore 에뮬레이터는 Java 런타임도 필요합니다. 현재 도구와 함께 사용할 JDK 21 이상을 준비하세요. 이 Java는 로컬 테스트 도구에만 사용하며 운영 서버는 필요하지 않습니다. [Emulator Suite 설정](https://firebase.google.com/docs/emulator-suite/install_and_configure).

`frontend/.env.development.local`을 만들고 아래처럼 입력합니다. 이 파일은 개발 모드에서만 읽으므로 실제 운영 빌드와 설정을 분리할 수 있습니다.

```dotenv
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-hellog.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-hellog
VITE_FIREBASE_APP_ID=demo-app-id
VITE_USE_FIREBASE_EMULATORS=true
```

프로젝트 루트의 첫 터미널에서 실행합니다.

```bash
npm run emulators
```

둘째 터미널에서 개발 서버를 실행합니다.

```bash
npm run dev
```

앱은 `http://localhost:5173`, Emulator UI는 `http://127.0.0.1:4000`에 있습니다. Auth는 9099, Firestore는 8080, Hosting은 5000 포트를 사용합니다. 에뮬레이터의 Google 로그인은 실제 Google 계정 인증을 대신하는 로컬 테스트 흐름입니다.

Hosting 에뮬레이터에서 화면을 보려면 시작 전에 개발 모드로 빌드합니다.

```bash
npm --prefix frontend run build -- --mode development
```

이 빌드는 로컬 에뮬레이터 연결용입니다. 실제 배포는 `VITE_USE_FIREBASE_EMULATORS=false`로 구성한 뒤 `npm run deploy`의 운영 빌드를 사용합니다.

규칙 테스트는 Firestore 에뮬레이터를 자동으로 시작하고 종료합니다. 실행 중인 8080 포트 에뮬레이터를 먼저 종료한 뒤 실행합니다.

```bash
npm run test:rules
npm run test:firebase
```

에뮬레이터 데이터는 운영 Firestore에 저장되지 않습니다. 별도 import/export 옵션을 사용하지 않으면 종료 시 테스트 데이터가 사라집니다. [로컬 에뮬레이터와 프로젝트](https://firebase.google.com/docs/emulator-suite/connect_and_prototype).

## 데이터 구조와 규칙 범위

Firebase Auth의 UID로 사용자 데이터 경로를 나눕니다. 사용자 프로필 루트 문서는 저장하지 않습니다.

```text
users/{uid}/workouts/{workoutId}
users/{uid}/machines/{machineId}
users/{uid}/hiddenMachines/{defaultMachineId}
```

| 컬렉션 | 저장 필드 |
| --- | --- |
| workouts | workoutDate, title, memo, exercises, createdAt, updatedAt |
| machines | category, name, equipmentType, manufacturer, createdAt, updatedAt |
| hiddenMachines | hidden: true |

운동 기록의 `exercises`에는 부위, 운동명, 기구, 제조사, 메모와 `sets` 목록을 저장합니다. 세트에는 `weightKg`, `reps`만 저장합니다. 기록의 총 세트 수와 총 볼륨, 화면용 ID는 읽을 때 계산합니다. 기본 기구는 앱에 포함하며 Firestore에는 직접 추가한 기구와 숨긴 기본 기구 ID만 저장합니다. `defaultMachine`은 Firestore 저장 필드가 아닙니다.

규칙은 로그인 UID가 경로의 UID와 같은 경우만 읽기·쓰기·삭제를 허용합니다. 비로그인, 다른 사용자 경로, 사용자 루트 문서, 다른 컬렉션과 더 깊은 하위 컬렉션은 거부합니다. 기록 제목은 1~100자, 메모는 `null` 또는 2,000자 이하 문자열, 운동 목록은 1~30개로 제한합니다. 기구는 지정된 부위·기구 종류, 이름 1~100자, 제조사 `null` 또는 100자 이하 문자열만 허용합니다. 허용 목록에 없는 최상위 필드는 거부하며 작성·수정 시간은 서버 타임스탬프로 검증합니다.

**중첩 운동·세트 배열의 모든 원소를 서버 규칙에서 검증하지는 않습니다.** Firestore Rules에는 임의 길이 목록을 반복 검사하는 기능이 없어 최상위 필드 타입·운동 개수·소유권을 검증하고, 개별 운동과 세트의 상세 검증은 앱에서 수행합니다. 사용자가 클라이언트를 우회하면 자기 문서의 중첩 배열에 잘못된 값을 넣을 수 있습니다. 현재 보안 경계는 사용자별 접근 격리이며 다른 사용자의 데이터 권한을 주지는 않습니다. 날짜 규칙은 형식을 검증하고 실제 달력 날짜 여부는 앱에서 검사합니다. [Firestore 필드·타입 검증의 한계](https://firebase.google.com/docs/firestore/security/rules-fields).

`firestore.indexes.json`은 검색하지 않는 `exercises` 배열의 인덱스를 제외합니다. 기록 검색과 필터는 불러온 사용자 기록에서 수행하며 추가 복합 인덱스는 요구하지 않습니다. [Firestore 인덱스 관리](https://firebase.google.com/docs/firestore/query-data/indexing).

기존 H2 기록을 사용하려면 별도 내보내기·사용자 UID 매핑·가져오기 작업이 필요합니다. 이 변경은 기존 H2 데이터나 Java 백엔드를 삭제하거나 변환하지 않습니다.
