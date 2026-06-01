#!/bin/bash

set -euo pipefail

PROJECT_ROOT="/home/juno/health_logger"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "========================================="
echo "Health Logger 배포 준비"
echo "========================================="
echo ""

echo "[1/3] 프론트엔드 프로덕션 빌드"
cd "$FRONTEND_DIR"
npm run build
echo "✓ frontend/dist 생성 완료"
echo ""

echo "[2/3] 백엔드 테스트"
cd "$BACKEND_DIR"
DEBUG=false ./mvnw test
echo "✓ 백엔드 테스트 통과"
echo ""

echo "[3/3] 백엔드 패키징"
DEBUG=false ./mvnw clean package
echo "✓ target/backend-0.0.1-SNAPSHOT.jar 생성 완료"
echo ""

echo "========================================="
echo "배포 아티팩트 준비 완료"
echo "========================================="
echo ""
echo "다음 단계:"
echo "  1. sudo cp $PROJECT_ROOT/Caddyfile /etc/caddy/Caddyfile"
echo "  2. sudo bash $PROJECT_ROOT/setup-services.sh"
echo "  3. Cloudflare DNS에서 btc-trading-agent.com A 레코드를 서버 공인 IP로 연결"
echo ""
echo "배포 상세 절차:"
echo "  $PROJECT_ROOT/DEPLOYMENT.md"
