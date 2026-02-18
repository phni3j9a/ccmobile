const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
const { execFileSync, spawn } = require('child_process');
const helmet = require('helmet');
const multer = require('multer');
const config = require('./config');

// ===========================================
// 未処理例外ハンドラー（クラッシュ防止）
// ===========================================
process.on('uncaughtException', (err) => {
  console.error('未処理の例外（プロセス継続）:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('未処理のPromise拒否:', reason);
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 60000,
  pingInterval: 25000
});

// ===========================================
// セキュリティヘッダー
// ===========================================
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,  // デフォルト設定を無効化（upgrade-insecure-requestsを防ぐ）
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "wss:", "ws:", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrcAttr: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// ===========================================
// 入力検証関数
// ===========================================

/**
 * セッション名を検証する
 * 英数字、ハイフン、アンダースコア、ドットのみ許可（1-50文字）
 * @param {string} name - 検証するセッション名
 * @returns {string} 検証済みのセッション名
 * @throws {Error} 無効なセッション名の場合
 */
function validateSessionName(name) {
  if (typeof name !== 'string') {
    throw new Error('セッション名は文字列である必要があります');
  }
  if (!/^[a-zA-Z0-9_\-\.]{1,50}$/.test(name)) {
    throw new Error('無効なセッション名です。英数字、ハイフン、アンダースコア、ドットのみ使用可能（1-50文字）');
  }
  return name;
}

/**
 * プレフィックス付きのフルセッション名を取得
 * @param {string} sessionName - セッション名
 * @returns {string} プレフィックス付きのセッション名
 */
function getFullSessionName(sessionName) {
  const name = sessionName.startsWith(config.SESSION_PREFIX)
    ? sessionName.replace(config.SESSION_PREFIX, '')
    : sessionName;
  validateSessionName(name);
  return config.SESSION_PREFIX + name;
}

/**
 * ファイルパスを検証する（ファイルマネージャーAPI用）
 * HOMEディレクトリ配下のみ許可、シンボリックリンク解決後も再検証
 * @param {string} filePath - 検証するファイルパス
 * @param {boolean} allowNew - 存在しないパスを許可するか
 * @returns {string} 検証済みの絶対パス
 * @throws {Error} 無効なパスの場合
 */
function validateFilePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error('パスが指定されていません');
  }

  const homeDir = process.env.HOME;
  const resolved = path.resolve(filePath);

  // HOMEディレクトリ配下かチェック
  if (!resolved.startsWith(homeDir + '/') && resolved !== homeDir) {
    throw new Error('許可されたディレクトリ外へのアクセスです');
  }

  // シンボリックリンク解決後の再検証
  try {
    const real = fs.realpathSync(resolved);
    if (!real.startsWith(homeDir + '/') && real !== homeDir) {
      throw new Error('許可されたディレクトリ外へのアクセスです');
    }
    return real;
  } catch (e) {
    if (e.code === 'ENOENT') {
      // ファイルが存在しない場合はresolved pathを返す（新規作成用ではないが安全）
      return resolved;
    }
    throw e;
  }
}

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

// ===========================================
// tmux管理関数
// ===========================================

// tmuxセッション一覧取得
function listTmuxSessions() {
  try {
    const output = execFileSync('tmux', [
      'list-sessions',
      '-F', '#{session_name}|#{session_created}|#{pane_current_path}'
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

    const sessions = output.trim().split('\n')
      .filter(line => line.startsWith(config.SESSION_PREFIX))
      .map(line => {
        const [name, created, cwd] = line.split('|');
        return {
          name,
          displayName: name.replace(config.SESSION_PREFIX, ''),
          created: parseInt(created) * 1000,
          cwd: cwd || process.env.HOME
        };
      });

    return sessions;
  } catch (e) {
    // tmuxが起動していないか、セッションがない場合
    if (config.LOG_LEVEL === 'debug') {
      console.log('tmuxセッション一覧取得: セッションなしまたはエラー');
    }
    return [];
  }
}

// tmuxセッション作成
function createTmuxSession(sessionName) {
  try {
    const fullName = getFullSessionName(sessionName);

    execFileSync('tmux', [
      'new-session', '-d', '-s', fullName, '-c', process.env.HOME
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

    // tmux設定を適用（マウス操作有効化、スクロールバッファ増加）
    try {
      execFileSync('tmux', ['set-option', '-t', fullName, 'mouse', 'on'],
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      execFileSync('tmux', ['set-option', '-t', fullName, 'history-limit', '10000'],
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      // Escキーの遅延を減らす（vimなどでの操作性向上）
      execFileSync('tmux', ['set-option', '-t', fullName, 'escape-time', '10'],
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      // viモードに設定（Ctrl+u/dで半ページスクロール可能にする）
      execFileSync('tmux', ['set-window-option', '-t', fullName, 'mode-keys', 'vi'],
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (configErr) {
      console.error('tmux設定エラー（続行）:', configErr.message);
    }

    console.log('tmuxセッション作成:', fullName);
    return { success: true, name: fullName };
  } catch (e) {
    console.error('tmuxセッション作成エラー:', e.message);
    return { success: false, error: e.message };
  }
}

// tmuxセッションの設定を適用
function applyTmuxSettings(sessionName) {
  try {
    const fullName = getFullSessionName(sessionName);

    execFileSync('tmux', ['set-option', '-t', fullName, 'mouse', 'on'],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    execFileSync('tmux', ['set-option', '-t', fullName, 'history-limit', '10000'],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    execFileSync('tmux', ['set-option', '-t', fullName, 'escape-time', '10'],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    execFileSync('tmux', ['set-window-option', '-t', fullName, 'mode-keys', 'vi'],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    // 設定エラーは無視（既に設定済みの場合など）
    if (config.LOG_LEVEL === 'debug') {
      console.log('tmux設定適用スキップ:', e.message);
    }
  }
}

// tmuxセッションにアタッチ（PTY経由）
function attachTmuxSession(sessionName) {
  const fullName = getFullSessionName(sessionName);

  // アタッチ前に設定を適用（既存セッション用）
  applyTmuxSettings(fullName);

  const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', fullName], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: {
      ...process.env,
      LANG: 'ja_JP.UTF-8',
      LC_ALL: 'ja_JP.UTF-8',
      TERM: 'xterm-256color'
    }
  });

  console.log('tmuxセッションにアタッチ:', fullName, 'PID:', ptyProcess.pid);
  return ptyProcess;
}

// tmuxセッション削除
function killTmuxSession(sessionName) {
  try {
    const fullName = getFullSessionName(sessionName);

    execFileSync('tmux', ['kill-session', '-t', fullName],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log('tmuxセッション削除:', fullName);
    return { success: true };
  } catch (e) {
    console.error('tmuxセッション削除エラー:', e.message);
    return { success: false, error: e.message };
  }
}

// tmuxセッションが存在するか確認
function tmuxSessionExists(sessionName) {
  try {
    const fullName = getFullSessionName(sessionName);

    execFileSync('tmux', ['has-session', '-t', fullName],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch (e) {
    return false;
  }
}

// ユニークなセッション名を生成（1, 2, 3... のナンバリング）
function generateSessionName() {
  const sessions = listTmuxSessions();
  const usedNumbers = new Set(
    sessions
      .map(s => s.displayName)
      .filter(name => /^\d+$/.test(name))
      .map(name => parseInt(name, 10))
  );
  let num = 1;
  while (usedNumbers.has(num)) {
    num++;
  }
  return String(num);
}

// ===========================================
// REST API
// ===========================================

// セッション一覧取得
app.get('/api/sessions', (req, res) => {
  const sessions = listTmuxSessions();
  res.json(sessions);
});

// セッション削除
app.delete('/api/sessions/:name', (req, res) => {
  const { name } = req.params;
  const result = killTmuxSession(name);
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

// セッション名変更
app.put('/api/sessions/:name/rename', (req, res) => {
  const { name } = req.params;
  const { newName } = req.body;

  if (!newName || newName.trim() === '') {
    return res.status(400).json({ success: false, error: '新しい名前を指定してください' });
  }

  try {
    // 旧名と新名の両方を検証
    const oldFullName = getFullSessionName(name);
    validateSessionName(newName.trim());
    const newFullName = config.SESSION_PREFIX + newName.trim();

    execFileSync('tmux', ['rename-session', '-t', oldFullName, newFullName],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log('tmuxセッション名変更:', oldFullName, '->', newFullName);
    res.json({ success: true, name: newFullName, displayName: newName.trim() });
  } catch (e) {
    console.error('tmuxセッション名変更エラー:', e.message);
    res.status(400).json({ success: false, error: e.message });
  }
});

// ===========================================
// ファイルマネージャーAPI
// ===========================================

/**
 * ファイルがテキストファイルかどうかを判定
 */
function isTextFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (config.TEXT_EXTENSIONS.has(ext)) return true;
  if (config.TEXT_FILENAMES.has(fileName)) return true;
  return false;
}

/**
 * バイナリファイルかどうかをバイトチェックで判定
 * 先頭8KBにNULLバイトがあればバイナリ
 */
function isBinaryFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } catch (e) {
    return true; // 読めなければバイナリ扱い
  }
}

// ディレクトリ一覧取得（全ファイル）
app.get('/api/files/browse', (req, res) => {
  try {
    const dirPath = req.query.path || process.env.HOME;
    const validated = validateFilePath(dirPath);

    const stat = fs.statSync(validated);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, error: 'ディレクトリではありません' });
    }

    const showHidden = req.query.showHidden === 'true';
    const entries = fs.readdirSync(validated, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      // 隠しファイル/ディレクトリの表示制御
      if (!showHidden && entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        items.push({ name: entry.name, type: 'directory' });
      } else if (entry.isFile()) {
        try {
          const fileStat = fs.statSync(path.join(validated, entry.name));
          items.push({
            name: entry.name,
            type: 'file',
            size: fileStat.size,
            modified: fileStat.mtimeMs,
            isText: isTextFile(entry.name)
          });
        } catch (e) {
          // statエラーは無視
        }
      }
    }

    // ディレクトリ優先、同種内では名前順
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ success: true, path: validated, items });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// テキストファイルの内容取得
app.get('/api/files/read', (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'パスが指定されていません' });
    }

    const validated = validateFilePath(filePath);

    const stat = fs.statSync(validated);
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, error: 'ファイルではありません' });
    }

    // テキストファイル判定
    const fileName = path.basename(validated);
    if (!isTextFile(fileName) && isBinaryFile(validated)) {
      return res.status(400).json({ success: false, error: 'バイナリファイルは読み取りできません' });
    }

    if (stat.size > config.FILE_MAX_SIZE) {
      return res.status(400).json({ success: false, error: `ファイルサイズが大きすぎます（上限: ${config.FILE_MAX_SIZE / 1024 / 1024}MB）` });
    }

    const content = fs.readFileSync(validated, 'utf-8');
    res.json({ success: true, path: validated, content, size: stat.size, modified: stat.mtimeMs });
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.status(404).json({ success: false, error: 'ファイルが見つかりません' });
    }
    res.status(400).json({ success: false, error: e.message });
  }
});

// テキストファイルの保存（新規作成・上書き）
app.put('/api/files/write', (req, res) => {
  try {
    const { path: filePath, content } = req.body;

    if (!filePath) {
      return res.status(400).json({ success: false, error: 'パスが指定されていません' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'コンテンツが指定されていません' });
    }

    const validated = validateFilePath(filePath);

    // テキストファイル判定
    const fileName = path.basename(validated);
    if (!isTextFile(fileName)) {
      return res.status(400).json({ success: false, error: 'テキストファイルのみ書き込み可能です' });
    }

    const contentBytes = Buffer.byteLength(content, 'utf-8');
    if (contentBytes > config.FILE_MAX_SIZE) {
      return res.status(400).json({ success: false, error: `コンテンツが大きすぎます（上限: ${config.FILE_MAX_SIZE / 1024 / 1024}MB）` });
    }

    // 親ディレクトリが存在するか確認
    const dir = path.dirname(validated);
    if (!fs.existsSync(dir)) {
      return res.status(400).json({ success: false, error: '親ディレクトリが存在しません' });
    }

    fs.writeFileSync(validated, content, 'utf-8');
    console.log('ファイル保存:', validated);

    res.json({ success: true, path: validated, size: contentBytes });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ファイル削除
app.delete('/api/files/delete', (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'パスが指定されていません' });
    }

    const validated = validateFilePath(filePath);

    const stat = fs.statSync(validated);
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, error: 'ファイルではありません' });
    }

    fs.unlinkSync(validated);
    console.log('ファイル削除:', validated);

    res.json({ success: true });
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.status(404).json({ success: false, error: 'ファイルが見つかりません' });
    }
    res.status(400).json({ success: false, error: e.message });
  }
});

// ファイル名変更
app.put('/api/files/rename', (req, res) => {
  try {
    const { path: filePath, newName } = req.body;

    if (!filePath) {
      return res.status(400).json({ success: false, error: 'パスが指定されていません' });
    }
    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
      return res.status(400).json({ success: false, error: '新しい名前を指定してください' });
    }

    // パストラバーサル防止
    const trimmedName = newName.trim();
    if (trimmedName.includes('/') || trimmedName.includes('\\') || trimmedName === '.' || trimmedName === '..') {
      return res.status(400).json({ success: false, error: '無効なファイル名です' });
    }

    const validated = validateFilePath(filePath);

    if (!fs.existsSync(validated)) {
      return res.status(404).json({ success: false, error: 'ファイルが見つかりません' });
    }

    const dir = path.dirname(validated);
    const newPath = path.join(dir, trimmedName);

    // 新しいパスもHOME配下かチェック
    validateFilePath(newPath);

    if (fs.existsSync(newPath)) {
      return res.status(400).json({ success: false, error: '同名のファイルが既に存在します' });
    }

    fs.renameSync(validated, newPath);
    console.log('ファイル名変更:', validated, '->', newPath);

    res.json({ success: true, path: newPath, name: trimmedName });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ファイルダウンロード
app.get('/api/files/download', (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'パスが指定されていません' });
    }

    const validated = validateFilePath(filePath);

    const stat = fs.statSync(validated);
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, error: 'ファイルではありません' });
    }

    const fileName = path.basename(validated);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Length', stat.size);

    const stream = fs.createReadStream(validated);
    stream.pipe(res);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.status(404).json({ success: false, error: 'ファイルが見つかりません' });
    }
    res.status(400).json({ success: false, error: e.message });
  }
});

// 汎用ファイルアップロード（ファイルマネージャー用）
const fmStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = req.body.destination || process.env.HOME;
    try {
      const validated = validateFilePath(dest);
      if (!fs.existsSync(validated) || !fs.statSync(validated).isDirectory()) {
        return cb(new Error('保存先ディレクトリが存在しません'));
      }
      cb(null, validated);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    // オリジナル名を維持、衝突時はサフィックス追加
    let name = file.originalname;
    const dest = req.body.destination || process.env.HOME;
    try {
      const validated = validateFilePath(dest);
      let fullPath = path.join(validated, name);
      if (fs.existsSync(fullPath)) {
        const ext = path.extname(name);
        const base = path.basename(name, ext);
        let counter = 1;
        do {
          name = `${base}_${counter}${ext}`;
          fullPath = path.join(validated, name);
          counter++;
        } while (fs.existsSync(fullPath));
      }
      cb(null, name);
    } catch (e) {
      cb(null, file.originalname);
    }
  }
});

const fmUpload = multer({
  storage: fmStorage,
  limits: { fileSize: config.FILE_UPLOAD_MAX_SIZE }
});

app.post('/api/files/upload', fmUpload.array('files', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: 'ファイルが送信されませんでした' });
  }

  const results = req.files.map(f => ({
    path: f.path,
    filename: f.filename,
    size: f.size,
    mimetype: f.mimetype
  }));

  console.log('ファイルアップロード完了:', results.length, '件');
  res.json({ success: true, files: results });
});

// ===========================================
// 画像アップロード
// ===========================================

// アップロードディレクトリを作成
function ensureUploadDir() {
  if (!fs.existsSync(config.UPLOAD_DIR)) {
    fs.mkdirSync(config.UPLOAD_DIR, { recursive: true, mode: 0o755 });
    console.log('アップロードディレクトリ作成:', config.UPLOAD_DIR);
  }
}

// ファイル名を生成（YYYY-MM-DD_HHMMSS_<random6>.ext）
function generateFileName(originalName) {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timePart = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS
  const random = Math.random().toString(36).substring(2, 8);
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  return `${datePart}_${timePart}_${random}${ext}`;
}

// multer設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDir();
    cb(null, config.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, generateFileName(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (config.UPLOAD_ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('許可されていないファイル形式です。JPEG, PNG, GIF, WebPのみ対応しています。'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: config.UPLOAD_MAX_SIZE
  }
});

// 画像アップロードAPI
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '画像ファイルが送信されませんでした' });
  }

  const filePath = req.file.path;
  console.log('画像アップロード完了:', filePath);

  res.json({
    success: true,
    path: filePath,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

// multerエラーハンドラ
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `ファイルサイズが大きすぎます（上限: ${config.UPLOAD_MAX_SIZE / 1024 / 1024}MB）`
      });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next();
});

// 古い画像ファイルをクリーンアップ
function cleanupOldImages() {
  if (!fs.existsSync(config.UPLOAD_DIR)) {
    return;
  }

  const now = Date.now();
  const maxAge = config.UPLOAD_CLEANUP_DAYS * 24 * 60 * 60 * 1000;
  let cleanedCount = 0;

  try {
    const files = fs.readdirSync(config.UPLOAD_DIR);
    for (const file of files) {
      const filePath = path.join(config.UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);

      if (stats.isFile() && (now - stats.mtimeMs) > maxAge) {
        fs.unlinkSync(filePath);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`古い画像を${cleanedCount}件削除しました`);
    }
  } catch (e) {
    console.error('画像クリーンアップエラー:', e.message);
  }
}

// サーバー起動時にクリーンアップ
cleanupOldImages();

// 24時間ごとにクリーンアップ
setInterval(cleanupOldImages, 24 * 60 * 60 * 1000);

// ===========================================
// OAuthトークン管理
// ===========================================

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5分前にリフレッシュ

// Anthropic APIでアクセストークンを更新
async function refreshAccessToken(refreshToken) {
  const https = require('https');

  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString();

    const options = {
      hostname: 'console.anthropic.com',
      path: '/v1/oauth/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode === 200 && result.access_token) {
            resolve({
              success: true,
              accessToken: result.access_token,
              refreshToken: result.refresh_token || refreshToken,
              expiresIn: result.expires_in
            });
          } else {
            resolve({
              success: false,
              error: result.error_description || result.error || 'トークン更新に失敗しました',
              requireReauth: true
            });
          }
        } catch (e) {
          reject(new Error('レスポンスの解析に失敗しました'));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('タイムアウト'));
    });

    req.write(postData);
    req.end();
  });
}

// credentials.jsonを更新
function updateCredentials(newTokenData) {
  const fs = require('fs');
  const path = require('path');

  const credentialsPath = path.join(process.env.HOME, '.claude', '.credentials.json');

  try {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

    credentials.claudeAiOauth.accessToken = newTokenData.accessToken;
    if (newTokenData.refreshToken) {
      credentials.claudeAiOauth.refreshToken = newTokenData.refreshToken;
    }
    if (newTokenData.expiresIn) {
      credentials.claudeAiOauth.expiresAt = Date.now() + (newTokenData.expiresIn * 1000);
    }

    // セキュリティ: ファイル権限を600 (owner read/write only) に設定
    fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), {
      encoding: 'utf-8',
      mode: 0o600
    });
    console.log('credentials.json更新完了');
    return true;
  } catch (e) {
    console.error('credentials.json更新エラー:', e.message);
    return false;
  }
}

// トークンを検証し、必要に応じてリフレッシュ
async function ensureValidToken(oauth) {
  // expiresAtがない場合は有効とみなす
  if (!oauth.expiresAt) {
    return { valid: true, accessToken: oauth.accessToken };
  }

  const now = Date.now();
  const expiresAt = oauth.expiresAt;

  // バッファ時間を考慮して、期限切れ5分前からリフレッシュを試みる
  if (now < expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    // トークンはまだ有効
    return { valid: true, accessToken: oauth.accessToken };
  }

  // リフレッシュトークンがない場合
  if (!oauth.refreshToken) {
    return {
      valid: false,
      error: 'トークンの有効期限が切れています。Claude Codeで再認証してください',
      requireReauth: true
    };
  }

  console.log('トークンリフレッシュを実行中...');

  try {
    const result = await refreshAccessToken(oauth.refreshToken);

    if (result.success) {
      // credentials.jsonを更新
      updateCredentials(result);
      console.log('トークンリフレッシュ成功');
      return { valid: true, accessToken: result.accessToken };
    } else {
      return {
        valid: false,
        error: result.error || 'トークン更新に失敗しました',
        requireReauth: result.requireReauth
      };
    }
  } catch (e) {
    console.error('トークンリフレッシュエラー:', e.message);
    return {
      valid: false,
      error: 'トークン更新中にエラーが発生しました: ' + e.message,
      requireReauth: false
    };
  }
}

// Claude Code使用量取得
app.get('/api/usage/claude', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const https = require('https');

    const credentialsPath = path.join(process.env.HOME, '.claude', '.credentials.json');

    if (!fs.existsSync(credentialsPath)) {
      return res.json({ success: false, error: 'Claude Code認証情報が見つかりません' });
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    const oauth = credentials.claudeAiOauth;

    if (!oauth || !oauth.accessToken) {
      return res.json({ success: false, error: 'アクセストークンが見つかりません' });
    }

    // user:profileスコープが必要
    if (!oauth.scopes || !oauth.scopes.includes('user:profile')) {
      return res.json({
        success: false,
        error: 'user:profileスコープがありません。claude loginで再認証してください',
        requireReauth: true
      });
    }

    // トークンを検証し、必要に応じてリフレッシュ
    const tokenResult = await ensureValidToken(oauth);
    if (!tokenResult.valid) {
      return res.json({
        success: false,
        error: tokenResult.error,
        requireReauth: tokenResult.requireReauth || false
      });
    }
    const accessToken = tokenResult.accessToken;

    const options = {
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code/2.0.32',
        'Accept': 'application/json'
      }
    };
    
    const apiReq = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        // 既にレスポンス送信済みならスキップ（タイムアウトやエラーとの競合防止）
        if (res.headersSent) {
          return;
        }
        try {
          const parsed = JSON.parse(data);

          // HTTPステータスコードチェック
          if (apiRes.statusCode !== 200) {
            const errorMsg = parsed.error?.message || parsed.message || `API error: ${apiRes.statusCode}`;
            return res.json({
              success: false,
              error: errorMsg,
              requireReauth: apiRes.statusCode === 401
            });
          }

          // APIエラーレスポンスのチェック（type: "error"など）
          if (parsed.type === 'error' || parsed.error) {
            const errorMsg = parsed.error?.message || parsed.message || 'APIエラーが発生しました';
            return res.json({
              success: false,
              error: errorMsg,
              requireReauth: false
            });
          }

          res.json({
            success: true,
            usage: parsed,
            subscriptionType: oauth.subscriptionType || 'unknown'
          });
        } catch (e) {
          if (!res.headersSent) {
            res.json({ success: false, error: 'レスポンスの解析に失敗しました' });
          }
        }
      });
    });
    
    apiReq.on('error', (e) => {
      if (!res.headersSent) {
        res.json({ success: false, error: e.message });
      }
    });

    apiReq.setTimeout(5000, () => {
      apiReq.destroy();
      if (!res.headersSent) {
        res.json({ success: false, error: 'タイムアウト' });
      }
    });
    
    apiReq.end();
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ===========================================
// Socket.io接続処理
// ===========================================
io.on('connection', (socket) => {
  console.log('クライアント接続:', socket.id);

  let ptyProcess = null;
  let currentSessionName = null;
  let ptyId = 0; // 各PTYにユニークIDを割り当て

  // セッションに接続
  socket.on('attach', (data) => {
    let sessionName = data?.sessionName;

    // 既存のPTYがあれば切断（tmuxはkillしない）
    if (ptyProcess) {
      try {
        ptyProcess.kill();
      } catch (e) {
        console.error('既存PTY切断エラー:', e.message);
      }
      ptyProcess = null;
    }

    // セッション名が指定されていない場合は新規作成
    if (!sessionName) {
      sessionName = generateSessionName();
    }

    try {
      const fullName = getFullSessionName(sessionName);

      // セッションが存在しなければ作成
      if (!tmuxSessionExists(fullName)) {
        const result = createTmuxSession(fullName);
        if (!result.success) {
          socket.emit('error', { message: 'セッション作成に失敗しました', error: result.error });
          return;
        }
      }

      // tmuxセッションにアタッチ
      ptyProcess = attachTmuxSession(fullName);
      currentSessionName = fullName;
      const thisPtyId = ++ptyId; // このPTYのID

      // PTYからの出力をクライアントに送信（DA1/DA2レスポンスを除去）
      ptyProcess.onData((data) => {
        const filtered = data.replace(/\x1b\[[\?>]?[0-9;]*c/g, '');
        if (filtered) {
          socket.emit('output', filtered);
        }
      });

      // PTYプロセス終了時（デタッチ時も発火）
      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log('PTYプロセス終了, exitCode:', exitCode, 'signal:', signal, 'session:', currentSessionName, 'ptyId:', thisPtyId, 'currentPtyId:', ptyId);
        // 現在のPTYでなければ無視（切り替え中の古いPTY）
        if (thisPtyId !== ptyId) {
          console.log('古いPTYのonExit、無視します');
          return;
        }
        socket.emit('detached', { exitCode, signal, sessionName: currentSessionName });
        ptyProcess = null;
      });

      // 接続完了を通知
      socket.emit('attached', { sessionName: fullName, displayName: fullName.replace(config.SESSION_PREFIX, '') });
    } catch (e) {
      console.error('セッション接続エラー:', e.message);
      socket.emit('error', { message: 'セッション名が無効です', error: e.message });
    }
  });

  // クライアントからの入力をPTYに送信
  socket.on('input', (data) => {
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  });

  // ターミナルリサイズ
  socket.on('resize', ({ cols, rows }) => {
    if (ptyProcess) {
      try {
        ptyProcess.resize(cols, rows);
        console.log('リサイズ:', cols, 'x', rows);
      } catch (e) {
        console.error('リサイズエラー:', e.message);
      }
    }
  });

  // セッション切り替え（デタッチせずに別セッションへ）
  socket.on('switch', (data) => {
    const newSessionName = data?.sessionName;
    if (!newSessionName) {
      socket.emit('error', { message: 'セッション名が指定されていません' });
      return;
    }

    try {
      const fullName = getFullSessionName(newSessionName);

      // セッションが存在しなければエラー
      if (!tmuxSessionExists(fullName)) {
        socket.emit('error', { message: 'セッションが存在しません', error: fullName });
        return;
      }

      // 既存のPTYを終了（tmuxはkillしない）
      if (ptyProcess) {
        try {
          ptyProcess.kill();
        } catch (e) {
          console.error('PTY切断エラー（switch）:', e.message);
        }
        ptyProcess = null;
      }

      // 新しいセッションにアタッチ
      ptyProcess = attachTmuxSession(fullName);
      const oldSessionName = currentSessionName;
      currentSessionName = fullName;
      const thisPtyId = ++ptyId; // このPTYのID

      // PTYからの出力をクライアントに送信（DA1/DA2レスポンスを除去）
      ptyProcess.onData((data) => {
        const filtered = data.replace(/\x1b\[[\?>]?[0-9;]*c/g, '');
        if (filtered) {
          socket.emit('output', filtered);
        }
      });

      // PTYプロセス終了時
      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log('PTYプロセス終了（switch後）, exitCode:', exitCode, 'signal:', signal, 'session:', currentSessionName, 'ptyId:', thisPtyId, 'currentPtyId:', ptyId);
        // 現在のPTYでなければ無視（切り替え中の古いPTY）
        if (thisPtyId !== ptyId) {
          console.log('古いPTYのonExit、無視します');
          return;
        }
        socket.emit('detached', { exitCode, signal, sessionName: currentSessionName });
        ptyProcess = null;
      });

      // 切り替え完了を通知
      socket.emit('switched', {
        sessionName: fullName,
        displayName: fullName.replace(config.SESSION_PREFIX, ''),
        oldSessionName: oldSessionName
      });

      console.log('セッション切り替え:', oldSessionName, '->', fullName);
    } catch (e) {
      console.error('セッション切り替えエラー:', e.message);
      socket.emit('error', { message: 'セッション切り替えに失敗しました', error: e.message });
    }
  });

  // クライアントからのpingに応答
  socket.on('ping', () => {
    socket.emit('pong');
  });

  // 切断時はPTYを切断（tmuxセッションはkillしない）
  socket.on('disconnect', () => {
    console.log('クライアント切断:', socket.id, 'session:', currentSessionName);
    if (ptyProcess) {
      try {
        ptyProcess.kill();
      } catch (e) {
        console.error('PTY切断エラー:', e.message);
      }
      ptyProcess = null;
    }
    // tmuxセッションは維持される（killしない）
  });
});

// ===========================================
// ヘルスチェックエンドポイント
// ===========================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ===========================================
// サーバー起動とグレースフルシャットダウン
// ===========================================
server.listen(config.PORT, config.HOST, () => {
  console.log(`サーバー起動: http://${config.HOST}:${config.PORT}`);
  console.log('LAN内の他のデバイスからアクセス可能');
  if (config.LOG_LEVEL === 'debug') {
    console.log('デバッグモード有効');
  }
});

// グレースフルシャットダウン
function gracefulShutdown(signal) {
  console.log(`\n${signal}受信 - グレースフルシャットダウン開始...`);

  // 新しい接続を受け付けない
  server.close(() => {
    console.log('HTTPサーバー停止完了');
  });

  // 既存のSocket.io接続を閉じる
  io.close(() => {
    console.log('Socket.io接続停止完了');
  });

  // 3秒後に強制終了
  setTimeout(() => {
    console.log('シャットダウン完了');
    process.exit(0);
  }, 3000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
