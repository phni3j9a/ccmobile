#!/bin/bash
#
# Claude Code Web Terminal - インストールスクリプト
#
# 使用方法:
#   chmod +x install.sh
#   ./install.sh
#
# オプション:
#   --service    systemdサービスとして登録する
#   --help       ヘルプを表示する
#

set -e

# 色付きの出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ログ関数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ヘルプ表示
show_help() {
    echo "Claude Code Web Terminal インストールスクリプト"
    echo ""
    echo "使用方法:"
    echo "  ./install.sh [オプション]"
    echo ""
    echo "オプション:"
    echo "  --service    systemdサービスとして登録する"
    echo "  --help       このヘルプを表示する"
    echo ""
}

# 引数解析
INSTALL_SERVICE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --service)
            INSTALL_SERVICE=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "不明なオプション: $1"
            show_help
            exit 1
            ;;
    esac
done

# 作業ディレクトリ
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

log_info "Claude Code Web Terminal インストールを開始します..."
log_info "インストール先: $PROJECT_DIR"

# 必要なコマンドの確認
log_info "依存関係を確認中..."

check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 がインストールされていません"
        return 1
    fi
    log_info "  $1: $(command -v $1)"
    return 0
}

MISSING_DEPS=false

if ! check_command node; then
    MISSING_DEPS=true
fi

if ! check_command npm; then
    MISSING_DEPS=true
fi

if ! check_command tmux; then
    log_warn "tmux がインストールされていません"
    log_warn "インストールコマンド: sudo apt install tmux"
    MISSING_DEPS=true
fi

if [ "$MISSING_DEPS" = true ]; then
    log_error "必要な依存関係が不足しています"
    log_error "上記のコマンドをインストールしてから再実行してください"
    exit 1
fi

# Node.jsバージョン確認
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js 18以上が必要です（現在: $(node -v)）"
    exit 1
fi
log_info "Node.js バージョン: $(node -v)"

# ビルドツールの確認（node-pty用）
if ! command -v gcc &> /dev/null || ! command -v make &> /dev/null; then
    log_warn "ビルドツールがインストールされていない可能性があります"
    log_warn "node-ptyのビルドに必要: build-essential, python3"
    log_warn "インストールコマンド: sudo apt install build-essential python3"
fi

# npmパッケージのインストール
log_info "npmパッケージをインストール中..."
cd "$PROJECT_DIR"
npm install

if [ $? -ne 0 ]; then
    log_error "npm install に失敗しました"
    exit 1
fi

log_info "npmパッケージのインストール完了"

# .envファイルの作成（存在しない場合）
if [ ! -f "$PROJECT_DIR/.env" ] && [ -f "$PROJECT_DIR/.env.example" ]; then
    log_info ".envファイルを作成中..."
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    log_info ".env ファイルを作成しました（必要に応じて編集してください）"
fi

# systemdサービスの登録
if [ "$INSTALL_SERVICE" = true ]; then
    log_info "systemdサービスを登録中..."

    if [ ! -f "$SCRIPT_DIR/claude-code-web.service" ]; then
        log_error "サービスファイルが見つかりません: $SCRIPT_DIR/claude-code-web.service"
        exit 1
    fi

    # サービスファイルのパスを更新
    TEMP_SERVICE="/tmp/claude-code-web.service"
    sed "s|/opt/claude-code-web|$PROJECT_DIR|g" "$SCRIPT_DIR/claude-code-web.service" > "$TEMP_SERVICE"
    sed -i "s|User=ccw|User=$USER|g" "$TEMP_SERVICE"
    sed -i "s|Group=ccw|Group=$USER|g" "$TEMP_SERVICE"

    sudo cp "$TEMP_SERVICE" /etc/systemd/system/claude-code-web.service
    sudo systemctl daemon-reload
    sudo systemctl enable claude-code-web

    log_info "systemdサービスを登録しました"
    log_info "サービスを開始するには: sudo systemctl start claude-code-web"
    log_info "ステータス確認: sudo systemctl status claude-code-web"
fi

# 完了メッセージ
echo ""
log_info "=========================================="
log_info "インストール完了!"
log_info "=========================================="
echo ""
log_info "サーバーを起動するには:"
log_info "  cd $PROJECT_DIR"
log_info "  npm start"
echo ""
log_info "ブラウザでアクセス:"
log_info "  http://localhost:3000"
log_info "  http://$(hostname -I | awk '{print $1}'):3000"
echo ""
