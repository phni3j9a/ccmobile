#!/bin/bash
#
# Claude Code Web Terminal - アンインストールスクリプト
#
# 使用方法:
#   chmod +x uninstall.sh
#   ./uninstall.sh
#
# オプション:
#   --all        node_modulesとsystemdサービスも削除
#   --service    systemdサービスのみ削除
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
    echo "Claude Code Web Terminal アンインストールスクリプト"
    echo ""
    echo "使用方法:"
    echo "  ./uninstall.sh [オプション]"
    echo ""
    echo "オプション:"
    echo "  --all        node_modulesとsystemdサービスも削除"
    echo "  --service    systemdサービスのみ削除"
    echo "  --help       このヘルプを表示する"
    echo ""
    echo "注意: このスクリプトはソースコードを削除しません"
    echo ""
}

# 引数解析
REMOVE_MODULES=false
REMOVE_SERVICE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            REMOVE_MODULES=true
            REMOVE_SERVICE=true
            shift
            ;;
        --service)
            REMOVE_SERVICE=true
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

log_info "Claude Code Web Terminal アンインストールを開始します..."

# 確認
echo ""
log_warn "以下の操作を実行します:"
if [ "$REMOVE_SERVICE" = true ]; then
    echo "  - systemdサービスの停止と削除"
fi
if [ "$REMOVE_MODULES" = true ]; then
    echo "  - node_modulesディレクトリの削除"
fi
echo ""
read -p "続行しますか？ (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    log_info "アンインストールをキャンセルしました"
    exit 0
fi

# systemdサービスの削除
if [ "$REMOVE_SERVICE" = true ]; then
    if systemctl list-unit-files | grep -q "claude-code-web.service"; then
        log_info "systemdサービスを停止中..."
        sudo systemctl stop claude-code-web 2>/dev/null || true
        sudo systemctl disable claude-code-web 2>/dev/null || true

        log_info "サービスファイルを削除中..."
        sudo rm -f /etc/systemd/system/claude-code-web.service
        sudo systemctl daemon-reload

        log_info "systemdサービスを削除しました"
    else
        log_info "systemdサービスは登録されていません"
    fi
fi

# node_modulesの削除
if [ "$REMOVE_MODULES" = true ]; then
    if [ -d "$PROJECT_DIR/node_modules" ]; then
        log_info "node_modulesを削除中..."
        rm -rf "$PROJECT_DIR/node_modules"
        log_info "node_modulesを削除しました"
    else
        log_info "node_modulesは存在しません"
    fi

    # package-lock.jsonも削除
    if [ -f "$PROJECT_DIR/package-lock.json" ]; then
        rm -f "$PROJECT_DIR/package-lock.json"
        log_info "package-lock.jsonを削除しました"
    fi
fi

# 完了メッセージ
echo ""
log_info "=========================================="
log_info "アンインストール完了!"
log_info "=========================================="
echo ""
log_info "ソースコードは削除されていません: $PROJECT_DIR"
log_info "完全に削除する場合は手動で削除してください:"
log_info "  rm -rf $PROJECT_DIR"
echo ""
