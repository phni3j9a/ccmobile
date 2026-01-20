# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Raspberry Pi 5上で動作するWebベースのターミナルアプリケーション。LAN内の他のデバイスからブラウザ経由でターミナル操作が可能。tmuxによるセッション永続化、PWA対応。

## コマンド

```bash
# サーバー起動（開発・本番共通）
npm start

# 依存関係インストール（node-ptyのネイティブビルドが走る）
npm install
```

## アーキテクチャ

### サーバー側 (server.js)
- Express + Socket.io でWebSocket通信
- node-pty でtmuxセッションにアタッチ
- セッション管理: `ccw_` プレフィックス付きでtmuxセッションを管理
- REST API: `/api/sessions` (一覧・削除・名前変更), `/api/usage/claude` (使用量取得)
- OAuthトークン自動リフレッシュ: `~/.claude/.credentials.json` を読み書き

### クライアント側 (public/)
- `index.html`: 単一ページ、セッション管理UI + 設定パネル + ターミナル
- `js/terminal.js`: xterm.js制御、Socket.io通信、セッション管理ロジック
- `css/style.css`: CSS変数によるダーク/ライトテーマ、モバイル対応レイアウト
- `sw.js`: Service Worker（PWAオフライン対応）

### 通信フロー
1. クライアントがSocket.io接続
2. `attach`イベントでセッション名を送信（未指定なら新規作成）
3. サーバーがtmuxセッションを作成/アタッチし、node-ptyプロセスを生成
4. `output`/`input`イベントでターミナルI/Oを中継
5. `detached`イベントでセッション切断を通知、クライアントはセッション一覧画面に遷移

### テーマシステム
- CSS変数 (`--bg-primary`, `--fg-primary` 等) で定義
- `[data-theme="light"]` / `[data-theme="dark"]` で切り替え
- xterm.jsテーマは `terminal.js` 内の `THEMES` オブジェクトで定義

## 依存関係

- `node-pty`: ネイティブモジュール、ビルドに `build-essential`, `python3` が必要
- tmux: システムにインストールが必要
