(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    const terminalElement = document.getElementById('terminal');
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');
    const offlineBanner = document.getElementById('offline-banner');
    const reconnectBtn = document.getElementById('reconnect-btn');
    const specialKeysToolbar = document.getElementById('special-keys-toolbar');
    const ctrlToggle = document.getElementById('ctrl-toggle');
    const scrollModeBtn = document.getElementById('scroll-mode-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const copyBtn = document.getElementById('copy-btn');
    const quickActions = document.getElementById('quick-actions');
    const quickActionsToggle = document.getElementById('quick-actions-toggle');
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsClose = document.getElementById('settings-close');
    const fontDecrease = document.getElementById('font-decrease');
    const fontIncrease = document.getElementById('font-increase');
    const fontSizeDisplay = document.getElementById('font-size-display');
    const newCmdInput = document.getElementById('new-cmd-input');
    const addCmdBtn = document.getElementById('add-cmd-btn');
    const customCommandsContainer = document.getElementById('custom-commands');

    // 設定
    const FONT_SIZE_MIN = 10;
    const FONT_SIZE_MAX = 24;
    const STORAGE_KEY_FONT_SIZE = 'terminal-font-size';
    const STORAGE_KEY_CUSTOM_CMDS = 'terminal-custom-commands';
    const STORAGE_KEY_LAST_SESSION = 'terminal-last-session';
    const STORAGE_KEY_AUTO_CONNECT = 'terminal-auto-connect';

    // セッション管理UI要素
    const sessionManager = document.getElementById('session-manager');
    const sessionList = document.getElementById('session-list');
    const newSessionBtn = document.getElementById('new-session-btn');

    // 状態
    let ctrlActive = false;
    let scrollModeActive = false;
    let currentFontSize = parseInt(localStorage.getItem(STORAGE_KEY_FONT_SIZE)) || 14;
    let customCommands = JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM_CMDS) || '[]');
    let term = null;
    let socket = null;
    let currentSessionName = null;
    let isAttached = false;

    // デバッグ用
    function log(msg) {
      console.log('[terminal.js]', msg);
    }

    log('初期化開始');

    // グローバル変数の確認
    if (typeof Terminal === 'undefined') {
      console.error('Terminal is not defined');
      statusText.textContent = 'エラー: xterm.js読み込み失敗';
      return;
    }

    if (typeof io === 'undefined') {
      console.error('io is not defined');
      statusText.textContent = 'エラー: Socket.io読み込み失敗';
      return;
    }

    log('ライブラリ読み込み確認完了');

    // xterm.js初期化
    term = new Terminal({
      fontFamily: '"Noto Sans Mono CJK JP", "Noto Sans Mono", "DejaVu Sans Mono", "Consolas", monospace',
      fontSize: currentFontSize,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#1e1e1e',
        selection: 'rgba(255, 255, 255, 0.3)',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff'
      },
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      tabStopWidth: 4,
      allowProposedApi: true
    });

    log('Terminal作成完了');

    // アドオン読み込み
    try {
      if (typeof FitAddon !== 'undefined') {
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        window._fitAddon = fitAddon;
        log('FitAddon読み込み完了');
      }
    } catch (e) {
      console.error('FitAddonエラー:', e);
    }

    try {
      if (typeof Unicode11Addon !== 'undefined') {
        const unicode11Addon = new Unicode11Addon.Unicode11Addon();
        term.loadAddon(unicode11Addon);
        term.unicode.activeVersion = '11';
        log('Unicode11Addon読み込み完了');
      }
    } catch (e) {
      console.error('Unicode11Addonエラー:', e);
    }

    try {
      if (typeof WebLinksAddon !== 'undefined') {
        const webLinksAddon = new WebLinksAddon.WebLinksAddon();
        term.loadAddon(webLinksAddon);
        log('WebLinksAddon読み込み完了');
      }
    } catch (e) {
      console.error('WebLinksAddonエラー:', e);
    }

    // ターミナルをDOMに追加
    term.open(terminalElement);
    log('ターミナルDOM追加完了');

    // Socket.io接続（再接続設定最適化）
    socket = io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    log('Socket.io接続開始');

    // ===========================================
    // セッション管理機能
    // ===========================================

    // セッション一覧を取得・表示
    async function fetchSessions() {
      try {
        const response = await fetch('/api/sessions');
        const sessions = await response.json();
        return sessions;
      } catch (e) {
        log('セッション取得エラー: ' + e.message);
        return [];
      }
    }

    // セッション一覧UIを描画
    function renderSessionList(sessions) {
      sessionList.innerHTML = '';

      if (sessions.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'session-empty';
        emptyMsg.textContent = 'セッションがありません';
        sessionList.appendChild(emptyMsg);
        return;
      }

      sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'session-item';

        const createdDate = new Date(session.created);
        const timeStr = createdDate.toLocaleString('ja-JP', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        item.innerHTML = `
          <div class="session-info">
            <span class="session-name">${escapeHtml(session.displayName)}</span>
            <span class="session-meta">${timeStr}</span>
          </div>
          <div class="session-actions">
            <button class="session-btn connect-btn" data-session="${escapeHtml(session.name)}">接続</button>
            <button class="session-btn delete-btn" data-session="${escapeHtml(session.name)}">削除</button>
          </div>
        `;
        sessionList.appendChild(item);
      });
    }

    // セッションマネージャを表示
    function showSessionManager() {
      sessionManager.classList.remove('hidden');
      document.getElementById('terminal-container').classList.add('hidden');
      document.getElementById('special-keys-toolbar').style.display = 'none';
    }

    // セッションマネージャを非表示
    function hideSessionManager() {
      sessionManager.classList.add('hidden');
      document.getElementById('terminal-container').classList.remove('hidden');
      // 特殊キーツールバーの表示を復元（インラインスタイルを削除してCSSに任せる）
      document.getElementById('special-keys-toolbar').style.display = '';
      
      // iOS Safari: 非表示→表示切り替え後のスクロール領域再計算
      setTimeout(() => {
        fit();
        // xterm.jsのviewportを強制的にリフレッシュ
        if (term && term.refresh) {
          term.refresh(0, term.rows - 1);
        }
      }, 100);
    }

    // セッションに接続
    function attachToSession(sessionName) {
      log('セッション接続: ' + (sessionName || '新規'));
      setStatus('reconnecting', '接続中...');
      socket.emit('attach', { sessionName });
    }

    // セッションを削除
    async function deleteSession(sessionName) {
      if (!confirm('このセッションを削除しますか？')) {
        return;
      }

      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          log('セッション削除: ' + sessionName);
          // 一覧を更新
          const sessions = await fetchSessions();
          renderSessionList(sessions);
        } else {
          log('セッション削除失敗');
        }
      } catch (e) {
        log('セッション削除エラー: ' + e.message);
      }
    }

    // セッション一覧のクリックハンドラ
    sessionList.addEventListener('click', (e) => {
      const connectBtn = e.target.closest('.connect-btn');
      const deleteBtn = e.target.closest('.delete-btn');

      if (connectBtn) {
        const sessionName = connectBtn.dataset.session;
        hideSessionManager();
        attachToSession(sessionName);
      } else if (deleteBtn) {
        const sessionName = deleteBtn.dataset.session;
        deleteSession(sessionName);
      }
    });

    // 新規セッションボタン
    newSessionBtn.addEventListener('click', () => {
      hideSessionManager();
      attachToSession(null); // 新規セッション
    });

    // 初期接続処理
    async function initializeConnection() {
      const sessions = await fetchSessions();

      if (sessions.length === 0) {
        // セッションがなければ自動で新規作成
        hideSessionManager();
        attachToSession(null);
      } else {
        // セッションがあれば一覧を表示
        renderSessionList(sessions);
        showSessionManager();
      }
    }

    // 接続状態管理
    function setStatus(status, message) {
      statusText.textContent = message;
      statusBar.className = status;

      if (status === 'disconnected') {
        showOfflineBanner();
      } else {
        hideOfflineBanner();
      }
    }

    function showOfflineBanner() {
      offlineBanner.classList.remove('hidden');
      document.body.classList.add('offline');
    }

    function hideOfflineBanner() {
      offlineBanner.classList.add('hidden');
      document.body.classList.remove('offline');
    }

    // フィット処理
    function fit() {
      try {
        if (window._fitAddon) {
          window._fitAddon.fit();
          const dims = window._fitAddon.proposeDimensions();
          if (dims && dims.cols && dims.rows && socket && socket.connected) {
            socket.emit('resize', { cols: dims.cols, rows: dims.rows });
            log('リサイズ: ' + dims.cols + 'x' + dims.rows);
          }
        }
      } catch (e) {
        console.error('フィットエラー:', e);
      }
    }

    // Socket.ioイベント
    socket.on('connect', () => {
      log('Socket.io接続完了');

      if (!isAttached) {
        // 初回接続時はセッション選択フローを開始
        initializeConnection();
      } else if (currentSessionName) {
        // 再接続時は前のセッションにアタッチ
        attachToSession(currentSessionName);
      }
    });

    // tmuxセッションにアタッチ完了
    socket.on('attached', ({ sessionName, displayName }) => {
      log('セッションアタッチ完了: ' + displayName);
      currentSessionName = sessionName;
      isAttached = true;
      localStorage.setItem(STORAGE_KEY_LAST_SESSION, sessionName);

      setStatus('connected', displayName);
      fit();
      term.focus();
    });

    // tmuxセッションからデタッチ
    socket.on('detached', ({ sessionName }) => {
      log('セッションデタッチ: ' + sessionName);
      isAttached = false;
      term.write('\r\n\x1b[33m[セッションから切断されました]\x1b[0m\r\n');
    });

    // サーバーからのエラー
    socket.on('error', ({ message, error }) => {
      log('サーバーエラー: ' + message);
      term.write(`\r\n\x1b[31m[エラー: ${message}]\x1b[0m\r\n`);
    });

    socket.on('disconnect', () => {
      log('Socket.io切断');
      setStatus('disconnected', '切断されました - 再接続中...');
    });

    socket.on('reconnecting', (attemptNumber) => {
      log('再接続中: ' + attemptNumber);
      setStatus('reconnecting', '再接続中... (' + attemptNumber + ')');
    });

    socket.on('reconnect', () => {
      log('Socket.io再接続');
      // 再接続時は自動的にセッションにアタッチ
      if (currentSessionName) {
        attachToSession(currentSessionName);
      }
    });

    socket.on('reconnect_failed', () => {
      log('再接続失敗');
      setStatus('disconnected', '再接続に失敗しました');
    });

    socket.on('connect_error', (err) => {
      log('接続エラー: ' + err.message);
      setStatus('disconnected', '接続エラー');
    });

    socket.on('output', (data) => {
      term.write(data);
    });

    socket.on('exit', ({ exitCode, signal }) => {
      term.write(`\r\n\x1b[33m[プロセス終了: exitCode=${exitCode}, signal=${signal}]\x1b[0m\r\n`);
      setStatus('disconnected', 'プロセス終了');
      isAttached = false;
    });

    socket.on('pong', () => {
      log('pong受信');
    });

    // ターミナル入力をサーバーに送信
    term.onData((data) => {
      if (socket && socket.connected) {
        socket.emit('input', data);
      }
    });

    // 手動再接続
    reconnectBtn.addEventListener('click', () => {
      log('手動再接続');
      socket.connect();
    });

    // バックグラウンド復帰時の再接続
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        log('ページ表示復帰');
        if (!socket.connected) {
          socket.connect();
        } else if (currentSessionName && !isAttached) {
          // 接続はあるがセッションにアタッチしていない場合
          attachToSession(currentSessionName);
        }
        setTimeout(fit, 100);
      }
    });

    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        log('bfcache復帰');
        if (!socket.connected) {
          socket.connect();
        } else if (currentSessionName && !isAttached) {
          attachToSession(currentSessionName);
        }
        setTimeout(fit, 100);
      }
    });

    // 定期的なping
    setInterval(() => {
      if (socket && socket.connected) {
        socket.emit('ping');
      }
    }, 30000);

    // リサイズ対応
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(fit, 100);
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(fit, 200);
    });

    // 仮想キーボード対応
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        const keyboardHeight = window.innerHeight - window.visualViewport.height;
        document.body.style.setProperty('--keyboard-height', keyboardHeight + 'px');

        if (keyboardHeight > 100) {
          document.body.classList.add('keyboard-visible');
        } else {
          document.body.classList.remove('keyboard-visible');
        }

        setTimeout(fit, 50);
      });
    }

    // 特殊キーツールバー
    function sendKey(key) {
      const keyMap = {
        'Escape': '\x1b',
        'Tab': '\t',
        'ArrowUp': '\x1b[A',
        'ArrowDown': '\x1b[B',
        'ArrowRight': '\x1b[C',
        'ArrowLeft': '\x1b[D',
        'PageUp': '\x1b[5~',
        'PageDown': '\x1b[6~'
      };

      // スクロール/ナビゲーション系キーはキーボードを出さない
      const noFocusKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'];

      if (keyMap[key]) {
        if (socket && socket.connected) {
          socket.emit('input', keyMap[key]);
        }
        if (!noFocusKeys.includes(key)) {
          term.focus();
        }
      }
    }

    function sendCtrl(char) {
      const code = char.toUpperCase().charCodeAt(0) - 64;
      if (code > 0 && code < 32) {
        if (socket && socket.connected) {
          socket.emit('input', String.fromCharCode(code));
        }
        term.focus();
      }
    }

    // キーボタンのクリックハンドラ
    specialKeysToolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.key-btn');
      if (!btn) return;

      // iOS Safari: ボタンクリックでフォーカスが移動してキーボードが閉じるのを防ぐ
      e.preventDefault();

      if (btn.dataset.key) {
        sendKey(btn.dataset.key);
      } else if (btn.dataset.ctrl) {
        sendCtrl(btn.dataset.ctrl);
      }

      // Ctrlモード解除
      if (ctrlActive && !btn.classList.contains('ctrl-btn')) {
        ctrlActive = false;
        ctrlToggle.classList.remove('active');
      }
    });

    // Ctrlトグル
    ctrlToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault(); // iOS Safari: フォーカス喪失防止
      ctrlActive = !ctrlActive;
      ctrlToggle.classList.toggle('active', ctrlActive);
      // フォーカスをターミナルに戻す
      term.focus();
    });

    // ターミナルキー入力時のCtrl処理
    term.attachCustomKeyEventHandler((e) => {
      if (ctrlActive && e.type === 'keydown' && e.key.length === 1) {
        sendCtrl(e.key);
        ctrlActive = false;
        ctrlToggle.classList.remove('active');
        return false;
      }
      return true;
    });

    // ペースト機能
    async function pasteFromClipboard() {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text && socket && socket.connected) {
            socket.emit('input', text);
          }
        } else {
          const text = prompt('ペーストするテキストを入力:');
          if (text && socket && socket.connected) {
            socket.emit('input', text);
          }
        }
      } catch (e) {
        log('ペーストエラー: ' + e.message);
        const text = prompt('ペーストするテキストを入力:');
        if (text && socket && socket.connected) {
          socket.emit('input', text);
        }
      }
      term.focus();
    }

    pasteBtn.addEventListener('click', (e) => {
      e.preventDefault(); // iOS Safari: フォーカス喪失防止
      pasteFromClipboard();
    });

    // スクロールモード（tmuxコピーモード）ボタン - トグル形式
    scrollModeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (socket && socket.connected) {
        if (!scrollModeActive) {
          // コピーモードに入る
          socket.emit('input', '\x02['); // \x02 = Ctrl+b
          scrollModeActive = true;
          scrollModeBtn.classList.add('active');
          scrollModeBtn.textContent = '📜✓';
          log('スクロールモード ON');
        } else {
          // コピーモードを抜ける
          socket.emit('input', 'q');
          scrollModeActive = false;
          scrollModeBtn.classList.remove('active');
          scrollModeBtn.textContent = '📜';
          log('スクロールモード OFF');
        }
      }
      // キーボードを表示しない（スクロール操作に専念）
    });

    // コピー機能
    term.onSelectionChange(() => {
      const selection = term.getSelection();
      if (selection) {
        showCopyButton();
      } else {
        hideCopyButton();
      }
    });

    function showCopyButton() {
      copyBtn.classList.remove('hidden');
      const termRect = terminalElement.getBoundingClientRect();
      copyBtn.style.top = (termRect.top + 10) + 'px';
      copyBtn.style.right = '10px';
    }

    function hideCopyButton() {
      copyBtn.classList.add('hidden');
    }

    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault(); // iOS Safari: フォーカス喪失防止
      const selection = term.getSelection();
      if (selection) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(selection);
            log('コピー完了');
          } else {
            prompt('コピーするテキスト:', selection);
          }
        } catch (e) {
          log('コピーエラー: ' + e.message);
          prompt('コピーするテキスト:', selection);
        }
      }
      term.clearSelection();
      hideCopyButton();
      term.focus();
    });

    // クイックアクションボタン
    quickActions.addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-btn');
      if (!btn || btn.id === 'settings-toggle' || btn.id === 'quick-actions-toggle') return;

      e.preventDefault(); // iOS Safari: フォーカス喪失防止
      
      const cmd = btn.dataset.cmd;
      if (cmd && socket && socket.connected) {
        socket.emit('input', cmd + '\n');
        term.focus();
      }
    });

    // クイックアクション表示/非表示トグル
    quickActionsToggle.addEventListener('click', () => {
      quickActions.classList.toggle('collapsed');
    });

    // 設定パネル
    function openSettings() {
      settingsPanel.classList.remove('hidden');
      settingsOverlay.classList.remove('hidden');
      renderCustomCommands();
    }

    function closeSettings() {
      settingsPanel.classList.add('hidden');
      settingsOverlay.classList.add('hidden');
      term.focus();
    }

    settingsToggle.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', closeSettings);

    // フォントサイズ調整
    function updateFontSize(size) {
      size = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
      currentFontSize = size;
      term.options.fontSize = size;
      fontSizeDisplay.textContent = size + 'px';
      localStorage.setItem(STORAGE_KEY_FONT_SIZE, size.toString());
      setTimeout(fit, 50);
    }

    fontDecrease.addEventListener('click', () => {
      updateFontSize(currentFontSize - 1);
    });

    fontIncrease.addEventListener('click', () => {
      updateFontSize(currentFontSize + 1);
    });

    fontSizeDisplay.textContent = currentFontSize + 'px';

    // カスタムコマンド
    function renderCustomCommands() {
      const existingItems = customCommandsContainer.querySelectorAll('.custom-cmd-item');
      existingItems.forEach(item => item.remove());

      customCommands.forEach((cmd, index) => {
        const item = document.createElement('div');
        item.className = 'custom-cmd-item';
        item.innerHTML = `
          <span>${escapeHtml(cmd)}</span>
          <button data-index="${index}">削除</button>
        `;
        customCommandsContainer.insertBefore(item, customCommandsContainer.querySelector('.custom-cmd-input'));
      });
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function addCustomCommand(cmd) {
      if (cmd && !customCommands.includes(cmd)) {
        customCommands.push(cmd);
        localStorage.setItem(STORAGE_KEY_CUSTOM_CMDS, JSON.stringify(customCommands));
        renderCustomCommands();
        updateQuickActions();
      }
    }

    function removeCustomCommand(index) {
      customCommands.splice(index, 1);
      localStorage.setItem(STORAGE_KEY_CUSTOM_CMDS, JSON.stringify(customCommands));
      renderCustomCommands();
      updateQuickActions();
    }

    function updateQuickActions() {
      // 既存のカスタムコマンドボタンを削除
      const existingCustom = quickActions.querySelectorAll('.quick-btn.custom');
      existingCustom.forEach(btn => btn.remove());

      // カスタムコマンドボタンを追加
      customCommands.forEach(cmd => {
        const btn = document.createElement('button');
        btn.className = 'quick-btn custom';
        btn.dataset.cmd = cmd;
        btn.textContent = cmd.length > 8 ? cmd.substring(0, 8) + '…' : cmd;
        quickActions.insertBefore(btn, settingsToggle);
      });
    }

    addCmdBtn.addEventListener('click', () => {
      const cmd = newCmdInput.value.trim();
      if (cmd) {
        addCustomCommand(cmd);
        newCmdInput.value = '';
      }
    });

    newCmdInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const cmd = newCmdInput.value.trim();
        if (cmd) {
          addCustomCommand(cmd);
          newCmdInput.value = '';
        }
      }
    });

    customCommandsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-index]');
      if (btn) {
        removeCustomCommand(parseInt(btn.dataset.index));
      }
    });

    // 初期化
    updateQuickActions();

    // モバイルでのタッチでフォーカス（スクロールと区別）
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    terminalElement.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    terminalElement.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndTime = Date.now();

      const deltaX = Math.abs(touchEndX - touchStartX);
      const deltaY = Math.abs(touchEndY - touchStartY);
      const deltaTime = touchEndTime - touchStartTime;

      // タップ判定: 移動距離10px以内、時間300ms以内
      if (deltaX < 10 && deltaY < 10 && deltaTime < 300) {
        term.focus();
      }
    }, { passive: true });

    // 初期フィット
    setTimeout(fit, 100);

    // Service Worker登録
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => log('ServiceWorker登録完了'))
        .catch(err => log('ServiceWorker登録失敗: ' + err.message));
    }

    log('初期化完了');
  });

})();
