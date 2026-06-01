# Health Logger Caddy 배포 - 빠른 시작 가이드

> **🌐 도메인**: https://hellog.com (자동 HTTPS)

## 📋 사전 요구사항

- ✅ Cloudflare에서 `hellog.com` → 공용 IP 연결 완료
- ✅ 시스템에 Caddy 설치 필요 (아래 참조)

## 🚀 빠른 배포 (30초)

### 1️⃣ 초기 설정 (처음 한 번만)

```bash
cd /home/juno/health_logger
./deploy-init.sh
```

이 스크립트가 다음을 자동으로 처리합니다:
- ✓ Caddy 설치 확인
- ✓ 포트 바인딩 권한 설정
- ✓ 프론트엔드 빌드
- ✓ 방화벽 설정 (선택)

### 2️⃣ 매번 배포할 때

```bash
cd /home/juno/health_logger
./deploy.sh
```

### 3️⃣ 백엔드 및 Caddy 시작

**터미널 1** - 백엔드:
```bash
cd /home/juno/health_logger/backend
./mvnw spring-boot:run
```

**터미널 2** - Caddy (리버스 프록시):
```bash
sudo caddy run --config /home/juno/health_logger/Caddyfile
```

✅ 완료! https://hellog.com 접속 가능

---

## 🔧 Systemd 서비스로 자동 시작 (권장)

백그라운드에서 자동으로 실행되도록 설정:

```bash
cd /home/juno/health_logger
./setup-services.sh
```

이제 시스템 부팅 시 자동으로 시작됩니다.

**서비스 관리**:
```bash
# 상태 확인
sudo systemctl status backend-spring
sudo systemctl status caddy

# 재시작
sudo systemctl restart backend-spring
sudo systemctl restart caddy

# 로그 확인
sudo journalctl -u backend-spring -f
sudo journalctl -u caddy -f
```

---

## 📁 배포 구조

```
hellog.com
├── / (루트)
│   └── 프론트엔드 (React SPA)
│       └── /dist/* 정적 파일 서빙
│
└── /api/* 
    └── localhost:8081 (Spring Boot 백엔드)
```

---

## 🔗 접근 가능한 URL

| URL | 설명 |
|-----|------|
| `https://hellog.com` | 프론트엔드 홈페이지 |
| `https://hellog.com/api/workouts` | API - 운동 기록 |
| `https://hellog.com/api/machines` | API - 머신 목록 |

---

## 📝 주요 파일

| 파일 | 용도 |
|------|------|
| `Caddyfile` | Caddy 설정 (리버스 프록시) |
| `deploy-init.sh` | 초기 설정 (처음 한 번) |
| `deploy.sh` | 빌드 및 배포 스크립트 |
| `setup-services.sh` | Systemd 서비스 설정 |
| `DEPLOYMENT.md` | 상세 배포 가이드 |

---

## ⚡ 빠른 문제 해결

### Caddy가 시작되지 않음
```bash
# 1. 권한 확인
sudo setcap cap_net_bind_service=+ep /usr/bin/caddy

# 2. 로그 확인
sudo journalctl -u caddy -n 50

# 3. 포트 충돌 확인
sudo lsof -i :80,443
```

### API가 연결되지 않음
```bash
# 1. 백엔드 실행 확인
lsof -i :8081

# 2. 백엔드 로그 확인
sudo journalctl -u backend-spring -n 50

# 3. Caddy 설정 확인
sudo caddy validate --config /home/juno/health_logger/Caddyfile
```

### SSL 인증서 문제
```bash
# 캐시 초기화
rm -rf ~/.local/share/caddy/
sudo systemctl restart caddy
```

---

## 📚 상세 가이드

더 자세한 정보는 [DEPLOYMENT.md](./DEPLOYMENT.md) 참고

---

## 💡 팁

- **자동 HTTPS**: Caddy가 Let's Encrypt와 자동으로 연동 ✅
- **자동 갱신**: SSL 인증서 자동 갱신 ✅
- **압축**: Caddy가 자동으로 gzip 압축 지원 ✅
- **재시작 없음**: 프론트엔드 파일은 실시간 변경 감지 ✅

---

**배포 완료! 🎉**
