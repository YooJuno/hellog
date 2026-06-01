#!/bin/bash

set -euo pipefail

PROJECT_ROOT="/home/juno/health_logger"
BACKEND_DIR="$PROJECT_ROOT/backend"
CADDYFILE_SRC="$PROJECT_ROOT/Caddyfile"
CADDYFILE_DEST="/etc/caddy/Caddyfile"
WEB_ROOT="/var/www/health-logger"
SERVICE_NAME="health-logger-backend.service"
SERVICE_PATH="/etc/systemd/system/$SERVICE_NAME"
USER_NAME="juno"

echo "========================================="
echo "Health Logger 시스템 서비스 설정"
echo "========================================="
echo ""

echo "[1/5] 프론트엔드 빌드"
cd "$PROJECT_ROOT/frontend"
npm run build
sudo chown -R "$USER_NAME":"$USER_NAME" "$PROJECT_ROOT/frontend/dist"
echo "✓ frontend/dist 준비 완료"
echo ""

echo "[2/5] 정적 파일 배포"
sudo mkdir -p "$WEB_ROOT"
sudo cp -r "$PROJECT_ROOT/frontend/dist/." "$WEB_ROOT/"
sudo chown -R root:root "$WEB_ROOT"
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} \;
sudo find "$WEB_ROOT" -type f -exec chmod 644 {} \;
echo "✓ $WEB_ROOT 반영 완료"
echo ""

echo "[3/5] 백엔드 패키징"
cd "$BACKEND_DIR"
DEBUG=false ./mvnw clean package
sudo chown -R "$USER_NAME":"$USER_NAME" "$BACKEND_DIR/target"
echo "✓ backend/target/backend-0.0.1-SNAPSHOT.jar 준비 완료"
echo ""

echo "[4/5] 백엔드 systemd 서비스 생성"
sudo tee "$SERVICE_PATH" > /dev/null <<EOF
[Unit]
Description=Health Logger Backend
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$BACKEND_DIR
EnvironmentFile=-$PROJECT_ROOT/.env
Environment=DEBUG=false
ExecStart=/usr/bin/java -jar $BACKEND_DIR/target/backend-0.0.1-SNAPSHOT.jar
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
echo "✓ $SERVICE_NAME 생성 완료"
echo ""

echo "[5/5] Caddy 설정 반영"
sudo cp "$CADDYFILE_SRC" "$CADDYFILE_DEST"
sudo caddy validate --config "$CADDYFILE_DEST"
echo "✓ /etc/caddy/Caddyfile 반영 완료"
echo ""

echo "[6/6] 서비스 재시작"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl restart caddy
echo "✓ 서비스 재시작 완료"
echo ""

echo "========================================="
echo "배포 서비스 반영 완료"
echo "========================================="
echo ""
echo "확인 명령어:"
echo "  sudo systemctl status $SERVICE_NAME --no-pager"
echo "  sudo systemctl status caddy --no-pager"
echo "  curl -I http://127.0.0.1"
