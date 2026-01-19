# Claude Code Web Terminal

Raspberry Pi 5 上で動作する **Web ベースのターミナルアプリケーション**です。  
LAN 内の他のデバイス（PC、スマートフォン、タブレット）からブラウザ経由でターミナル操作ができます。

## 特徴

- 🖥️ **ブラウザからターミナルアクセス** - xterm.js による本格的なターミナル体験
- 📱 **モバイル対応** - タッチ操作に最適化された特殊キーツールバー
- 🔄 **セッション永続化** - tmux によりブラウザを閉じてもセッション維持
- 📲 **PWA 対応** - ホーム画面に追加してアプリのように使用可能
- 🔌 **自動再接続** - 接続断時に自動的に復旧

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

## インストール

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
git clone https://github.com/your-username/claude-code-web.git
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
git clone https://github.com/your-username/claude-code-web.git
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
git clone https://github.com/your-username/claude-code-web.git
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

### モバイル向け UI

| 機能 | 説明 |
|------|------|
| 特殊キーツールバー | Esc, Tab, Ctrl+C/D/L/Z, 矢印キー, PgUp/PgDn |
| スクロールモード | tmux コピーモードで履歴をスクロール |
| クリップボード操作 | コピー/ペーストボタン |
| クイックアクション | `claude`, `clear`, `exit` ボタン |

### 設定

- **フォントサイズ**: 10px〜24px で調整可能
- **カスタムコマンド**: よく使うコマンドをボタンとして追加

設定は LocalStorage に保存され、次回アクセス時に復元されます。

## ファイル構成

```
claude-code-web/
├── server.js           # Express + Socket.io サーバー
├── package.json        # 依存関係定義
├── public/
│   ├── index.html      # フロントエンド HTML
│   ├── js/
│   │   └── terminal.js # ターミナル制御ロジック
│   ├── css/
│   │   └── style.css   # レスポンシブ CSS
│   ├── icons/
│   │   └── icon.svg    # アプリアイコン
│   ├── manifest.json   # PWA マニフェスト
│   └── sw.js           # Service Worker
└── README.md
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
  - [tmux](https://github.com/tmux/tmux) - セッション管理

## 自動起動の設定（systemd）

Raspberry Pi の再起動後も自動でサーバーを起動させる設定です。

### 1. サービスファイルの作成

```bash
sudo nano /etc/systemd/system/claude-code-web.service
```

以下の内容を記述（ユーザー名とパスは環境に合わせて変更）：

```ini
[Unit]
Description=Claude Code Web Terminal
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/claude-code-web
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
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

## セキュリティについて

> **⚠️ 重要**: このアプリケーションは **信頼できる LAN 内** または **VPN（Tailscale 等）経由** での使用を前提としています。

### 設計上の前提

- HTTP で動作するため、通信は暗号化されません
- 認証機能は実装されていません（アクセスできれば誰でも操作可能）
- サーバーを起動したユーザーの権限でターミナルが動作します

### 安全に使用するために

| 環境 | 安全性 | 説明 |
|------|--------|------|
| 自宅 LAN 内 | ✅ 安全 | 信頼できるネットワーク内での使用 |
| Tailscale / WireGuard 経由 | ✅ 安全 | VPN で暗号化されるため外出先からも安全 |
| インターネットに直接公開 | ❌ 危険 | **絶対に行わないでください** |

### やってはいけないこと

- ルーターのポートフォワーディングで外部公開
- クラウドサーバーでの公開運用（VPN なし）
- 公共 Wi-Fi での LAN 内アクセス

Tailscale を使用すれば、HTTP のままでも WireGuard による暗号化トンネル内を通信するため、安全に外出先からアクセスできます。

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

## ライセンス

MIT
