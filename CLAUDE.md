# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Raspberry Pi 5上で動作するWebベースのターミナルアプリケーション「Claude Code Web Terminal for Mobile」。LAN内の他のデバイスからブラウザ経由でターミナル操作が可能。tmuxによるセッション永続化、PWA対応。モバイルでのClaude Code操作に最適化。

## コマンド

```bash
# 依存関係インストール（node-ptyのネイティブビルドが走る）
npm install

# 開発時: 別ポートでテストサーバー起動（本番に影響しない）
PORT=3001 node server.js

# PM2でのサーバー管理（本番運用）
pm2 restart claude-code-web   # 再起動
pm2 logs claude-code-web      # ログ確認
pm2 status                    # 状態確認
```

## 本番環境

- **PM2で常時起動**: `claude-code-web` という名前で登録済み
- 変更を反映するには `pm2 restart claude-code-web` が必要
- テスト時は `PORT=3001 node server.js` で別ポートで起動し、本番環境に影響を与えずに検証できる

## アーキテクチャ

### サーバー側 (server.js)
- Express + Socket.io でWebSocket通信
- Helmet.jsによるセキュリティヘッダー
- node-pty でtmuxセッションにアタッチ
- セッション管理: `ccw_` プレフィックス付きでtmuxセッションを管理
- REST API:
  - `/api/sessions`: セッション一覧・削除・名前変更
  - `/api/usage/claude`: Claude Code使用量取得
  - `/health`: ヘルスチェック
- OAuthトークン自動リフレッシュ: `~/.claude/.credentials.json` を読み書き
- グレースフルシャットダウン対応（SIGTERM/SIGINT）

### クライアント側 (public/)
- `index.html`: 単一ページ、セッション管理UI + 設定パネル + ターミナル
- `js/terminal.js`: xterm.js制御、Socket.io通信、セッション管理ロジック
- `css/style.css`: CSS変数によるダーク/ライトテーマ、モバイル対応レイアウト
- `sw.js`: Service Worker（PWAオフライン対応）
- `icons/icon.svg`: アプリアイコン

### 主要な機能

#### セッション管理
- セッション一覧表示・作成・削除・名前変更
- セッションタブバー（複数セッション間の切り替え）
- 画面端スワイプによるセッション切り替え（左端→前、右端→次）
- `switch`イベントによるデタッチなしのセッション切り替え

#### スクロールモード
- tmuxコピーモードと連携（Ctrl+b [）
- タッチスワイプで半ページスクロール（Ctrl+u/Ctrl+d）
- PgUp/PgDnボタンでのスクロール
- alternateバッファ（vim等）検出による動作切り替え

#### 使用量インジケーター
- ステータスバーに5時間/7日間制限を常時表示
- 5分間隔で自動更新
- クリックで設定パネルの詳細表示へ

#### その他UI機能
- トースト通知システム
- コピー/ペーストボタン
- フォントサイズ調整
- ダーク/ライトテーマ切り替え
- 仮想キーボード対応（visualViewport API）

### 通信フロー
1. クライアントがSocket.io接続
2. `attach`イベントでセッション名を送信（未指定なら新規作成）
3. サーバーがtmuxセッションを作成/アタッチし、node-ptyプロセスを生成
4. `output`/`input`イベントでターミナルI/Oを中継
5. `switch`イベントでセッション切り替え（PTYを再接続）
6. `detached`イベントでセッション切断を通知、クライアントはセッション一覧画面に遷移

### テーマシステム
- CSS変数 (`--bg-primary`, `--fg-primary` 等) で定義
- `[data-theme="light"]` / `[data-theme="dark"]` で切り替え
- xterm.jsテーマは `terminal.js` 内の `THEMES` オブジェクトで定義

## ファイル構成

```
ccmobile/
├── server.js           # メインサーバー
├── config.js           # 設定（ポート、ホスト、セッションプレフィックス等）
├── public/
│   ├── index.html      # メインHTML
│   ├── manifest.json   # PWAマニフェスト
│   ├── sw.js           # Service Worker
│   ├── css/style.css   # スタイル
│   ├── js/terminal.js  # クライアントロジック
│   └── icons/          # アプリアイコン
├── scripts/            # ユーティリティスクリプト
├── CHANGELOG.md        # 変更履歴
├── CONTRIBUTING.md     # コントリビューションガイド
├── SECURITY.md         # セキュリティポリシー
└── README.md           # プロジェクト説明
```

## 依存関係

- `node-pty`: ネイティブモジュール、ビルドに `build-essential`, `python3` が必要
- `helmet`: セキュリティヘッダー
- tmux: システムにインストールが必要
