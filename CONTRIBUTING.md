# Contributing to Claude Code Web Terminal

このプロジェクトへの貢献に興味を持っていただきありがとうございます！

## Issue の報告

### バグ報告

バグを見つけた場合は、[Issue](https://github.com/phni3j9a/ccmobile/issues) を作成してください。

以下の情報を含めてください:

1. **環境情報**
   - OS（例: Raspberry Pi OS, Ubuntu 22.04, macOS 14）
   - Node.js バージョン（`node -v`）
   - tmux バージョン（`tmux -V`）
   - ブラウザとバージョン

2. **再現手順**
   - バグを再現するための具体的な手順

3. **期待される動作**
   - 本来どのように動作すべきか

4. **実際の動作**
   - 実際に起こった動作
   - エラーメッセージがあれば全文を記載

5. **ログ**
   ```bash
   # サーバーログの取得
   sudo journalctl -u claude-code-web -n 100
   ```

### 機能リクエスト

新機能のアイデアがある場合も Issue を作成してください。

- 機能の概要
- その機能が必要な理由（ユースケース）
- 可能であれば、実装のアイデア

## Pull Request

### 開発環境のセットアップ

```bash
# リポジトリをフォーク & クローン
git clone https://github.com/YOUR_USERNAME/ccmobile.git
cd claude-code-web

# 依存関係のインストール
npm install

# 開発サーバーの起動
npm start
```

### コーディング規約

- **インデント**: スペース 2 つ
- **セミコロン**: あり
- **文字列**: シングルクォート優先
- **変数**: `const` 優先、必要な場合のみ `let`
- **コメント**: 日本語 OK（コードは英語）

### コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/) に従ってください:

```
<type>: <description>

[optional body]
```

**type の種類:**

| type | 説明 |
|------|------|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `style` | コードの意味に影響しない変更（空白、フォーマット等） |
| `refactor` | バグ修正でも機能追加でもないコード変更 |
| `perf` | パフォーマンス改善 |
| `test` | テストの追加・修正 |
| `chore` | ビルドプロセスやツールの変更 |

**例:**

```
feat: セッション名の編集機能を追加

- ダブルクリックでセッション名を編集可能に
- 空の名前は許可しない
- 重複チェックを追加
```

### PR の作成手順

1. **ブランチを作成**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **変更を実装**

3. **動作確認**
   - サーバーが正常に起動するか
   - 既存機能が壊れていないか
   - 新機能が期待通り動作するか

4. **コミット & プッシュ**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push origin feat/your-feature-name
   ```

5. **Pull Request を作成**
   - 変更内容の概要を記載
   - 関連する Issue があればリンク
   - スクリーンショットがあれば添付

### レビュープロセス

- PR はレビュー後にマージされます
- 修正が必要な場合はコメントでお知らせします
- CI チェックが通らない場合は修正してください

## 質問・相談

不明点がある場合は、Issue で質問してください。`question` ラベルを付けていただけると助かります。

## ライセンス

貢献いただいたコードは [MIT License](LICENSE) の下で公開されます。
