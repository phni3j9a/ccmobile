# セキュリティガイドライン

Claude Code Web Terminalを安全に運用するためのガイドラインです。

---

## 重要な注意事項

**本ソフトウェアは、信頼できるLAN環境での使用を前提に設計されています。**

認証機能は実装されていないため、ネットワークにアクセスできる人は誰でもターミナルを操作できます。公開ネットワークでの使用は、適切なセキュリティ対策を講じた上で、自己責任で行ってください。

---

## 推奨されるセキュリティ対策

### 1. ネットワークレベルの保護

#### ファイアウォール設定
```bash
# UFWでポート3000をLAN内のみに制限する例
sudo ufw allow from 192.168.0.0/16 to any port 3000
sudo ufw deny 3000
```

#### VPNの使用
外部からアクセスする場合は、VPN経由での接続を強く推奨します：
- WireGuard
- OpenVPN
- Tailscale

### 2. リバースプロキシによる認証追加

Nginxを使用して基本認証を追加する例：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        auth_basic "Restricted";
        auth_basic_user_file /etc/nginx/.htpasswd;

        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. システムレベルの保護

#### 専用ユーザーでの実行
```bash
# 専用ユーザーを作成
sudo useradd -r -s /bin/bash -d /opt/claude-code-web ccw

# 権限を制限
sudo chown -R ccw:ccw /opt/claude-code-web
```

#### systemdによるサンドボックス化
付属の`scripts/claude-code-web.service`には以下のセキュリティ設定が含まれています：
- `NoNewPrivileges=true`
- `ProtectSystem=strict`
- `ProtectHome=read-only`

---

## セキュリティチェックリスト

### デプロイ前
- [ ] ファイアウォールでポートを制限している
- [ ] デフォルトのポート(3000)を変更している（任意）
- [ ] 専用ユーザーで実行している
- [ ] systemdサービスファイルを使用している

### 公開環境の場合（追加）
- [ ] VPNを設定している
- [ ] またはリバースプロキシで認証を追加している
- [ ] HTTPS（SSL/TLS）を有効にしている
- [ ] ログを監視している

---

## 実装済みのセキュリティ機能

### 1. コマンドインジェクション対策
- `execSync`の代わりに`execFileSync`を使用
- セッション名の入力検証（英数字、ハイフン、アンダースコア、ドットのみ許可）

### 2. セキュリティヘッダー（Helmet）
- Content Security Policy (CSP)
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection
- その他のセキュリティヘッダー

### 3. 認証情報の保護
- credentials.jsonファイルの権限を600に設定
- 認証トークンの自動リフレッシュ

---

## 脆弱性の報告

セキュリティ上の問題を発見した場合は、購入元のプラットフォームを通じてご連絡ください。

**公開の場で脆弱性を報告しないでください。**

---

## 免責事項

本ガイドラインに従った場合でも、セキュリティが完全に保証されるわけではありません。セキュリティは継続的なプロセスであり、定期的な見直しと更新が必要です。

本ソフトウェアの使用に起因するセキュリティインシデントについて、開発者は責任を負いません。
