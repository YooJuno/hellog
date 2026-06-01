# HelloG

Java Spring Boot 백엔드, React 프론트엔드, H2 파일 DB로 만든 운동 기록 앱입니다.

## 기능

- `기록하기`: 부위 선택 → 기구 선택 → 세트별 kg/횟수 기록
- `기록보기`: 검색, 부위, 날짜 범위로 이전 기록 필터링
- `나의 헬스장`: 기본 기구 확인, 내 헬스장 기구 추가/삭제

## 로컬 실행

백엔드:

```bash
cd backend
DEBUG=false ./mvnw spring-boot:run
```

프론트:

```bash
cd frontend
DEBUG= npm run dev -- --host 0.0.0.0
```

브라우저:

- PC: `http://localhost:5173`
- 같은 와이파이의 폰: `http://<PC_IP>:5173`

API:

- 운동 기록: `http://localhost:8081/api/workouts`
- 기구 목록: `http://localhost:8081/api/machines`

## 프로덕션 배포

도메인 `btc-trading-agent.com` 기준 Caddy 배포 파일이 포함되어 있습니다.

```bash
bash deploy.sh
sudo bash setup-services.sh
```

Cloudflare DNS에서 `btc-trading-agent.com`의 `A` 레코드를 이 서버 공인 IP로 연결해야 실제 외부 접속이 됩니다.

자세한 순서는 [DEPLOYMENT.md](/home/juno/health_logger/DEPLOYMENT.md)에서 확인할 수 있습니다.

## Google 로그인 설정

회원별 데이터 저장을 쓰려면 backend 서비스가 Google OAuth 설정을 읽어야 합니다.

루트에 `.env` 파일을 두고 다음 값을 넣으세요.

```bash
GOOGLE_AUTH_ENABLED=true
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=your_google_client_id
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=your_google_client_secret
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,profile,email
```

Google Cloud Console OAuth 승인된 리디렉션 URI에는 이 주소를 넣으면 됩니다.

```text
https://btc-trading-agent.com/login/oauth2/code/google
```

## DB

운동 기록은 H2 파일 DB에 저장됩니다.

- 위치: `backend/data/health-logger.mv.db`
- 콘솔: `http://localhost:8081/h2-console`
- JDBC URL: `jdbc:h2:file:./data/health-logger`
# hellog
