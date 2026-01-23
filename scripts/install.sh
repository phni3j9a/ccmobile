#!/bin/bash
#
# Claude Code Web Terminal - インストールスクリプト
#
# ワンライナーインストール:
#   curl -fsSL https://raw.githubusercontent.com/phni3j9a/ccmobile/main/scripts/install.sh | bash
#
# オプション:
#   --auto         非対話モード（すべてデフォルト値を使用）
#   --with-deps    依存関係も自動インストール
#   --service      systemdサービスとして登録する
#   --port PORT    ポート番号を指定（デフォルト: 3000）
#   --help         ヘルプを表示する
#

set -e

# 定数
REPO_URL="https://github.com/phni3j9a/ccmobile.git"
REPO_NAME="claude-code-web"
DEFAULT_PORT=3000
DEFAULT_INSTALL_DIR="$HOME/$REPO_NAME"

# 色付きの出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
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

log_step() {
    echo -e "${BLUE}[STEP]${NC} ${BOLD}$1${NC}"
}

# ヘルプ表示
show_help() {
    cat << EOF
${BOLD}Claude Code Web Terminal インストールスクリプト${NC}

${CYAN}ワンライナーインストール:${NC}
  curl -fsSL https://raw.githubusercontent.com/phni3j9a/ccmobile/main/scripts/install.sh | bash

${CYAN}使用方法:${NC}
  ./install.sh [オプション]

${CYAN}オプション:${NC}
  --auto         非対話モード（すべてデフォルト値を使用）
  --with-deps    依存関係も自動インストール（sudo権限が必要）
  --service      systemdサービスとして登録する
  --port PORT    ポート番号を指定（デフォルト: $DEFAULT_PORT）
  --dir DIR      インストール先ディレクトリを指定
  --help         このヘルプを表示する

${CYAN}例:${NC}
  # 対話モードでインストール
  ./install.sh

  # 自動インストール（依存関係含む、サービス登録あり）
  ./install.sh --auto --with-deps --service

  # カスタムポートでインストール
  ./install.sh --port 8080 --service

EOF
}

# OS検出
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        PKG_MANAGER="brew"
    elif [[ -f /etc/debian_version ]]; then
        OS="debian"
        PKG_MANAGER="apt"
    elif [[ -f /etc/redhat-release ]]; then
        OS="redhat"
        PKG_MANAGER="dnf"
    elif [[ -f /etc/arch-release ]]; then
        OS="arch"
        PKG_MANAGER="pacman"
    else
        OS="unknown"
        PKG_MANAGER="unknown"
    fi
    log_info "検出されたOS: $OS (パッケージマネージャ: $PKG_MANAGER)"
}

# curlから直接実行されたかどうかを検出
is_piped() {
    [[ ! -t 0 ]] || [[ "$0" == "bash" ]] || [[ "$0" == "-bash" ]] || [[ "$0" == "/bin/bash" ]]
}

# 依存関係のインストール
install_dependencies() {
    log_step "依存関係をインストール中..."

    case $PKG_MANAGER in
        apt)
            sudo apt update
            sudo apt install -y nodejs npm tmux build-essential python3 git curl
            ;;
        brew)
            brew install node tmux git
            ;;
        dnf)
            sudo dnf install -y nodejs npm tmux gcc-c++ make python3 git curl
            ;;
        pacman)
            sudo pacman -Sy --noconfirm nodejs npm tmux base-devel python git curl
            ;;
        *)
            log_error "サポートされていないパッケージマネージャです"
            log_error "手動で以下をインストールしてください: nodejs, npm, tmux, git, build-essential"
            return 1
            ;;
    esac

    log_info "依存関係のインストール完了"
}

# コマンド存在確認
check_command() {
    if ! command -v $1 &> /dev/null; then
        return 1
    fi
    return 0
}

# 依存関係チェック
check_dependencies() {
    log_step "依存関係を確認中..."

    local missing=()

    if ! check_command node; then
        missing+=("nodejs")
    else
        log_info "  node: $(node -v)"
    fi

    if ! check_command npm; then
        missing+=("npm")
    else
        log_info "  npm: $(npm -v)"
    fi

    if ! check_command tmux; then
        missing+=("tmux")
    else
        log_info "  tmux: $(tmux -V)"
    fi

    if ! check_command git; then
        missing+=("git")
    else
        log_info "  git: $(git --version | cut -d' ' -f3)"
    fi

    # ビルドツールの確認
    if ! check_command gcc || ! check_command make; then
        log_warn "ビルドツール（gcc, make）が見つかりません"
        log_warn "node-ptyのコンパイルに必要です"
        missing+=("build-essential")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo ""
        log_warn "不足している依存関係: ${missing[*]}"
        return 1
    fi

    # Node.jsバージョン確認
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$node_version" -lt 18 ]]; then
        log_error "Node.js 18以上が必要です（現在: $(node -v)）"
        return 1
    fi

    log_info "すべての依存関係が満たされています"
    return 0
}

# ユーザー入力取得（デフォルト値付き）
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local result

    if [[ "$AUTO_MODE" == "true" ]]; then
        echo "$default"
        return
    fi

    read -p "$prompt [$default]: " result
    echo "${result:-$default}"
}

# Yes/No確認
confirm() {
    local prompt="$1"
    local default="${2:-n}"

    if [[ "$AUTO_MODE" == "true" ]]; then
        [[ "$default" == "y" ]] && return 0 || return 1
    fi

    local yn
    if [[ "$default" == "y" ]]; then
        read -p "$prompt [Y/n]: " yn
        [[ -z "$yn" || "$yn" =~ ^[Yy] ]] && return 0 || return 1
    else
        read -p "$prompt [y/N]: " yn
        [[ "$yn" =~ ^[Yy] ]] && return 0 || return 1
    fi
}

# 設定ウィザード
run_wizard() {
    echo ""
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}         Claude Code Web Terminal セットアップ${NC}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # ポート番号
    if [[ -z "$CONFIG_PORT" ]]; then
        CONFIG_PORT=$(prompt_with_default "ポート番号を入力してください" "$DEFAULT_PORT")
    fi

    # systemdサービス登録
    if [[ -z "$INSTALL_SERVICE" ]] && [[ "$OS" != "macos" ]]; then
        if confirm "systemdサービスとして登録しますか？（自動起動）"; then
            INSTALL_SERVICE=true
        else
            INSTALL_SERVICE=false
        fi
    fi

    # サービス開始
    if [[ "$INSTALL_SERVICE" == "true" ]]; then
        if confirm "インストール後すぐにサービスを開始しますか？" "y"; then
            START_SERVICE=true
        else
            START_SERVICE=false
        fi
    fi

    echo ""
    echo -e "${CYAN}設定内容:${NC}"
    echo "  ポート番号: $CONFIG_PORT"
    echo "  インストール先: $PROJECT_DIR"
    [[ "$OS" != "macos" ]] && echo "  systemdサービス: $INSTALL_SERVICE"
    [[ "$INSTALL_SERVICE" == "true" ]] && echo "  サービス開始: $START_SERVICE"
    echo ""

    if [[ "$AUTO_MODE" != "true" ]]; then
        if ! confirm "この設定で続行しますか？" "y"; then
            log_error "インストールをキャンセルしました"
            exit 1
        fi
    fi
}

# リポジトリのクローン
clone_repository() {
    log_step "リポジトリをクローン中..."

    if [[ -d "$PROJECT_DIR" ]]; then
        log_warn "ディレクトリが既に存在します: $PROJECT_DIR"
        if confirm "既存のディレクトリを削除して再クローンしますか？"; then
            rm -rf "$PROJECT_DIR"
        else
            log_info "既存のディレクトリを使用します"
            return 0
        fi
    fi

    git clone "$REPO_URL" "$PROJECT_DIR"
    log_info "クローン完了: $PROJECT_DIR"
}

# npmパッケージのインストール
install_npm_packages() {
    log_step "npmパッケージをインストール中..."
    cd "$PROJECT_DIR"
    npm install
    log_info "npmパッケージのインストール完了"
}

# .envファイルの作成
create_env_file() {
    if [[ -f "$PROJECT_DIR/.env" ]]; then
        log_info ".envファイルは既に存在します"
        return 0
    fi

    log_step ".envファイルを作成中..."
    cat > "$PROJECT_DIR/.env" << EOF
# Claude Code Web Terminal 設定
PORT=$CONFIG_PORT
HOST=0.0.0.0
SESSION_PREFIX=ccw_
LOG_LEVEL=info
EOF
    log_info ".envファイルを作成しました"
}

# systemdサービスの登録
setup_systemd_service() {
    if [[ "$OS" == "macos" ]]; then
        log_warn "macOSではsystemdは利用できません"
        return 0
    fi

    log_step "systemdサービスを設定中..."

    local service_file="$PROJECT_DIR/scripts/claude-code-web.service"
    if [[ ! -f "$service_file" ]]; then
        log_error "サービスファイルが見つかりません: $service_file"
        return 1
    fi

    # サービスファイルをカスタマイズ
    local temp_service="/tmp/claude-code-web.service"
    sed -e "s|/opt/claude-code-web|$PROJECT_DIR|g" \
        -e "s|User=ccw|User=$USER|g" \
        -e "s|Group=ccw|Group=$(id -gn)|g" \
        -e "s|PORT=3000|PORT=$CONFIG_PORT|g" \
        "$service_file" > "$temp_service"

    sudo cp "$temp_service" /etc/systemd/system/claude-code-web.service
    sudo systemctl daemon-reload
    sudo systemctl enable claude-code-web

    log_info "systemdサービスを登録しました"

    if [[ "$START_SERVICE" == "true" ]]; then
        log_step "サービスを開始中..."
        sudo systemctl start claude-code-web
        sleep 2
    fi
}

# インストールの検証
verify_installation() {
    log_step "インストールを検証中..."

    local verify_failed=false

    # ファイルの存在確認
    if [[ ! -f "$PROJECT_DIR/server.js" ]]; then
        log_error "server.jsが見つかりません"
        verify_failed=true
    fi

    if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
        log_error "node_modulesが見つかりません"
        verify_failed=true
    fi

    # サービス状態確認
    if [[ "$INSTALL_SERVICE" == "true" ]] && [[ "$START_SERVICE" == "true" ]]; then
        if systemctl is-active --quiet claude-code-web; then
            log_info "サービスは正常に稼働しています"

            # HTTPアクセステスト
            sleep 2
            if command -v curl &> /dev/null; then
                if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$CONFIG_PORT/health" | grep -q "200"; then
                    log_info "HTTPヘルスチェック: OK"
                else
                    log_warn "HTTPヘルスチェック: 応答なし（起動中の可能性があります）"
                fi
            fi
        else
            log_error "サービスの起動に失敗しました"
            log_error "ログを確認: sudo journalctl -u claude-code-web -n 50"
            verify_failed=true
        fi
    fi

    if [[ "$verify_failed" == "true" ]]; then
        return 1
    fi

    log_info "検証完了: インストールは正常です"
    return 0
}

# 完了メッセージ
show_completion_message() {
    local ip_addr
    ip_addr=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_IP")

    echo ""
    echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}${BOLD}         インストール完了!${NC}"
    echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if [[ "$INSTALL_SERVICE" == "true" ]] && [[ "$START_SERVICE" == "true" ]]; then
        echo -e "${CYAN}サーバーは稼働中です${NC}"
        echo ""
        echo "  ブラウザでアクセス:"
        echo -e "    ${BOLD}http://localhost:$CONFIG_PORT${NC}"
        echo -e "    ${BOLD}http://$ip_addr:$CONFIG_PORT${NC}"
        echo ""
        echo "  サービス管理:"
        echo "    sudo systemctl status claude-code-web   # 状態確認"
        echo "    sudo systemctl restart claude-code-web  # 再起動"
        echo "    sudo systemctl stop claude-code-web     # 停止"
        echo "    sudo journalctl -u claude-code-web -f   # ログ確認"
    else
        echo -e "${CYAN}サーバーを起動するには:${NC}"
        echo ""
        echo "  cd $PROJECT_DIR"
        echo "  npm start"
        echo ""
        echo "  ブラウザでアクセス:"
        echo -e "    ${BOLD}http://localhost:$CONFIG_PORT${NC}"
        echo -e "    ${BOLD}http://$ip_addr:$CONFIG_PORT${NC}"

        if [[ "$INSTALL_SERVICE" == "true" ]]; then
            echo ""
            echo "  systemdサービスを開始:"
            echo "    sudo systemctl start claude-code-web"
        fi
    fi

    echo ""
    echo -e "${CYAN}ドキュメント:${NC}"
    echo "  https://github.com/phni3j9a/ccmobile"
    echo ""
}

# メイン処理
main() {
    # 引数解析
    AUTO_MODE=false
    WITH_DEPS=false
    INSTALL_SERVICE=
    START_SERVICE=false
    CONFIG_PORT=
    CUSTOM_DIR=

    while [[ $# -gt 0 ]]; do
        case $1 in
            --auto)
                AUTO_MODE=true
                shift
                ;;
            --with-deps)
                WITH_DEPS=true
                shift
                ;;
            --service)
                INSTALL_SERVICE=true
                shift
                ;;
            --port)
                CONFIG_PORT="$2"
                shift 2
                ;;
            --dir)
                CUSTOM_DIR="$2"
                shift 2
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

    # デフォルト値設定
    [[ -z "$CONFIG_PORT" ]] && CONFIG_PORT=$DEFAULT_PORT
    [[ -z "$INSTALL_SERVICE" ]] && INSTALL_SERVICE=false

    echo ""
    echo -e "${BOLD}Claude Code Web Terminal インストーラー${NC}"
    echo ""

    # OS検出
    detect_os

    # インストールディレクトリの決定
    if [[ -n "$CUSTOM_DIR" ]]; then
        PROJECT_DIR="$CUSTOM_DIR"
    elif is_piped; then
        # curlから実行された場合
        PROJECT_DIR="$DEFAULT_INSTALL_DIR"
        log_info "ワンライナーインストールを検出しました"
    else
        # スクリプトから直接実行された場合
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
    fi

    log_info "インストール先: $PROJECT_DIR"

    # 依存関係チェック
    if ! check_dependencies; then
        if [[ "$WITH_DEPS" == "true" ]]; then
            install_dependencies
            # 再チェック
            if ! check_dependencies; then
                log_error "依存関係のインストールに失敗しました"
                exit 1
            fi
        else
            echo ""
            log_error "必要な依存関係が不足しています"
            echo ""
            echo "以下のいずれかを実行してください:"
            echo ""
            echo "  1. 依存関係を手動でインストール:"
            case $PKG_MANAGER in
                apt)
                    echo "     sudo apt install nodejs npm tmux build-essential python3 git"
                    ;;
                brew)
                    echo "     brew install node tmux git"
                    ;;
                *)
                    echo "     nodejs, npm, tmux, git, build-essential をインストール"
                    ;;
            esac
            echo ""
            echo "  2. --with-deps オプションで自動インストール:"
            echo "     curl -fsSL https://raw.githubusercontent.com/phni3j9a/ccmobile/main/scripts/install.sh | bash -s -- --with-deps"
            echo ""
            exit 1
        fi
    fi

    # curlから実行された場合はリポジトリをクローン
    if is_piped || [[ ! -f "$PROJECT_DIR/server.js" ]]; then
        clone_repository
    fi

    # 設定ウィザード
    run_wizard

    # npmパッケージのインストール
    install_npm_packages

    # .envファイル作成
    create_env_file

    # systemdサービス設定
    if [[ "$INSTALL_SERVICE" == "true" ]]; then
        setup_systemd_service
    fi

    # 検証
    verify_installation

    # 完了メッセージ
    show_completion_message
}

# エントリーポイント
main "$@"
