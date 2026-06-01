# btc-trading-agent.com 배포 가이드

현재 프로젝트는 다음 구조로 배포합니다.

- 프론트엔드: Caddy가 `/var/www/health-logger` 정적 파일 서빙
- 백엔드: Spring Boot JAR를 systemd 서비스로 실행
- 도메인: `btc-trading-agent.com`
- API: `/api/*`를 `127.0.0.1:8081`로 프록시

## 현재 확인된 상태

- 이 서버의 Caddy는 이미 동작 중입니다.
- 다만 기존 설정은 예전 BTC 앱 기준이어서, 현재 repo의 `Caddyfile`로 교체해야 합니다.
- `btc-trading-agent.com` DNS 레코드는 아직 응답하지 않으므로 Cloudflare에서 연결이 필요합니다.

## 1. 서버에서 배포 아티팩트 만들기

```bash
cd /home/juno/health_logger
bash deploy.sh
```

이 단계에서 다음이 생성됩니다.

- `frontend/dist`
- `backend/target/backend-0.0.1-SNAPSHOT.jar`

## 2. systemd와 Caddy 반영

```bash
cd /home/juno/health_logger
sudo bash setup-services.sh
```

이 스크립트는 다음 작업을 수행합니다.

- `frontend/dist`를 `/var/www/health-logger`로 복사
- `health-logger-backend.service` 생성
- `/etc/caddy/Caddyfile`을 repo의 `Caddyfile`로 교체
- Caddy 설정 검증
- 백엔드/Caddy 재시작

## 2.5 Google OAuth 환경변수

회원별 로그인 저장을 쓰려면 `/home/juno/health_logger/.env` 파일에 아래 값을 넣으세요.

```bash
GOOGLE_AUTH_ENABLED=true
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=your_google_client_id
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=your_google_client_secret
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,profile,email
```

Google Cloud Console의 승인된 리디렉션 URI:

```text
https://btc-trading-agent.com/login/oauth2/code/google
```

`setup-services.sh`는 backend systemd 서비스에 이 `.env`를 자동 연결합니다.

## 3. Cloudflare DNS 연결

Cloudflare 대시보드에서 `btc-trading-agent.com` 존으로 들어가서 DNS를 추가하세요.

- 타입: `A`
- 이름: `@`
- 값: 이 서버의 공인 IP
- Proxy status: `Proxied` 권장

원하면 `www`도 추가할 수 있습니다.

- 타입: `CNAME`
- 이름: `www`
- 값: `btc-trading-agent.com`

이 환경에서는 `wrangler whoami` 결과가 비인증 상태라 Cloudflare DNS를 자동 생성하지는 못합니다.

## 4. 확인

로컬 서버 상태:

```bash
sudo systemctl status health-logger-backend --no-pager
sudo systemctl status caddy --no-pager
curl -I http://127.0.0.1
curl -s http://127.0.0.1/api/workouts | head
```

외부 확인:

```bash
dig +short btc-trading-agent.com
curl -I https://btc-trading-agent.com
```

## 문제 해결

### 도메인이 안 열릴 때

1. Cloudflare DNS가 이 서버 IP를 가리키는지 확인
2. 80/443 포트가 열려 있는지 확인
3. Caddy가 새 설정으로 재시작됐는지 확인

### 백엔드가 안 붙을 때

```bash
sudo journalctl -u health-logger-backend -n 100 --no-pager
ss -tulpn | rg ':8081'
```

### Caddy가 안 붙을 때

```bash
sudo journalctl -u caddy -n 100 --no-pager
sudo caddy validate --config /etc/caddy/Caddyfile
```
