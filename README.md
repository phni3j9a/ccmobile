# Claude Code Web Terminal for Mobile

Raspberry Pi 5 上で動作する **Web ベースのターミナルアプリケーション**です。
LAN 内の他のデバイス（PC、スマートフォン、タブレット）からブラウザ経由でターミナル操作ができます。

## 特徴

- **ブラウザからターミナルアクセス** - xterm.js による本格的なターミナル体験
- **モバイル対応** - タッチ操作に最適化された特殊キーツールバー
- **セッション永続化** - tmux によりブラウザを閉じてもセッション維持
- **PWA 対応** - ホーム画面に追加してアプリのように使用可能
- **自動再接続** - 接続断時に自動的に復旧
- **Claude Code 使用量表示** - OAuth トークン自動リフレッシュ対応
- **ダーク/ライトテーマ** - 好みに合わせてテーマを切り替え
- **セキュリティ強化** - Helmet によるセキュリティヘッダー、入力検証

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                   クライアント（ブラウザ）                    │
│  ┌───────────┐  ┌────────────┐  ┌───────────────────────┐   │
│  │  xterm.js │  │  Socket.io │  │  PWA (ServiceWorker) │   │
│  │ ターミナル │←→│    通信    │  │   オフライン対応      │   │
│  └───────────┘  └────────────┘  └───────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓↑ WebSocket
┌─────────────────────────────────────────────────────────────┐
│                    サーバー (Node.js)                        │
│  ┌────────┐  ┌────────────┐  ┌───────────────────────────┐  │
│  │Express │  │  Socket.io │  │        node-pty          │  │
│  │静的配信│  │   接続管理  │  │   擬似ターミナル制御      │  │
│  └────────┘  └────────────┘  └───────────────────────────┘  │
│                            ↓↑                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                        tmux                            ││
│  │          セッション永続化・マルチプレクサ                 ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 必要要件

- Node.js 18+
- tmux
- Linux / macOS / WSL2

## 対応環境

| 環境 | 対応状況 |
|------|----------|
| Raspberry Pi | 推奨。常時稼働に最適 |
| Linux PC/サーバー | 問題なく動作 |
| macOS | Homebrew で tmux をインストールすれば動作 |
| Windows (WSL2) | WSL2 上で動作 |

## クイックスタート（自動インストール）

Raspberry Pi / Linux 環境では、インストールスクリプトを使用できます：

```bash
git clone https://github.com/phni3j9a/ccmobile.git
cd claude-code-web
./scripts/install.sh
```

このスクリプトは以下を自動で行います：
- 依存パッケージのインストール（Node.js, tmux, build-essential）
- npm パッケージのインストール
- systemd サービスの登録（オプション）

## 手動インストール

### Raspberry Pi / Linux の場合

#### 1. Node.js のインストール

```bash
# Node.js 18.x をインストール
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# バージョン確認
node -v  # v18.x.x と表示されればOK
```

#### 2. tmux のインストール

```bash
sudo apt install -y tmux
```

#### 3. ビルドツールのインストール（node-pty のコンパイルに必要）

```bash
sudo apt install -y build-essential python3
```

#### 4. アプリのセットアップ

```bash
git clone https://github.com/phni3j9a/ccmobile.git
cd claude-code-web
npm install
```

---

### macOS の場合

#### 1. Homebrew のインストール（未導入の場合）

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### 2. Node.js と tmux のインストール

```bash
brew install node tmux
```

#### 3. アプリのセットアップ

```bash
git clone https://github.com/phni3j9a/ccmobile.git
cd claude-code-web
npm install
```

---

### Windows (WSL2) の場合

#### 1. WSL2 のインストール（未導入の場合）

PowerShell を管理者権限で開いて実行：

```powershell
wsl --install
```

再起動後、Ubuntu などのディストリビューションを設定します。

#### 2. WSL2 内で必要なパッケージをインストール

WSL2 のターミナルで実行：

```bash
# Node.js 18.x をインストール
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# tmux とビルドツール
sudo apt install -y tmux build-essential python3
```

#### 3. アプリのセットアップ

```bash
git clone https://github.com/phni3j9a/ccmobile.git
cd claude-code-web
npm install
```

#### 4. ネットワーク設定（重要）

WSL2 はデフォルトで NAT 経由のため、LAN 内の他デバイスからアクセスするには追加設定が必要です。

**方法 A: ポートフォワーディング（推奨）**

PowerShell を管理者権限で実行：

```powershell
# WSL2 の IP アドレスを取得
wsl hostname -I

# ポートフォワーディングを設定（WSL_IP は上で取得した IP に置き換え）
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=WSL_IP

# ファイアウォールでポートを許可
netsh advfirewall firewall add rule name="Claude Code Web" dir=in action=allow protocol=tcp localport=3000
```

**方法 B: WSL2 のミラーモード（Windows 11 22H2以降）**

`%USERPROFILE%\.wslconfig` ファイルを作成：

```ini
[wsl2]
networkingMode=mirrored
```

WSL を再起動：

```powershell
wsl --shutdown
```

---

## 設定

### 環境変数

`.env` ファイルを作成するか、環境変数で設定を上書きできます。

```bash
# .env.example をコピーして編集
cp .env.example .env
```

| 変数名 | デフォルト値 | 説明 |
|--------|--------------|------|
| `PORT` | `3000` | サーバーのポート番号 |
| `HOST` | `0.0.0.0` | バインドするホスト |
| `SESSION_PREFIX` | `ccw_` | tmux セッション名のプレフィックス |
| `LOG_LEVEL` | `info` | ログレベル（debug, info, warn, error） |

---

## 使い方

### サーバー起動

```bash
npm start
```

サーバーは `http://0.0.0.0:3000` で起動します。

### アクセス

同じ LAN 内のデバイスから以下の URL でアクセス：

```
http://<Raspberry Pi の IP アドレス>:3000
```

例: `http://192.168.1.100:3000`

## 機能詳細

### セッション管理

- セッション名は `ccw_` プレフィックス付きで自動生成
- 複数セッションの作成・切り替え・削除が可能
- ブラウザを閉じてもセッションは維持される
- 設定パネルから現在のセッションを切断可能

### Claude Code 使用量表示

設定パネルで Claude Code の使用状況を確認できます。

- `~/.claude/.credentials.json` から認証情報を読み取り
- OAuth アクセストークンの自動リフレッシュ対応
- Pro/Max プランの使用量制限を表示

### モバイル向け UI

| 機能 | 説明 |
|------|------|
| 特殊キーツールバー | Esc, Tab, Ctrl+C/D/L/Z, 矢印キー, PgUp/PgDn |
| スクロールモード | tmux コピーモードで履歴をスクロール |
| クリップボード操作 | コピー/ペーストボタン |

### 設定

- **テーマ**: ダーク/ライトテーマを切り替え
- **フォントサイズ**: 10px〜24px で調整可能

設定は LocalStorage に保存され、次回アクセス時に復元されます。

## ファイル構成

```
claude-code-web/
├── server.js           # Express + Socket.io サーバー
├── config.js           # 設定管理（環境変数対応）
├── package.json        # 依存関係定義
├── .env.example        # 環境変数テンプレート
├── public/
│   ├── index.html      # フロントエンド HTML
│   ├── js/
│   │   └── terminal.js # ターミナル制御ロジック
│   ├── css/
│   │   └── style.css   # レスポンシブ CSS（テーマ対応）
│   ├── icons/
│   │   └── icon.svg    # アプリアイコン
│   ├── manifest.json   # PWA マニフェスト
│   └── sw.js           # Service Worker
├── scripts/
│   ├── install.sh      # インストールスクリプト
│   ├── uninstall.sh    # アンインストールスクリプト
│   └── claude-code-web.service  # systemd サービスファイル
├── SECURITY.md         # セキュリティガイドライン
├── CHANGELOG.md        # 変更履歴
├── LICENSE             # MIT ライセンス
├── EULA.md             # エンドユーザーライセンス契約
└── THIRD_PARTY.md      # サードパーティライセンス
```

## 技術スタック

- **フロントエンド**
  - [xterm.js](https://xtermjs.org/) - ターミナルエミュレータ
  - [Socket.io Client](https://socket.io/) - WebSocket 通信
  - Service Worker - PWA / オフライン対応

- **バックエンド**
  - [Express](https://expressjs.com/) - Web サーバー
  - [Socket.io](https://socket.io/) - リアルタイム通信
  - [node-pty](https://github.com/microsoft/node-pty) - 擬似ターミナル
  - [Helmet](https://helmetjs.github.io/) - セキュリティヘッダー
  - [tmux](https://github.com/tmux/tmux) - セッション管理

## 自動起動の設定（systemd）

インストールスクリプトを使用した場合、自動的に設定されます。
手動で設定する場合は以下の手順を参照してください。

### 1. サービスファイルのコピー

```bash
sudo cp scripts/claude-code-web.service /etc/systemd/system/
```

サービスファイルを環境に合わせて編集（ユーザー名とパスを変更）：

```bash
sudo nano /etc/systemd/system/claude-code-web.service
```

### 2. サービスの有効化と起動

```bash
# デーモンをリロード
sudo systemctl daemon-reload

# 自動起動を有効化
sudo systemctl enable claude-code-web

# サービスを起動
sudo systemctl start claude-code-web

# 状態確認
sudo systemctl status claude-code-web
```

### 3. ログの確認

```bash
# リアルタイムでログを見る
sudo journalctl -u claude-code-web -f
```

## API エンドポイント

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/sessions` | セッション一覧取得 |
| DELETE | `/api/sessions/:name` | セッション削除 |
| PUT | `/api/sessions/:name/rename` | セッション名変更 |
| GET | `/api/usage/claude` | Claude Code 使用量取得 |
| GET | `/health` | ヘルスチェック |

## セキュリティについて

> **重要**: このアプリケーションは **信頼できる LAN 内** または **VPN（Tailscale 等）経由** での使用を前提としています。

詳細なセキュリティガイドラインは [SECURITY.md](./SECURITY.md) を参照してください。

### 設計上の前提

- HTTP で動作するため、通信は暗号化されません
- 認証機能は実装されていません（アクセスできれば誰でも操作可能）
- サーバーを起動したユーザーの権限でターミナルが動作します

### 安全に使用するために

| 環境 | 安全性 | 説明 |
|------|--------|------|
| 自宅 LAN 内 | 安全 | 信頼できるネットワーク内での使用 |
| Tailscale / WireGuard 経由 | 安全 | VPN で暗号化されるため外出先からも安全 |
| インターネットに直接公開 | **危険** | **絶対に行わないでください** |

### やってはいけないこと

- ルーターのポートフォワーディングで外部公開
- クラウドサーバーでの公開運用（VPN なし）
- 公共 Wi-Fi での LAN 内アクセス

## 外出先からのアクセス（Tailscale）

自宅の LAN 外からアクセスするには VPN が必要です。**Tailscale** が最も簡単です。

### 1. Raspberry Pi に Tailscale をインストール

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

表示される URL をブラウザで開いて認証します。

### 2. スマホに Tailscale をインストール

App Store / Google Play から「Tailscale」をインストールし、同じアカウントでログイン。

### 3. 接続

Tailscale が割り当てた IP アドレス（100.x.x.x）でアクセス：

```
http://100.x.x.x:3000
```

Tailscale の管理画面で Raspberry Pi の IP を確認できます。

## トラブルシューティング

### 接続できない

```bash
# Raspberry Pi の IP アドレスを確認
hostname -I

# ポート 3000 が開いているか確認
sudo ss -tlnp | grep 3000

# ファイアウォールでポートを許可（UFW の場合）
sudo ufw allow 3000
```

### 日本語が文字化けする

```bash
# ロケール設定
sudo raspi-config
# Localisation Options → Locale → ja_JP.UTF-8 を選択
```

### node-pty のインストールでエラー

```bash
# ビルドツールを確認
sudo apt install -y build-essential python3

# Node.js のバージョンを確認（v18 以上推奨）
node -v
```

### tmux セッションが残り続ける

```bash
# セッション一覧を確認
tmux list-sessions

# 手動で削除
tmux kill-session -t セッション名
```

アプリの UI からもセッション削除が可能です。

### Claude Code 使用量が取得できない

- `~/.claude/.credentials.json` ファイルが存在するか確認
- Claude Code で一度ログインが必要です
- トークンの有効期限切れの場合は Claude Code で再認証してください

## アンインストール

```bash
./scripts/uninstall.sh
```

systemd サービスの停止・削除、設定ファイルの削除を行います。

## ライセンス

MIT - 詳細は [LICENSE](./LICENSE) を参照してください。

サードパーティライセンスについては [THIRD_PARTY.md](./THIRD_PARTY.md) を参照してください。
