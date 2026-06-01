#!/bin/bash

set -euo pipefail

PROJECT_ROOT="/home/juno/health_logger"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "========================================="
echo "Health Logger 초기 배포 점검"
echo "========================================="
echo ""

echo "[1/5] Caddy 설치 확인"
if ! command -v caddy >/dev/null 2>&1; then
    echo "Caddy가 설치되어 있지 않습니다."
    echo "설치 후 다시 실행하세요."
    exit 1
fi
echo "✓ Caddy: $(caddy version)"
echo ""

echo "[2/5] Java 확인"
if ! command -v java >/dev/null 2>&1; then
    echo "Java가 설치되어 있지 않습니다."
    exit 1
fi
java -version
echo ""

echo "[3/5] Node 확인"
if ! command -v npm >/dev/null 2>&1; then
    echo "npm이 설치되어 있지 않습니다."
    exit 1
fi
echo "✓ npm: $(npm --version)"
echo ""

echo "[4/5] 배포 파일 확인"
for path in "$PROJECT_ROOT/Caddyfile" "$BACKEND_DIR/pom.xml" "$FRONTEND_DIR/package.json"; do
    if [ ! -f "$path" ]; then
        echo "필수 파일이 없습니다: $path"
        exit 1
    fi
done
echo "✓ 배포 필수 파일 확인 완료"
echo ""

echo "[5/5] 방화벽 점검"
if command -v ufw >/dev/null 2>&1; then
    ufw status | sed -n '1,20p'
else
    echo "ufw 미사용 환경입니다. 80/443 포트 개방 여부만 확인하세요."
fi
echo ""

echo "========================================="
echo "초기 점검 완료"
echo "========================================="
echo ""
echo "다음 순서:"
echo "  1. bash $PROJECT_ROOT/deploy.sh"
echo "  2. sudo cp $PROJECT_ROOT/Caddyfile /etc/caddy/Caddyfile"
echo "  3. sudo bash $PROJECT_ROOT/setup-services.sh"
echo "  4. Cloudflare DNS에서 btc-trading-agent.com을 이 서버로 연결"
