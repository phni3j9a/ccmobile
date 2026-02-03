(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    const terminalElement = document.getElementById('terminal');
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');
    const offlineBanner = document.getElementById('offline-banner');
    const reconnectBtn = document.getElementById('reconnect-btn');
    const specialKeysToolbar = document.getElementById('special-keys-toolbar');

    const scrollModeBtn = document.getElementById('scroll-mode-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const copyBtn = document.getElementById('copy-btn');
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsClose = document.getElementById('settings-close');
    const fontDecrease = document.getElementById('font-decrease');
    const fontIncrease = document.getElementById('font-increase');
    const fontSizeDisplay = document.getElementById('font-size-display');
    const detachSessionBtn = document.getElementById('detach-session-btn');

    // 設定
    const FONT_SIZE_MIN = 6;
    const FONT_SIZE_MAX = 24;
    const STORAGE_KEY_FONT_SIZE = 'terminal-font-size';
    const STORAGE_KEY_LAST_SESSION = 'terminal-last-session';
    const STORAGE_KEY_THEME = 'terminal-theme';
    const USAGE_UPDATE_INTERVAL = 5 * 60 * 1000; // 5分間隔

    // テーマ定義 (Claude-inspired)
    const THEMES = {
      dark: {
        background: '#1a1915',
        foreground: '#e8e4dc',
        cursor: '#d97757',
        cursorAccent: '#1a1915',
        selection: 'rgba(217, 119, 87, 0.25)',
        black: '#1a1915',
        red: '#c75f5f',
        green: '#7d9e7d',
        yellow: '#d4a574',
        blue: '#7a9ec4',
        magenta: '#b59ac4',
        cyan: '#7ab4b4',
        white: '#e8e4dc',
        brightBlack: '#736d5e',
        brightRed: '#e07a7a',
        brightGreen: '#95b895',
        brightYellow: '#e5c99a',
        brightBlue: '#95b8d8',
        brightMagenta: '#c9b2d8',
        brightCyan: '#95c8c8',
        brightWhite: '#faf8f4'
      },
      light: {
        background: '#faf8f4',
        foreground: '#2d2a24',
        cursor: '#c4551d',
        cursorAccent: '#faf8f4',
        selection: 'rgba(196, 85, 29, 0.2)',
        black: '#2d2a24',
        red: '#b54545',
        green: '#4a7a4a',
        yellow: '#b8860b',
        blue: '#4a7da8',
        magenta: '#7a5d94',
        cyan: '#3d7a7a',
        white: '#f0ede6',
        brightBlack: '#6b6558',
        brightRed: '#d45555',
        brightGreen: '#5d945d',
        brightYellow: '#d4a574',
        brightBlue: '#5d90bb',
        brightMagenta: '#946db0',
        brightCyan: '#5d9494',
        brightWhite: '#ffffff'
      }
    };

    // セッション管理UI要素
    const sessionManager = document.getElementById('session-manager');
    const sessionList = document.getElementById('session-list');
    const newSessionBtn = document.getElementById('new-session-btn');

    // セッションタブバーUI要素
    const sessionTabBar = document.getElementById('session-tab-bar');
    const sessionTabsContainer = document.getElementById('session-tabs');
    const addSessionTabBtn = document.getElementById('add-session-tab');

    // 状態
    let usageUpdateTimer = null;
    let lastUsageData = null;
    let scrollModeActive = false;
    let scrollTouchStartY = 0;
    let scrollLastY = 0;
    let scrollTouchIdentifier = null;
    let chatInputVisible = true; // 常時表示


    let currentFontSize = parseInt(localStorage.getItem(STORAGE_KEY_FONT_SIZE)) || 10;
    let currentTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'dark';
    let term = null;
    let socket = null;
    let currentSessionName = null;
    let isAttached = false;
    let sessionListCache = []; // セッション一覧のキャッシュ

    // トースト通知コンテナ
    const toastContainer = document.getElementById('toast-container');

    // デバッグ用
    function log(msg) {
      console.log('[terminal.js]', msg);
    }

    /**
     * トースト通知を表示
     * @param {string} message - 表示するメッセージ
     * @param {'success' | 'error' | 'warning' | 'info'} type - 通知タイプ
     * @param {number} duration - 表示時間（ミリ秒）
     */
    function showToast(message, type = 'info', duration = 3000) {
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;
      toast.setAttribute('role', 'alert');

      toastContainer.appendChild(toast);

      // 指定時間後に削除
      setTimeout(() => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => {
          toast.remove();
        });
      }, duration);
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

    // 初期テーマを適用
    applyTheme(currentTheme);

    // xterm.js初期化
    term = new Terminal({
      fontFamily: '"Noto Sans Mono CJK JP", "Noto Sans Mono", "DejaVu Sans Mono", "Consolas", monospace',
      fontSize: currentFontSize,
      theme: THEMES[currentTheme],
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
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const sessions = await response.json();
        return sessions;
      } catch (e) {
        log('セッション取得エラー: ' + e.message);
        showToast('セッション一覧の取得に失敗しました', 'error');
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
            <button class="session-btn edit-btn" data-session="${escapeHtml(session.name)}" title="名前を変更">✏️</button>
            <button class="session-btn connect-btn" data-session="${escapeHtml(session.name)}">接続</button>
            <button class="session-btn delete-btn" data-session="${escapeHtml(session.name)}">削除</button>
          </div>
        `;
        sessionList.appendChild(item);
      });
    }

    // ===========================================
    // セッションタブバー機能
    // ===========================================

    // セッション一覧を取得してタブを更新
    async function updateSessionTabs() {
      try {
        const sessions = await fetchSessions();
        sessionListCache = sessions;
        renderSessionTabs();
      } catch (e) {
        log('タブ更新エラー: ' + e.message);
      }
    }

    // タブバーを描画
    function renderSessionTabs() {
      if (!sessionTabsContainer) return;

      sessionTabsContainer.innerHTML = '';

      sessionListCache.forEach(session => {
        const tab = document.createElement('button');
        tab.className = 'session-tab';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('data-session', session.name);
        tab.textContent = session.displayName;

        // 現在のセッションをアクティブ表示
        if (session.name === currentSessionName) {
          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');
        } else {
          tab.setAttribute('aria-selected', 'false');
        }

        sessionTabsContainer.appendChild(tab);
      });

      // アクティブなタブをスクロール表示
      const activeTab = sessionTabsContainer.querySelector('.session-tab.active');
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }

    // セッション切り替え
    function switchSession(sessionName) {
      if (!sessionName || sessionName === currentSessionName) return;
      if (!socket || !socket.connected) {
        showToast('接続されていません', 'error');
        return;
      }

      log('セッション切り替え: ' + sessionName);
      setStatus('reconnecting', '切替中...');
      socket.emit('switch', { sessionName });
    }

    // 前のセッションに切り替え
    function switchToPreviousSession() {
      if (sessionListCache.length < 2) return;

      const currentIndex = sessionListCache.findIndex(s => s.name === currentSessionName);
      if (currentIndex === -1) return;

      const prevIndex = (currentIndex - 1 + sessionListCache.length) % sessionListCache.length;
      switchSession(sessionListCache[prevIndex].name);
    }

    // 次のセッションに切り替え
    function switchToNextSession() {
      if (sessionListCache.length < 2) return;

      const currentIndex = sessionListCache.findIndex(s => s.name === currentSessionName);
      if (currentIndex === -1) return;

      const nextIndex = (currentIndex + 1) % sessionListCache.length;
      switchSession(sessionListCache[nextIndex].name);
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

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        log('セッション削除: ' + sessionName);
        showToast('セッションを削除しました', 'success');
        // 一覧を更新
        const sessions = await fetchSessions();
        renderSessionList(sessions);
      } catch (e) {
        log('セッション削除エラー: ' + e.message);
        showToast('セッションの削除に失敗しました: ' + e.message, 'error');
      }
    }

    // セッション名を変更
    async function renameSession(sessionName) {
      const currentName = sessionName.replace(/^ccw_/, '');
      const newName = prompt('新しいセッション名を入力:\n（英数字、ハイフン、アンダースコア、ドットのみ）', currentName);

      if (!newName || newName.trim() === '' || newName.trim() === currentName) {
        return;
      }

      // クライアント側でも簡易バリデーション
      const trimmedName = newName.trim();
      if (!/^[a-zA-Z0-9_\-\.]{1,50}$/.test(trimmedName)) {
        showToast('無効なセッション名です。英数字、ハイフン、アンダースコア、ドットのみ使用可能（1-50文字）', 'error', 5000);
        return;
      }

      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/rename`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName: trimmedName })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        log('セッション名変更: ' + sessionName + ' -> ' + trimmedName);
        showToast('セッション名を変更しました', 'success');
        const sessions = await fetchSessions();
        renderSessionList(sessions);
      } catch (e) {
        log('セッション名変更エラー: ' + e.message);
        showToast('名前の変更に失敗しました: ' + e.message, 'error');
      }
    }

    // セッション一覧のクリックハンドラ
    sessionList.addEventListener('click', (e) => {
      const connectBtn = e.target.closest('.connect-btn');
      const deleteBtn = e.target.closest('.delete-btn');
      const editBtn = e.target.closest('.edit-btn');

      if (connectBtn) {
        const sessionName = connectBtn.dataset.session;
        hideSessionManager();
        attachToSession(sessionName);
      } else if (deleteBtn) {
        const sessionName = deleteBtn.dataset.session;
        deleteSession(sessionName);
      } else if (editBtn) {
        const sessionName = editBtn.dataset.session;
        renameSession(sessionName);
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

      // タブバーを更新
      updateSessionTabs();

      // 使用量インジケーター更新開始
      startUsageUpdates();
    });

    // セッション切り替え完了
    socket.on('switched', ({ sessionName, displayName, oldSessionName }) => {
      log('セッション切り替え完了: ' + displayName);
      currentSessionName = sessionName;
      isAttached = true;
      localStorage.setItem(STORAGE_KEY_LAST_SESSION, sessionName);

      setStatus('connected', displayName);
      fit();
      term.focus();

      // タブバーを更新
      updateSessionTabs();

      // 使用量インジケーター更新開始（既に動作中なら再初期化）
      startUsageUpdates();
    });

    // tmuxセッションからデタッチ
    socket.on('detached', async ({ sessionName }) => {
      log('セッションデタッチ: ' + sessionName);
      isAttached = false;
      currentSessionName = null;
      term.write('\r\n\x1b[33m[セッションから切断されました]\x1b[0m\r\n');

      // 使用量インジケーター更新停止
      stopUsageUpdates();

      // セッション一覧を取得して表示
      const sessions = await fetchSessions();
      renderSessionList(sessions);
      showSessionManager();
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

    // alternateバッファがアクティブかどうかを確認
    function isAlternateBufferActive() {
      return term && term.buffer.active.type === 'alternate';
    }

    // 特殊キーツールバー
    function sendKey(key) {
      // スクロールモード中のPgUp/PgDn処理
      if (scrollModeActive && (key === 'PageUp' || key === 'PageDown')) {
        if (isAlternateBufferActive()) {
          // alternateバッファ（Claude Code等）の場合はキーをそのまま送信
          const keyMap = { 'PageUp': '\x1b[5~', 'PageDown': '\x1b[6~' };
          if (socket && socket.connected) {
            socket.emit('input', keyMap[key]);
          }
        } else {
          // normalバッファの場合はxterm.jsでスクロール
          if (term) {
            term.scrollPages(key === 'PageUp' ? -1 : 1);
          }
        }
        return;
      }

      const keyMap = {
        'Escape': '\x1b',
        'Tab': '\t',
        'ShiftTab': '\x1b[Z',
        'ArrowUp': '\x1b[A',
        'ArrowDown': '\x1b[B',
        'ArrowRight': '\x1b[C',
        'ArrowLeft': '\x1b[D',
        'PageUp': '\x1b[5~',
        'PageDown': '\x1b[6~',
        'Enter': '\r'
      };

      let keyToSend = keyMap[key];

      if (keyToSend) {
        if (socket && socket.connected) {
          socket.emit('input', keyToSend);
        }
      }
    }

    function sendCtrl(char) {
      const code = char.toUpperCase().charCodeAt(0) - 64;
      if (code > 0 && code < 32) {
        if (socket && socket.connected) {
          socket.emit('input', String.fromCharCode(code));
        }
      }
    }

    // キーボタンのイベントハンドラ
    // タップとスワイプを区別してスクロールを妨げない
    let wasTerminalFocused = false;
    let toolbarTouchStartX = 0;
    let toolbarTouchStartY = 0;

    specialKeysToolbar.addEventListener('touchstart', (e) => {
      const btn = e.target.closest('.key-btn');
      if (!btn) return;

      // 特別なボタン（独自のタッチハンドラを持つ）は除外
      if (btn.id === 'settings-toggle' || btn.id === 'scroll-mode-btn' ||
          btn.id === 'paste-btn' || btn.id === 'image-upload-btn') {
        return;
      }

      // タッチ開始時点でターミナルにフォーカスがあるか記録
      wasTerminalFocused = document.activeElement === term.textarea;

      // タッチ開始位置を記録（スワイプ判定用）
      toolbarTouchStartX = e.touches[0].clientX;
      toolbarTouchStartY = e.touches[0].clientY;

      // preventDefaultは呼ばない（スクロールを許可）
    }, { passive: true });

    // touchendで処理済みフラグ（iOS Safariでclickイベントを抑制するため）
    let toolbarTouchEndProcessed = false;

    specialKeysToolbar.addEventListener('touchend', (e) => {
      const btn = e.target.closest('.key-btn');
      if (!btn) return;

      // 特別なボタン（独自のタッチハンドラを持つ）は除外
      if (btn.id === 'settings-toggle' || btn.id === 'scroll-mode-btn' ||
          btn.id === 'paste-btn' || btn.id === 'image-upload-btn') {
        return;
      }

      // タップかスワイプかを判定（移動距離10px以内ならタップ）
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = Math.abs(touchEndX - toolbarTouchStartX);
      const deltaY = Math.abs(touchEndY - toolbarTouchStartY);

      if (deltaX > 10 || deltaY > 10) {
        // スワイプの場合は何もしない
        return;
      }

      // タップの場合はキー送信
      e.preventDefault();

      if (btn.dataset.key) {
        sendKey(btn.dataset.key);
      } else if (btn.dataset.ctrl) {
        sendCtrl(btn.dataset.ctrl);
      }

      // キーボードが開いていた場合のみフォーカスを復元
      if (wasTerminalFocused) {
        term.focus();
      }

      // touchendで処理済みフラグをセット（clickイベント抑制用）
      toolbarTouchEndProcessed = true;
      setTimeout(() => { toolbarTouchEndProcessed = false; }, 400);
    });

    // デスクトップ向けクリックハンドラ（タッチイベントがない環境用）
    specialKeysToolbar.addEventListener('click', (e) => {
      // touchendで処理済みならスキップ（iOS Safari対応）
      if (toolbarTouchEndProcessed) return;
      // タッチデバイスではtouchendで処理済みなのでスキップ
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;

      const btn = e.target.closest('.key-btn');
      if (!btn) return;

      // 特別なボタン（独自のハンドラを持つ）は除外
      if (btn.id === 'settings-toggle' || btn.id === 'scroll-mode-btn' ||
          btn.id === 'paste-btn' || btn.id === 'image-upload-btn') {
        return;
      }

      e.preventDefault();

      if (btn.dataset.key) {
        sendKey(btn.dataset.key);
      } else if (btn.dataset.ctrl) {
        sendCtrl(btn.dataset.ctrl);
      }

      term.focus();
    });

    // ペーストモーダル
    const pasteModal = document.getElementById('paste-modal');
    const pasteModalOverlay = document.getElementById('paste-modal-overlay');
    const pasteTextarea = document.getElementById('paste-textarea');
    const pasteOkBtn = document.getElementById('paste-ok');
    const pasteCancelBtn = document.getElementById('paste-cancel');

    let pasteModalResolve = null;
    let pasteModalRestoreFocus = true;

    function showPasteModal(restoreFocus = true) {
      return new Promise((resolve) => {
        pasteModalResolve = resolve;
        pasteModalRestoreFocus = restoreFocus;
        pasteTextarea.value = '';
        pasteModal.classList.remove('hidden');
        pasteModalOverlay.classList.remove('hidden');
        pasteTextarea.focus();
      });
    }

    function closePasteModal(text) {
      pasteModal.classList.add('hidden');
      pasteModalOverlay.classList.add('hidden');
      if (pasteModalResolve) {
        pasteModalResolve(text);
        pasteModalResolve = null;
      }
      if (pasteModalRestoreFocus) {
        term.focus();
      }
    }

    // OKボタン
    pasteOkBtn.addEventListener('click', () => {
      const text = pasteTextarea.value;
      closePasteModal(text);
    });

    // キャンセルボタン
    pasteCancelBtn.addEventListener('click', () => {
      closePasteModal(null);
    });

    // オーバーレイクリックでキャンセル
    pasteModalOverlay.addEventListener('click', () => {
      closePasteModal(null);
    });

    // Escキーでキャンセル
    pasteModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePasteModal(null);
      }
    });

    // ===========================================
    // 画像アップロード機能
    // ===========================================

    const imageUploadBtn = document.getElementById('image-upload-btn');
    const uploadModal = document.getElementById('upload-modal');
    const uploadModalOverlay = document.getElementById('upload-modal-overlay');
    const uploadDropArea = document.getElementById('upload-drop-area');
    const uploadFileInput = document.getElementById('upload-file-input');
    const uploadPlaceholder = uploadDropArea.querySelector('.upload-placeholder');
    const uploadPreview = document.getElementById('upload-preview');
    const uploadPreviewImg = document.getElementById('upload-preview-img');
    const uploadClearBtn = document.getElementById('upload-clear');
    const uploadProgress = document.getElementById('upload-progress');
    const uploadProgressFill = document.getElementById('upload-progress-fill');
    const uploadProgressText = document.getElementById('upload-progress-text');
    const uploadResult = document.getElementById('upload-result');
    const uploadPath = document.getElementById('upload-path');
    const uploadCopyPathBtn = document.getElementById('upload-copy-path');
    const uploadCancelBtn = document.getElementById('upload-cancel');
    const uploadSubmitBtn = document.getElementById('upload-submit');
    const uploadInsertBtn = document.getElementById('upload-insert');

    let selectedFile = null;
    let uploadedPath = null;

    // モーダルを開く
    function showUploadModal() {
      // キーボードを閉じる
      if (term.textarea) {
        term.textarea.blur();
      }
      resetUploadModal();
      uploadModal.classList.remove('hidden');
      uploadModalOverlay.classList.remove('hidden');
    }

    // モーダルを閉じる
    function closeUploadModal() {
      uploadModal.classList.add('hidden');
      uploadModalOverlay.classList.add('hidden');
      // モバイルでキーボードが自動で出ないようterm.focus()は呼ばない
    }

    // モーダルをリセット
    function resetUploadModal() {
      selectedFile = null;
      uploadedPath = null;
      uploadFileInput.value = '';
      uploadPlaceholder.classList.remove('hidden');
      uploadPreview.classList.add('hidden');
      uploadPreviewImg.src = '';
      uploadProgress.classList.add('hidden');
      uploadProgressFill.style.width = '0%';
      uploadResult.classList.add('hidden');
      uploadPath.textContent = '';
      uploadSubmitBtn.disabled = true;
      uploadSubmitBtn.classList.remove('hidden');
      uploadInsertBtn.classList.add('hidden');
      uploadCancelBtn.textContent = '閉じる';
    }

    // ファイル選択エリアクリック
    uploadDropArea.addEventListener('click', () => {
      if (!selectedFile && !uploadedPath) {
        uploadFileInput.click();
      }
    });

    // ファイル選択
    uploadFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleFileSelect(file);
      }
    });

    // ファイル選択処理
    function handleFileSelect(file) {
      // MIMEタイプチェック
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        showToast('許可されていないファイル形式です', 'error');
        return;
      }

      // サイズチェック（10MB）
      if (file.size > 10 * 1024 * 1024) {
        showToast('ファイルサイズが大きすぎます（上限: 10MB）', 'error');
        return;
      }

      selectedFile = file;

      // プレビュー表示
      const reader = new FileReader();
      reader.onload = (e) => {
        uploadPreviewImg.src = e.target.result;
        uploadPlaceholder.classList.add('hidden');
        uploadPreview.classList.remove('hidden');
        uploadSubmitBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    }

    // 選択クリア
    uploadClearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFile = null;
      uploadFileInput.value = '';
      uploadPreviewImg.src = '';
      uploadPlaceholder.classList.remove('hidden');
      uploadPreview.classList.add('hidden');
      uploadSubmitBtn.disabled = true;
    });

    // アップロード実行
    uploadSubmitBtn.addEventListener('click', async () => {
      if (!selectedFile) return;

      uploadSubmitBtn.disabled = true;
      uploadProgress.classList.remove('hidden');
      uploadProgressText.textContent = 'アップロード中...';

      const formData = new FormData();
      formData.append('image', selectedFile);

      try {
        const xhr = new XMLHttpRequest();

        // 進捗更新
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            uploadProgressFill.style.width = percent + '%';
            uploadProgressText.textContent = `アップロード中... ${percent}%`;
          }
        });

        // 完了処理
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            try {
              const result = JSON.parse(xhr.responseText);
              if (result.success) {
                uploadedPath = result.path;
                uploadProgressFill.style.width = '100%';
                uploadProgressText.textContent = '完了';

                // 結果表示
                uploadPath.textContent = uploadedPath;
                uploadResult.classList.remove('hidden');
                uploadSubmitBtn.classList.add('hidden');
                uploadInsertBtn.classList.remove('hidden');

                showToast('画像をアップロードしました', 'success');
                log('画像アップロード完了: ' + uploadedPath);
              } else {
                throw new Error(result.error || 'アップロードに失敗しました');
              }
            } catch (e) {
              showToast('アップロードエラー: ' + e.message, 'error');
              uploadProgress.classList.add('hidden');
              uploadSubmitBtn.disabled = false;
            }
          } else {
            let errorMsg = 'アップロードに失敗しました';
            try {
              const result = JSON.parse(xhr.responseText);
              errorMsg = result.error || errorMsg;
            } catch (e) {}
            showToast('アップロードエラー: ' + errorMsg, 'error');
            uploadProgress.classList.add('hidden');
            uploadSubmitBtn.disabled = false;
          }
        });

        // エラー処理
        xhr.addEventListener('error', () => {
          showToast('ネットワークエラーが発生しました', 'error');
          uploadProgress.classList.add('hidden');
          uploadSubmitBtn.disabled = false;
        });

        xhr.open('POST', '/api/upload');
        xhr.send(formData);
      } catch (e) {
        showToast('アップロードエラー: ' + e.message, 'error');
        uploadProgress.classList.add('hidden');
        uploadSubmitBtn.disabled = false;
      }
    });

    // テキストをクリップボードにコピー（iOS Safari対応）
    function copyToClipboard(text, buttonElement) {
      return new Promise((resolve) => {
        // 方法: input要素を使用（iOS Safariで最も確実）
        const input = document.createElement('input');
        input.type = 'text';
        input.value = text;

        // 画面内に配置（iOS Safariは画面外の要素からコピーできない）
        input.style.position = 'fixed';
        input.style.top = '50%';
        input.style.left = '0';
        input.style.width = '100%';
        input.style.padding = '10px';
        input.style.fontSize = '16px'; // iOS Safari: 16px未満だとズームする
        input.style.zIndex = '9999';
        input.style.opacity = '0';
        input.style.pointerEvents = 'none';

        document.body.appendChild(input);

        // iOS Safari: 選択範囲を設定
        input.focus();
        input.setSelectionRange(0, text.length);

        let success = false;
        try {
          success = document.execCommand('copy');
        } catch (e) {
          success = false;
        }

        document.body.removeChild(input);

        // Clipboard APIも試す（成功していなければ）
        if (!success && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
            .then(() => resolve(true))
            .catch(() => resolve(false));
        } else {
          resolve(success);
        }
      });
    }

    // パスをコピー
    uploadCopyPathBtn.addEventListener('click', async (e) => {
      if (!uploadedPath) return;

      const success = await copyToClipboard(uploadedPath, e.target);
      if (success) {
        showToast('パスをコピーしました', 'success', 1500);
      } else {
        // 最終フォールバック: 選択状態で表示
        uploadPath.focus();
        const range = document.createRange();
        range.selectNodeContents(uploadPath);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        showToast('パスを選択しました。コピーしてください', 'info', 2000);
      }
    });

    // ターミナルに入力
    uploadInsertBtn.addEventListener('click', () => {
      if (!uploadedPath) return;

      if (socket && socket.connected) {
        // パスのみ入力（ユーザーがプロンプトを続けて入力）
        socket.emit('input', uploadedPath + ' ');
        log('画像パスをターミナルに入力: ' + uploadedPath);
      }

      closeUploadModal();
    });

    // モーダルを閉じる
    uploadCancelBtn.addEventListener('click', closeUploadModal);
    uploadModalOverlay.addEventListener('click', closeUploadModal);

    // Escキーでキャンセル
    uploadModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeUploadModal();
      }
    });

    // 画像アップロードボタン: キーボード状態維持 + タップ/スワイプ判定
    let imageBtnWasFocused = false;
    let imageBtnStartX = 0;
    let imageBtnStartY = 0;

    if (imageUploadBtn) {
      imageUploadBtn.addEventListener('touchstart', (e) => {
        imageBtnWasFocused = document.activeElement === term.textarea;
        imageBtnStartX = e.touches[0].clientX;
        imageBtnStartY = e.touches[0].clientY;
      }, { passive: true });

      imageUploadBtn.addEventListener('touchend', (e) => {
        const deltaX = Math.abs(e.changedTouches[0].clientX - imageBtnStartX);
        const deltaY = Math.abs(e.changedTouches[0].clientY - imageBtnStartY);
        if (deltaX > 10 || deltaY > 10) return; // スワイプは無視

        e.preventDefault();
        showUploadModal();
      });

      imageUploadBtn.addEventListener('click', (e) => {
        if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
        e.preventDefault();
        showUploadModal();
      });
    }

    // ペースト機能
    async function pasteFromClipboard(restoreFocus = true) {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text && socket && socket.connected) {
            socket.emit('input', text);
          }
        } else {
          const text = await showPasteModal(restoreFocus);
          if (text && socket && socket.connected) {
            socket.emit('input', text);
          }
          return; // restoreFocusはshowPasteModal内で処理済み
        }
      } catch (e) {
        log('ペーストエラー: ' + e.message);
        const text = await showPasteModal(restoreFocus);
        if (text && socket && socket.connected) {
          socket.emit('input', text);
        }
        return; // restoreFocusはshowPasteModal内で処理済み
      }
      if (restoreFocus) {
        term.focus();
      }
    }

    // ペーストボタン: キーボード状態維持 + タップ/スワイプ判定
    let pasteBtnWasFocused = false;
    let pasteBtnStartX = 0;
    let pasteBtnStartY = 0;

    pasteBtn.addEventListener('touchstart', (e) => {
      pasteBtnWasFocused = document.activeElement === term.textarea;
      pasteBtnStartX = e.touches[0].clientX;
      pasteBtnStartY = e.touches[0].clientY;
    }, { passive: true });

    pasteBtn.addEventListener('touchend', (e) => {
      const deltaX = Math.abs(e.changedTouches[0].clientX - pasteBtnStartX);
      const deltaY = Math.abs(e.changedTouches[0].clientY - pasteBtnStartY);
      if (deltaX > 10 || deltaY > 10) return; // スワイプは無視

      e.preventDefault();
      pasteFromClipboard(pasteBtnWasFocused);
    });

    pasteBtn.addEventListener('click', (e) => {
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      e.preventDefault();
      pasteFromClipboard(true);
    });

    // スクロールモード（tmuxコピーモード）ボタン: キーボード状態維持 + タップ/スワイプ判定
    let scrollBtnWasFocused = false;
    let scrollBtnStartX = 0;
    let scrollBtnStartY = 0;

    scrollModeBtn.addEventListener('touchstart', (e) => {
      scrollBtnWasFocused = document.activeElement === term.textarea;
      scrollBtnStartX = e.touches[0].clientX;
      scrollBtnStartY = e.touches[0].clientY;
    }, { passive: true });

    scrollModeBtn.addEventListener('touchend', (e) => {
      const deltaX = Math.abs(e.changedTouches[0].clientX - scrollBtnStartX);
      const deltaY = Math.abs(e.changedTouches[0].clientY - scrollBtnStartY);
      if (deltaX > 10 || deltaY > 10) return; // スワイプは無視

      e.preventDefault();
      toggleScrollMode(scrollBtnWasFocused);
    });

    scrollModeBtn.addEventListener('click', (e) => {
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      e.preventDefault();
      toggleScrollMode(false); // デスクトップではスクロール操作に専念
    });

    function toggleScrollMode(restoreFocus) {
      if (!scrollModeActive) {
        // スクロールモードON
        scrollModeActive = true;
        scrollModeBtn.classList.add('active');
        scrollModeBtn.setAttribute('aria-pressed', 'true');
        terminalElement.classList.add('scroll-mode');
        // tmuxコピーモードに入る
        if (socket && socket.connected) {
          socket.emit('input', '\x02['); // Ctrl+b [
        }
        log('スクロールモード ON (tmuxコピーモード)');
        // キーボードを閉じる（ブラウザの非同期フォーカス対策で遅延実行）
        if (term && term.textarea) {
          term.textarea.blur();
          setTimeout(() => term.textarea.blur(), 50);
        }
      } else {
        // スクロールモードOFF
        scrollModeActive = false;
        scrollModeBtn.classList.remove('active');
        scrollModeBtn.setAttribute('aria-pressed', 'false');
        terminalElement.classList.remove('scroll-mode');
        // tmuxコピーモードを抜ける
        if (socket && socket.connected) {
          socket.emit('input', 'q');
        }
        log('スクロールモード OFF');
      }
      // スクロールモードOFFの時だけフォーカスを戻す（ON時はキーボードを開かない）
      if (restoreFocus && !scrollModeActive) {
        term.focus();
      }
    }

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

    // コピーボタン: キーボード状態維持 + タップ/スワイプ判定
    let copyBtnWasFocused = false;
    let copyBtnStartX = 0;
    let copyBtnStartY = 0;

    copyBtn.addEventListener('touchstart', (e) => {
      copyBtnWasFocused = document.activeElement === term.textarea;
      copyBtnStartX = e.touches[0].clientX;
      copyBtnStartY = e.touches[0].clientY;
    }, { passive: true });

    copyBtn.addEventListener('touchend', async (e) => {
      const deltaX = Math.abs(e.changedTouches[0].clientX - copyBtnStartX);
      const deltaY = Math.abs(e.changedTouches[0].clientY - copyBtnStartY);
      if (deltaX > 10 || deltaY > 10) return; // スワイプは無視

      e.preventDefault();
      await performCopy(copyBtnWasFocused);
    });

    copyBtn.addEventListener('click', async (e) => {
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      e.preventDefault();
      await performCopy(true);
    });

    async function performCopy(restoreFocus) {
      const selection = term.getSelection();
      if (selection) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(selection);
            log('コピー完了');
            showToast('コピーしました', 'success', 1500);
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
      if (restoreFocus) {
        term.focus();
      }
    }

    // 設定パネル
    function openSettings() {
      settingsPanel.classList.remove('hidden');
      settingsOverlay.classList.remove('hidden');
      fetchClaudeUsage();
    }

    function closeSettings() {
      settingsPanel.classList.add('hidden');
      settingsOverlay.classList.add('hidden');
      // モバイルでキーボードが自動で出ないようterm.focus()は呼ばない
    }

    // セッションデタッチ（切断）
    function detachSession() {
      if (!isAttached || !currentSessionName) {
        log('デタッチ: 接続中のセッションがありません');
        return;
      }

      log('セッションデタッチ: ' + currentSessionName);

      // tmuxのデタッチコマンドを送信 (Ctrl+b d)
      if (socket && socket.connected) {
        socket.emit('input', '\x02d');
      }

      closeSettings();
    }

    // Claude Code使用量を取得・表示
    async function fetchClaudeUsage() {
      const container = document.getElementById('claude-usage-container');
      container.innerHTML = '<div class="usage-loading">読み込み中...</div>';

      try {
        const response = await fetch('/api/usage/claude');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();

        if (!data.success) {
          // errorがオブジェクトの場合は適切にメッセージを抽出
          let errorMessage = data.error;
          if (typeof data.error === 'object' && data.error !== null) {
            errorMessage = data.error.message || JSON.stringify(data.error);
          }
          let errorHtml = `<div class="usage-error">${escapeHtml(errorMessage)}</div>`;
          if (data.requireReauth) {
            errorHtml += `<div class="usage-reauth-hint">ターミナルで <code>claude</code> を実行して再認証してください</div>`;
          }
          container.innerHTML = errorHtml;
          return;
        }

        const usage = data.usage;
        let html = '';

        // 5時間制限
        if (usage.five_hour) {
          const resetTime = new Date(usage.five_hour.resets_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          html += createUsageBar('5時間制限', usage.five_hour.utilization, `${resetTime} リセット`);
        }

        // 7日間制限
        if (usage.seven_day) {
          const resetDate = new Date(usage.seven_day.resets_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
          html += createUsageBar('7日間制限', usage.seven_day.utilization, `${resetDate} リセット`);
        }

        // 追加使用枠 (Pro/Max)
        if (usage.extra_usage && usage.extra_usage.is_enabled) {
          const used = usage.extra_usage.used_credits.toFixed(0);
          const limit = usage.extra_usage.monthly_limit;
          html += createUsageBar('追加使用枠', usage.extra_usage.utilization, `${used}/${limit} クレジット`);
        }

        // サブスクリプションタイプ
        html += `<div class="subscription-type">プラン: ${escapeHtml(data.subscriptionType)}</div>`;

        container.innerHTML = html || '<div class="usage-error">使用量データがありません</div>';
      } catch (e) {
        container.innerHTML = `<div class="usage-error">取得エラー: ${escapeHtml(e.message)}</div>`;
      }
    }

    function createUsageBar(label, utilization, subText) {
      const percent = Math.min(100, Math.max(0, utilization));
      const colorClass = percent >= 100 ? 'usage-critical' : percent >= 80 ? 'usage-warning' : 'usage-normal';
      return `
        <div class="usage-item">
          <div class="usage-label-row">
            <span class="usage-label">${escapeHtml(label)}</span>
            <span class="usage-percent">${percent.toFixed(0)}%</span>
          </div>
          <div class="usage-bar">
            <div class="usage-bar-fill ${colorClass}" style="width: ${percent}%"></div>
          </div>
          <div class="usage-subtext">${escapeHtml(subText)}</div>
        </div>
      `;
    }

    // 使用量更新ボタン
    const refreshUsageBtn = document.getElementById('refresh-usage-btn');
    if (refreshUsageBtn) {
      refreshUsageBtn.addEventListener('click', fetchClaudeUsage);
    }

    // ===========================================
    // ステータスバー使用量インジケーター
    // ===========================================

    const usageIndicator = document.getElementById('usage-indicator');
    const usage5hEl = document.getElementById('usage-5h');
    const usage7dEl = document.getElementById('usage-7d');
    const usageRefreshBtn = document.getElementById('usage-refresh');

    // パーセントに応じたCSSクラスを返す
    function getUsageClass(percent) {
      if (percent >= 100) return 'usage-critical';
      if (percent >= 80) return 'usage-warning';
      return 'usage-normal';
    }

    // ステータスバーの使用量インジケーターを更新
    async function updateUsageIndicator() {
      if (usageRefreshBtn) {
        usageRefreshBtn.classList.add('spinning');
      }

      try {
        const response = await fetch('/api/usage/claude');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();

        if (!data.success) {
          // エラー時は非表示
          if (usageIndicator) usageIndicator.classList.add('hidden');
          return;
        }

        lastUsageData = data.usage;

        // 5時間制限
        if (data.usage.five_hour && usage5hEl) {
          const percent = Math.min(100, Math.max(0, data.usage.five_hour.utilization));
          usage5hEl.textContent = `${percent.toFixed(0)}%`;
          usage5hEl.className = 'usage-value ' + getUsageClass(percent);
        }

        // 7日間制限
        if (data.usage.seven_day && usage7dEl) {
          const percent = Math.min(100, Math.max(0, data.usage.seven_day.utilization));
          usage7dEl.textContent = `${percent.toFixed(0)}%`;
          usage7dEl.className = 'usage-value ' + getUsageClass(percent);
        }

        // インジケーターを表示
        if (usageIndicator) {
          usageIndicator.classList.remove('hidden');
        }

        log('使用量インジケーター更新完了');
      } catch (e) {
        log('使用量インジケーター更新エラー: ' + e.message);
        // エラー時は非表示
        if (usageIndicator) usageIndicator.classList.add('hidden');
      } finally {
        if (usageRefreshBtn) {
          usageRefreshBtn.classList.remove('spinning');
        }
      }
    }

    // 定期更新を開始
    function startUsageUpdates() {
      // まず即時更新
      updateUsageIndicator();
      // 5分間隔で更新
      if (usageUpdateTimer) {
        clearInterval(usageUpdateTimer);
      }
      usageUpdateTimer = setInterval(updateUsageIndicator, USAGE_UPDATE_INTERVAL);
      log('使用量定期更新開始');
    }

    // 定期更新を停止
    function stopUsageUpdates() {
      if (usageUpdateTimer) {
        clearInterval(usageUpdateTimer);
        usageUpdateTimer = null;
      }
      if (usageIndicator) {
        usageIndicator.classList.add('hidden');
      }
      log('使用量定期更新停止');
    }

    // インジケータークリック → 設定パネルを開く
    if (usageIndicator) {
      usageIndicator.addEventListener('click', (e) => {
        // 更新ボタンクリックは除外
        if (e.target === usageRefreshBtn || e.target.closest('.usage-refresh-btn')) {
          return;
        }
        openSettings();
      });
      usageIndicator.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSettings();
        }
      });
    }

    // 更新ボタンクリック → 即時更新
    if (usageRefreshBtn) {
      usageRefreshBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // インジケーターのクリックイベントを発火させない
        updateUsageIndicator();
      });
    }

    // 設定ボタン: キーボード状態維持 + タップ/スワイプ判定
    let settingsBtnWasFocused = false;
    let settingsBtnStartX = 0;
    let settingsBtnStartY = 0;
    let settingsTouchEndProcessed = false;

    settingsToggle.addEventListener('touchstart', (e) => {
      settingsBtnWasFocused = document.activeElement === term.textarea;
      settingsBtnStartX = e.touches[0].clientX;
      settingsBtnStartY = e.touches[0].clientY;
    }, { passive: true });

    settingsToggle.addEventListener('touchend', (e) => {
      const deltaX = Math.abs(e.changedTouches[0].clientX - settingsBtnStartX);
      const deltaY = Math.abs(e.changedTouches[0].clientY - settingsBtnStartY);
      if (deltaX > 10 || deltaY > 10) return; // スワイプは無視

      e.preventDefault();
      e.stopPropagation();
      openSettings();
      settingsTouchEndProcessed = true;
      setTimeout(() => { settingsTouchEndProcessed = false; }, 400);
    });

    settingsToggle.addEventListener('click', (e) => {
      // touchendで処理済みならスキップ
      if (settingsTouchEndProcessed) return;
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      openSettings();
    });
    settingsClose.addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', closeSettings);

    // セッション切断ボタン
    if (detachSessionBtn) {
      detachSessionBtn.addEventListener('click', detachSession);
    }

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

    // テーマ切り替え
    function applyTheme(themeName) {
      currentTheme = themeName;
      document.documentElement.setAttribute('data-theme', themeName);
      localStorage.setItem(STORAGE_KEY_THEME, themeName);
      
      // メタテーマカラーを更新
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.content = themeName === 'light' ? '#faf8f4' : '#1a1915';
      }
      
      // xtermテーマを更新
      if (term) {
        term.options.theme = THEMES[themeName];
      }
      
      // ボタンの状態を更新
      const themeLightBtn = document.getElementById('theme-light');
      const themeDarkBtn = document.getElementById('theme-dark');
      if (themeLightBtn && themeDarkBtn) {
        themeLightBtn.classList.toggle('active', themeName === 'light');
        themeDarkBtn.classList.toggle('active', themeName === 'dark');
      }
      
      log('テーマ変更: ' + themeName);
    }

    // テーマボタンのイベント
    const themeLightBtn = document.getElementById('theme-light');
    const themeDarkBtn = document.getElementById('theme-dark');
    
    if (themeLightBtn) {
      themeLightBtn.addEventListener('click', () => applyTheme('light'));
    }
    if (themeDarkBtn) {
      themeDarkBtn.addEventListener('click', () => applyTheme('dark'));
    }

    // 初期状態でボタンを更新
    if (themeLightBtn && themeDarkBtn) {
      themeLightBtn.classList.toggle('active', currentTheme === 'light');
      themeDarkBtn.classList.toggle('active', currentTheme === 'dark');
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

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

    // ===========================================
    // スクロールモード用タッチイベント
    // ===========================================

    let scrollAccumulator = 0; // スクロール量の蓄積用
    let lastScrollTime = 0; // 最後にスクロールコマンドを送信した時刻
    const SCROLL_THROTTLE = 30; // 30ms間隔でコマンド送信

    // ターミナル領域内かどうかを判定
    function isTouchInTerminal(touch) {
      const rect = terminalElement.getBoundingClientRect();
      return touch.clientX >= rect.left && touch.clientX <= rect.right &&
             touch.clientY >= rect.top && touch.clientY <= rect.bottom;
    }

    // スクロールモード用touchstart（documentレベル、captureフェーズ）
    document.addEventListener('touchstart', (e) => {
      if (!scrollModeActive) return;
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      if (!isTouchInTerminal(touch)) return;

      scrollTouchStartY = touch.clientY;
      scrollLastY = scrollTouchStartY;
      scrollTouchIdentifier = touch.identifier;
    }, { passive: true, capture: true });

    // スクロールモード用touchmove（documentレベル、captureフェーズ）
    document.addEventListener('touchmove', (e) => {
      if (!scrollModeActive) return;
      if (scrollTouchIdentifier === null) return;

      const touch = Array.from(e.touches).find(t => t.identifier === scrollTouchIdentifier);
      if (!touch) return;

      e.preventDefault(); // デフォルトスクロール抑制

      const currentY = touch.clientY;
      const deltaY = scrollLastY - currentY;
      scrollLastY = currentY;

      // tmuxコピーモード中はCtrl+u/Ctrl+dで半ページスクロール
      scrollAccumulator += deltaY;
      const threshold = 50; // 50px移動で半ページ
      const now = Date.now();

      // スロットリング: 前回送信から一定時間経過していない場合はスキップ
      if (now - lastScrollTime < SCROLL_THROTTLE) {
        return;
      }

      // 蓄積量に応じてスクロールコマンドを送信（1回のみ）
      if (Math.abs(scrollAccumulator) >= threshold) {
        if (scrollAccumulator > 0) {
          // 上にスワイプ → Ctrl+d（下にスクロール＝過去を見る）
          if (socket && socket.connected) {
            socket.emit('input', '\x04'); // Ctrl+d
          }
          scrollAccumulator -= threshold;
        } else {
          // 下にスワイプ → Ctrl+u（上にスクロール＝新しい方を見る）
          if (socket && socket.connected) {
            socket.emit('input', '\x15'); // Ctrl+u
          }
          scrollAccumulator += threshold;
        }
        lastScrollTime = now;
      }
    }, { passive: false, capture: true });

    // スクロールモード用touchend（documentレベル）
    document.addEventListener('touchend', (e) => {
      if (scrollModeActive && scrollTouchIdentifier !== null) {
        scrollTouchIdentifier = null;
        scrollAccumulator = 0;
      }
    }, { passive: true, capture: true });

    // ===========================================
    // セッションタブバーのイベントハンドラ
    // ===========================================

    // コンテキストメニュー要素
    const tabContextMenu = document.getElementById('tab-context-menu');
    const tabContextOverlay = document.getElementById('tab-context-overlay');
    const tabMenuRename = document.getElementById('tab-menu-rename');
    const tabMenuDelete = document.getElementById('tab-menu-delete');

    // 長押し検出用の変数
    let tabLongPressTimer = null;
    let tabLongPressTarget = null;
    let tabLongPressSessionName = null;
    let tabTouchStartX = 0;
    let tabTouchStartY = 0;
    const TAB_LONG_PRESS_DURATION = 500; // 500ms

    // コンテキストメニューを表示
    function showTabContextMenu(sessionName, x, y) {
      if (!tabContextMenu || !tabContextOverlay) return;

      tabLongPressSessionName = sessionName;

      // メニューを表示
      tabContextMenu.classList.remove('hidden');
      tabContextOverlay.classList.remove('hidden');

      // 位置を調整（画面からはみ出さないように）
      const menuRect = tabContextMenu.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;

      let menuX = x;
      let menuY = y;

      // 右端からはみ出す場合
      if (menuX + menuRect.width > screenWidth - 10) {
        menuX = screenWidth - menuRect.width - 10;
      }
      // 左端からはみ出す場合
      if (menuX < 10) {
        menuX = 10;
      }
      // 下端からはみ出す場合（上に表示）
      if (menuY + menuRect.height > screenHeight - 10) {
        menuY = y - menuRect.height - 10;
      }

      tabContextMenu.style.left = menuX + 'px';
      tabContextMenu.style.top = menuY + 'px';

      // Lucide Iconsを再初期化（メニュー内のアイコン用）
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }

      log('コンテキストメニュー表示: ' + sessionName);
    }

    // コンテキストメニューを非表示
    function hideTabContextMenu() {
      if (!tabContextMenu || !tabContextOverlay) return;

      tabContextMenu.classList.add('hidden');
      tabContextOverlay.classList.add('hidden');
      tabLongPressSessionName = null;
    }

    // タブからセッションを削除（タブバー用）
    async function deleteSessionFromTab(sessionName) {
      if (!confirm('このセッションを削除しますか？')) {
        return;
      }

      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        log('セッション削除: ' + sessionName);
        showToast('セッションを削除しました', 'success');

        // 削除したのが現在のセッションの場合
        if (sessionName === currentSessionName) {
          // セッションリストを更新
          const sessions = await fetchSessions();
          sessionListCache = sessions;

          if (sessions.length > 0) {
            // 他のセッションがあれば切り替え
            switchSession(sessions[0].name);
          } else {
            // セッションがなければセッション一覧画面へ
            isAttached = false;
            currentSessionName = null;
            renderSessionList(sessions);
            showSessionManager();
          }
        } else {
          // 別のセッションを削除した場合はタブを更新するだけ
          await updateSessionTabs();
        }
      } catch (e) {
        log('セッション削除エラー: ' + e.message);
        showToast('セッションの削除に失敗しました: ' + e.message, 'error');
      }
    }

    // タブからセッション名を変更（タブバー用）
    async function renameSessionFromTab(sessionName) {
      // セッション一覧から表示名を取得
      const session = sessionListCache.find(s => s.name === sessionName);
      const currentDisplayName = session ? session.displayName : sessionName.replace(/^ccw_/, '');
      const newName = prompt('新しいセッション名を入力:\n（英数字、ハイフン、アンダースコア、ドットのみ）', currentDisplayName);

      if (!newName || newName.trim() === '' || newName.trim() === currentDisplayName) {
        return;
      }

      // クライアント側でも簡易バリデーション
      const trimmedName = newName.trim();
      if (!/^[a-zA-Z0-9_\-\.]{1,50}$/.test(trimmedName)) {
        showToast('無効なセッション名です。英数字、ハイフン、アンダースコア、ドットのみ使用可能（1-50文字）', 'error', 5000);
        return;
      }

      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/rename`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName: trimmedName })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        log('セッション名変更: ' + sessionName + ' -> ' + trimmedName);
        showToast('セッション名を変更しました', 'success');

        // タブを更新
        await updateSessionTabs();

        // 現在のセッションならステータスバーも更新
        if (sessionName === currentSessionName) {
          setStatus('connected', trimmedName);
        }
      } catch (e) {
        log('セッション名変更エラー: ' + e.message);
        showToast('名前の変更に失敗しました: ' + e.message, 'error');
      }
    }

    // タブバーのタッチイベント（長押し検出）
    if (sessionTabsContainer) {
      sessionTabsContainer.addEventListener('touchstart', (e) => {
        const tab = e.target.closest('.session-tab');
        if (!tab) return;

        tabTouchStartX = e.touches[0].clientX;
        tabTouchStartY = e.touches[0].clientY;
        tabLongPressTarget = tab;

        // 長押しタイマー開始
        tabLongPressTimer = setTimeout(() => {
          // 長押し発動
          const sessionName = tab.dataset.session;
          if (sessionName) {
            // ハプティックフィードバック（対応デバイスのみ）
            if (navigator.vibrate) {
              navigator.vibrate(50);
            }
            // 視覚フィードバック
            tab.classList.add('long-press-active');
            setTimeout(() => tab.classList.remove('long-press-active'), 150);

            // コンテキストメニューを表示
            showTabContextMenu(sessionName, tabTouchStartX, tabTouchStartY - 60);
          }
          tabLongPressTimer = null;
        }, TAB_LONG_PRESS_DURATION);
      }, { passive: true });

      sessionTabsContainer.addEventListener('touchmove', (e) => {
        // 移動したら長押しキャンセル
        if (tabLongPressTimer) {
          const deltaX = Math.abs(e.touches[0].clientX - tabTouchStartX);
          const deltaY = Math.abs(e.touches[0].clientY - tabTouchStartY);
          if (deltaX > 10 || deltaY > 10) {
            clearTimeout(tabLongPressTimer);
            tabLongPressTimer = null;
            tabLongPressTarget = null;
          }
        }
      }, { passive: true });

      sessionTabsContainer.addEventListener('touchend', (e) => {
        // 長押しタイマーキャンセル
        if (tabLongPressTimer) {
          clearTimeout(tabLongPressTimer);
          tabLongPressTimer = null;

          // 通常のタップ処理（セッション切り替え）
          const tab = e.target.closest('.session-tab');
          if (tab) {
            const deltaX = Math.abs(e.changedTouches[0].clientX - tabTouchStartX);
            const deltaY = Math.abs(e.changedTouches[0].clientY - tabTouchStartY);
            // タップ判定（移動が少ない場合のみ）
            if (deltaX < 10 && deltaY < 10) {
              const sessionName = tab.dataset.session;
              switchSession(sessionName);
            }
          }
        }
        tabLongPressTarget = null;
      }, { passive: true });

      sessionTabsContainer.addEventListener('touchcancel', () => {
        if (tabLongPressTimer) {
          clearTimeout(tabLongPressTimer);
          tabLongPressTimer = null;
        }
        tabLongPressTarget = null;
      }, { passive: true });

      // デスクトップ向けクリックハンドラ
      sessionTabsContainer.addEventListener('click', (e) => {
        // タッチデバイスではtouchendで処理済みなのでスキップ
        if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;

        const tab = e.target.closest('.session-tab');
        if (tab) {
          const sessionName = tab.dataset.session;
          switchSession(sessionName);
        }
      });
    }

    // コンテキストメニューのイベントハンドラ
    if (tabContextOverlay) {
      tabContextOverlay.addEventListener('click', hideTabContextMenu);
    }

    if (tabMenuRename) {
      tabMenuRename.addEventListener('click', () => {
        const sessionName = tabLongPressSessionName;
        hideTabContextMenu();
        if (sessionName) {
          renameSessionFromTab(sessionName);
        }
      });
    }

    if (tabMenuDelete) {
      tabMenuDelete.addEventListener('click', () => {
        const sessionName = tabLongPressSessionName;
        hideTabContextMenu();
        if (sessionName) {
          deleteSessionFromTab(sessionName);
        }
      });
    }

    // 新規セッション追加ボタン
    if (addSessionTabBtn) {
      addSessionTabBtn.addEventListener('click', () => {
        // 新規セッションを作成してアタッチ
        attachToSession(null);
      });
    }

    // 30秒ごとにセッション一覧を更新
    setInterval(() => {
      if (isAttached) {
        updateSessionTabs();
      }
    }, 30000);

    // ===========================================
    // スワイプジェスチャー（画面端からのスワイプ）
    // ===========================================

    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeStartTime = 0;
    const EDGE_WIDTH = 40; // 画面端からの検出幅（px）
    const SWIPE_THRESHOLD_X = 50; // 水平スワイプ距離の閾値（px）
    const SWIPE_THRESHOLD_Y = 30; // 垂直移動の許容範囲（px）

    terminalElement.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      swipeStartX = touch.clientX;
      swipeStartY = touch.clientY;
      swipeStartTime = Date.now();
    }, { passive: true });

    terminalElement.addEventListener('touchend', (e) => {
      // スクロールモード中は画面端スワイプを無効化
      if (scrollModeActive) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - swipeStartX;
      const deltaY = Math.abs(touch.clientY - swipeStartY);
      const deltaTime = Date.now() - swipeStartTime;
      const screenWidth = window.innerWidth;

      // スワイプ判定: 水平50px以上、垂直30px以下、500ms以内
      if (Math.abs(deltaX) < SWIPE_THRESHOLD_X || deltaY > SWIPE_THRESHOLD_Y || deltaTime > 500) {
        return;
      }

      // 左端からの右スワイプ → 前のセッション
      if (swipeStartX < EDGE_WIDTH && deltaX > 0) {
        log('左端スワイプ検出: 前のセッションへ');
        switchToPreviousSession();
        return;
      }

      // 右端からの左スワイプ → 次のセッション
      if (swipeStartX > screenWidth - EDGE_WIDTH && deltaX < 0) {
        log('右端スワイプ検出: 次のセッションへ');
        switchToNextSession();
        return;
      }
    }, { passive: true });

    // ===========================================
    // チャット入力バー機能
    // ===========================================

    const chatInputBar = document.getElementById('chat-input-bar');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');

    // チャット入力バーを初期化（常時表示）
    function initChatInput() {
      if (!chatInputBar) return;
      chatInputBar.classList.remove('hidden');
      document.body.classList.add('chat-input-visible');
      updateChatInputHeight();
      log('チャット入力バー初期化（常時表示）');
    }

    // テキストエリアの高さを自動調整
    function updateChatInputHeight() {
      if (!chatInput) return;

      // 一旦高さをリセット
      chatInput.style.height = 'auto';

      // コンテンツに合わせて高さを設定（最大100px）
      const scrollHeight = chatInput.scrollHeight;
      const newHeight = Math.min(scrollHeight, 100);
      chatInput.style.height = newHeight + 'px';

      // CSS変数を更新 (padding 4px*2 + border 1px = 9px)
      const barHeight = newHeight + 9;
      document.body.style.setProperty('--chat-input-height', barHeight + 'px');
      // 注: fit()は呼ばない（DA2レスポンス問題回避）
    }

    // チャット入力を送信
    function sendChatInput() {
      if (!chatInput) return;
      const text = chatInput.value;
      if (!text.trim()) return;

      if (socket && socket.connected) {
        // テキストを送信
        socket.emit('input', text);
        // 少し遅延してEnterキーを送信（Claude Code等の入力バッファ対策）
        setTimeout(() => {
          socket.emit('input', '\r');
        }, 50);
        log('チャット入力送信: ' + text.substring(0, 50) + (text.length > 50 ? '...' : ''));
      }

      // 入力欄をクリア
      chatInput.value = '';
      updateChatInputHeight();

      // フォーカスを入力欄に維持
      chatInput.focus();
    }

    // チャット入力イベントハンドラ
    if (chatInput) {
      // 入力時に高さ調整
      chatInput.addEventListener('input', () => {
        updateChatInputHeight();
      });

      // ペースト時に高さ調整
      chatInput.addEventListener('paste', () => {
        setTimeout(updateChatInputHeight, 0);
      });
    }

    // 送信ボタン
    if (chatSendBtn) {
      let chatSendBtnStartX = 0;
      let chatSendBtnStartY = 0;

      chatSendBtn.addEventListener('touchstart', (e) => {
        chatSendBtnStartX = e.touches[0].clientX;
        chatSendBtnStartY = e.touches[0].clientY;
      }, { passive: true });

      chatSendBtn.addEventListener('touchend', (e) => {
        const deltaX = Math.abs(e.changedTouches[0].clientX - chatSendBtnStartX);
        const deltaY = Math.abs(e.changedTouches[0].clientY - chatSendBtnStartY);
        if (deltaX > 10 || deltaY > 10) return; // スワイプは無視

        e.preventDefault();
        sendChatInput();
      });

      chatSendBtn.addEventListener('click', (e) => {
        if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
        e.preventDefault();
        sendChatInput();
      });
    }

    // チャット入力バーを初期化（常時表示）
    initChatInput();

    // 初期フィット
    setTimeout(fit, 100);

    // Service Worker登録
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => log('ServiceWorker登録完了'))
        .catch(err => log('ServiceWorker登録失敗: ' + err.message));
    }

    // Lucide Iconsを初期化（少し遅延させて確実に読み込み完了を待つ）
    function initLucideIcons() {
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
        log('Lucide Icons初期化完了');
      } else {
        log('Lucide Icons未読み込み、リトライ...');
        setTimeout(initLucideIcons, 100);
      }
    }
    setTimeout(initLucideIcons, 50);

    log('初期化完了');
  });

})();
