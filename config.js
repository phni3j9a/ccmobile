/**
 * Claude Code Web Terminal - 設定管理
 *
 * 環境変数から設定を読み込み、デフォルト値を提供します。
 * .envファイルまたは環境変数で設定を上書きできます。
 */

// dotenvがインストールされていれば読み込む（オプション）
try {
  require('dotenv').config();
} catch (e) {
  // dotenvがない場合は環境変数のみ使用
}

const config = {
  // サーバー設定
  PORT: parseInt(process.env.PORT, 10) || 3000,
  HOST: process.env.HOST || '0.0.0.0',

  // セッション設定
  SESSION_PREFIX: process.env.SESSION_PREFIX || 'ccw_',

  // ログ設定 ('debug' | 'info' | 'warn' | 'error')
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Socket.io設定
  SOCKET_PING_TIMEOUT: parseInt(process.env.SOCKET_PING_TIMEOUT, 10) || 60000,
  SOCKET_PING_INTERVAL: parseInt(process.env.SOCKET_PING_INTERVAL, 10) || 25000,

  // トークンリフレッシュ設定（ミリ秒）
  TOKEN_REFRESH_BUFFER_MS: parseInt(process.env.TOKEN_REFRESH_BUFFER_MS, 10) || 5 * 60 * 1000,

  // 画像アップロード設定
  UPLOAD_DIR: process.env.UPLOAD_DIR || require('path').join(process.env.HOME, 'uploads', 'ccmobile'),
  UPLOAD_MAX_SIZE: parseInt(process.env.UPLOAD_MAX_SIZE, 10) || 10 * 1024 * 1024, // 10MB
  UPLOAD_ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  UPLOAD_CLEANUP_DAYS: parseInt(process.env.UPLOAD_CLEANUP_DAYS, 10) || 7,

  // ファイルマネージャー設定
  FILE_MAX_SIZE: parseInt(process.env.FILE_MAX_SIZE || process.env.MD_MAX_FILE_SIZE, 10) || 1 * 1024 * 1024, // 1MB（テキスト読み書き上限）
  FILE_UPLOAD_MAX_SIZE: parseInt(process.env.FILE_UPLOAD_MAX_SIZE, 10) || 50 * 1024 * 1024, // 50MB（汎用アップロード上限）

  // テキストファイル拡張子
  TEXT_EXTENSIONS: new Set([
    '.md', '.txt', '.json', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
    '.py', '.sh', '.bash', '.zsh', '.fish',
    '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.env',
    '.xml', '.html', '.htm', '.css', '.scss', '.less',
    '.sql', '.csv', '.tsv', '.log',
    '.gitignore', '.dockerignore', '.editorconfig', '.eslintrc', '.prettierrc',
    '.c', '.cpp', '.h', '.hpp', '.java', '.go', '.rs', '.rb', '.php', '.swift', '.kt',
    '.r', '.m', '.mm', '.pl', '.pm', '.lua', '.vim', '.el',
    '.patch', '.diff', '.cmake', '.gradle', '.properties',
    '.service', '.socket', '.timer', '.mount'
  ]),

  // 拡張子なしでもテキストとして扱うファイル名
  TEXT_FILENAMES: new Set([
    'Makefile', 'Dockerfile', 'Vagrantfile', 'Gemfile', 'Rakefile',
    'LICENSE', 'LICENCE', 'AUTHORS', 'CONTRIBUTORS', 'CHANGELOG',
    'README', 'INSTALL', 'TODO', 'NOTICE', '.gitattributes'
  ])
};

// 設定の検証
function validateConfig() {
  if (config.PORT < 1 || config.PORT > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  if (!/^[a-zA-Z0-9_]+$/.test(config.SESSION_PREFIX)) {
    throw new Error('SESSION_PREFIX must contain only alphanumeric characters and underscores');
  }

  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.LOG_LEVEL)) {
    throw new Error(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }
}

validateConfig();

module.exports = config;
