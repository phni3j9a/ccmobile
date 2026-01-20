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
  TOKEN_REFRESH_BUFFER_MS: parseInt(process.env.TOKEN_REFRESH_BUFFER_MS, 10) || 5 * 60 * 1000
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
