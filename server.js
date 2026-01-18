const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pty = require('node-pty');
const path = require('path');
const { execSync, spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = 3000;
const HOST = '0.0.0.0';
const SESSION_PREFIX = 'ccw_'; // claude-code-web prefix

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ===========================================
// tmux管理関数
// ===========================================

// tmuxセッション一覧取得
function listTmuxSessions() {
  try {
    const output = execSync(
      `tmux list-sessions -F "#{session_name}|#{session_created}|#{pane_current_path}" 2>/dev/null`,
      { encoding: 'utf-8' }
    );

    const sessions = output.trim().split('\n')
      .filter(line => line.startsWith(SESSION_PREFIX))
      .map(line => {
        const [name, created, cwd] = line.split('|');
        return {
          name,
          displayName: name.replace(SESSION_PREFIX, ''),
          created: parseInt(created) * 1000,
          cwd: cwd || process.env.HOME
        };
      });

    return sessions;
  } catch (e) {
    // tmuxが起動していないか、セッションがない場合
    return [];
  }
}

// tmuxセッション作成
function createTmuxSession(sessionName) {
  const fullName = sessionName.startsWith(SESSION_PREFIX) ? sessionName : SESSION_PREFIX + sessionName;
  try {
    execSync(`tmux new-session -d -s "${fullName}" -c "${process.env.HOME}"`, { encoding: 'utf-8' });

    // tmux設定を適用（マウス操作有効化、スクロールバッファ増加）
    try {
      execSync(`tmux set-option -t "${fullName}" mouse on`, { encoding: 'utf-8' });
      execSync(`tmux set-option -t "${fullName}" history-limit 10000`, { encoding: 'utf-8' });
      // Escキーの遅延を減らす（vimなどでの操作性向上）
      execSync(`tmux set-option -t "${fullName}" escape-time 10`, { encoding: 'utf-8' });
      // viモードに設定（Ctrl+u/dで半ページスクロール可能にする）
      execSync(`tmux set-window-option -t "${fullName}" mode-keys vi`, { encoding: 'utf-8' });
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
  const fullName = sessionName.startsWith(SESSION_PREFIX) ? sessionName : SESSION_PREFIX + sessionName;
  try {
    execSync(`tmux set-option -t "${fullName}" mouse on 2>/dev/null`, { encoding: 'utf-8' });
    execSync(`tmux set-option -t "${fullName}" history-limit 10000 2>/dev/null`, { encoding: 'utf-8' });
    execSync(`tmux set-option -t "${fullName}" escape-time 10 2>/dev/null`, { encoding: 'utf-8' });
    execSync(`tmux set-window-option -t "${fullName}" mode-keys vi 2>/dev/null`, { encoding: 'utf-8' });
  } catch (e) {
    // 設定エラーは無視（既に設定済みの場合など）
  }
}

// tmuxセッションにアタッチ（PTY経由）
function attachTmuxSession(sessionName) {
  const fullName = sessionName.startsWith(SESSION_PREFIX) ? sessionName : SESSION_PREFIX + sessionName;

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
  const fullName = sessionName.startsWith(SESSION_PREFIX) ? sessionName : SESSION_PREFIX + sessionName;
  try {
    execSync(`tmux kill-session -t "${fullName}"`, { encoding: 'utf-8' });
    console.log('tmuxセッション削除:', fullName);
    return { success: true };
  } catch (e) {
    console.error('tmuxセッション削除エラー:', e.message);
    return { success: false, error: e.message };
  }
}

// tmuxセッションが存在するか確認
function tmuxSessionExists(sessionName) {
  const fullName = sessionName.startsWith(SESSION_PREFIX) ? sessionName : SESSION_PREFIX + sessionName;
  try {
    execSync(`tmux has-session -t "${fullName}" 2>/dev/null`, { encoding: 'utf-8' });
    return true;
  } catch (e) {
    return false;
  }
}

// ユニークなセッション名を生成
function generateSessionName() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}_${random}`;
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
  
  const oldFullName = name.startsWith(SESSION_PREFIX) ? name : SESSION_PREFIX + name;
  const newFullName = SESSION_PREFIX + newName.trim();
  
  try {
    execSync(`tmux rename-session -t "${oldFullName}" "${newFullName}"`, { encoding: 'utf-8' });
    console.log('tmuxセッション名変更:', oldFullName, '->', newFullName);
    res.json({ success: true, name: newFullName, displayName: newName.trim() });
  } catch (e) {
    console.error('tmuxセッション名変更エラー:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

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

    fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), 'utf-8');
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
        'anthropic-beta': 'oauth-2025-04-20'
      }
    };
    
    const apiReq = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        try {
          const usage = JSON.parse(data);
          res.json({ 
            success: true, 
            usage,
            subscriptionType: oauth.subscriptionType || 'unknown'
          });
        } catch (e) {
          res.json({ success: false, error: 'レスポンスの解析に失敗しました' });
        }
      });
    });
    
    apiReq.on('error', (e) => {
      res.json({ success: false, error: e.message });
    });
    
    apiReq.setTimeout(5000, () => {
      apiReq.destroy();
      res.json({ success: false, error: 'タイムアウト' });
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

    const fullName = sessionName.startsWith(SESSION_PREFIX) ? sessionName : SESSION_PREFIX + sessionName;

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

    // PTYからの出力をクライアントに送信
    ptyProcess.onData((data) => {
      socket.emit('output', data);
    });

    // PTYプロセス終了時（デタッチ時も発火）
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log('PTYプロセス終了, exitCode:', exitCode, 'signal:', signal, 'session:', currentSessionName);
      socket.emit('detached', { exitCode, signal, sessionName: currentSessionName });
      ptyProcess = null;
    });

    // 接続完了を通知
    socket.emit('attached', { sessionName: fullName, displayName: fullName.replace(SESSION_PREFIX, '') });
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

server.listen(PORT, HOST, () => {
  console.log(`サーバー起動: http://${HOST}:${PORT}`);
  console.log('LAN内の他のデバイスからアクセス可能');
});
