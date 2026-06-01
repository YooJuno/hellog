# 🚀 Health Logger - Caddy 배포 설정 완료

Caddy를 사용하여 **hellog.com**에 배포할 준비가 모두 완료되었습니다!

## 📦 생성된 파일

| 파일 | 설명 |
|------|------|
| **Caddyfile** | Caddy 리버스 프록시 설정 |
| **QUICK_START.md** | ⭐ 빠른 시작 가이드 (읽어주세요!) |
| **DEPLOYMENT.md** | 상세 배포 및 문제 해결 가이드 |
| **deploy-init.sh** | 초기 설정 자동화 스크립트 |
| **deploy.sh** | 배포 자동화 스크립트 |
| **setup-services.sh** | Systemd 서비스 자동화 스크립트 |

## 🎯 배포 구조

```
hellog.com (Caddy - 자동 HTTPS)
├─ 프론트엔드 (React - /dist/)
│  └─ 정적 파일 서빙
│
└─ /api/* (백엔드 - Spring Boot:8081)
   └─ 모든 API 요청 프록시
```

## ⚡ 30초 배포 가이드

### 1️⃣ 초기 설정 (처음 한 번)
```bash
cd /home/juno/health_logger
./deploy-init.sh
```

### 2️⃣ 배포 (매번)
```bash
./deploy.sh
```

### 3️⃣ 백엔드 + Caddy 시작

**터미널 1:**
```bash
cd /home/juno/health_logger/backend
./mvnw spring-boot:run
```

**터미널 2:**
```bash
sudo caddy run --config /home/juno/health_logger/Caddyfile
```

✅ **https://hellog.com** 에서 확인!

## 🔧 자동 시작 설정 (Systemd)

한 번의 명령어로 시스템 부팅 시 자동 실행:
```bash
./setup-services.sh
```

## 📝 변경사항

### Backend (`BackendApplication.java`)
- ✅ CORS 설정 추가
- ✅ hellog.com 허용
- ✅ 로컬 개발 환경도 지원

### Frontend (설정 변경 없음)
- ✅ 이미 상대 경로 `/api/` 사용 중
- ✅ Vite 개발 서버에 프록시 설정 완료

## 🌐 접근 가능한 주소

| 주소 | 설명 |
|------|------|
| https://hellog.com | 프론트엔드 |
| https://hellog.com/api/workouts | API 엔드포인트 |
| https://hellog.com/api/machines | API 엔드포인트 |

## 📚 다음 단계

1. **[QUICK_START.md](./QUICK_START.md)** 읽기 ⭐ (필수!)
2. `./deploy-init.sh` 실행
3. 백엔드와 Caddy 시작
4. https://hellog.com 접속 확인

혹시 문제가 있으면 **[DEPLOYMENT.md](./DEPLOYMENT.md)**의 "문제 해결" 섹션을 참고하세요.

---

**Happy Deployment! 🎉**
