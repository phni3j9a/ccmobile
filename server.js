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
    
    // トークンの有効期限チェック
    if (oauth.expiresAt && Date.now() > oauth.expiresAt) {
      return res.json({ success: false, error: 'トークンの有効期限が切れています' });
    }
    
    const options = {
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${oauth.accessToken}`,
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
