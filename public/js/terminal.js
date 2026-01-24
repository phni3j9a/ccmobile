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
    const FONT_SIZE_MIN = 10;
    const FONT_SIZE_MAX = 24;
    const STORAGE_KEY_FONT_SIZE = 'terminal-font-size';
    const STORAGE_KEY_LAST_SESSION = 'terminal-last-session';
    const STORAGE_KEY_THEME = 'terminal-theme';

    // テーマ定義
    const THEMES = {
      dark: {
        background: '#2B2925',
        foreground: '#E8E4DD',
        cursor: '#E07A5F',
        cursorAccent: '#2B2925',
        selection: 'rgba(74, 69, 61, 0.7)',
        black: '#1E1D1A',
        red: '#E07A5F',
        green: '#8AAD8A',
        yellow: '#D4A574',
        blue: '#9BB8D8',
        magenta: '#C4A5D8',
        cyan: '#9BC8C8',
        white: '#E8E4DD',
        brightBlack: '#6B6356',
        brightRed: '#F09A84',
        brightGreen: '#A5C9A5',
        brightYellow: '#E5C99A',
        brightBlue: '#B5CFEB',
        brightMagenta: '#D8C2E8',
        brightCyan: '#B5DEDE',
        brightWhite: '#FAF9F6'
      },
      light: {
        background: '#FAF9F6',
        foreground: '#3D3929',
        cursor: '#E07A5F',
        cursorAccent: '#FAF9F6',
        selection: 'rgba(233, 213, 201, 0.7)',
        black: '#3D3929',
        red: '#D4726A',
        green: '#5E8E5E',
        yellow: '#B8860B',
        blue: '#5B7FA3',
        magenta: '#8B6DAE',
        cyan: '#528B8B',
        white: '#F5F1EB',
        brightBlack: '#6B6356',
        brightRed: '#E07A5F',
        brightGreen: '#7AAD7A',
        brightYellow: '#D4A574',
        brightBlue: '#7B9EC4',
        brightMagenta: '#A88BC4',
        brightCyan: '#7BAFAF',
        brightWhite: '#FFFCF7'
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

    let scrollModeActive = false;
    let currentFontSize = parseInt(localStorage.getItem(STORAGE_KEY_FONT_SIZE)) || 14;
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
    });

    // tmuxセッションからデタッチ
    socket.on('detached', async ({ sessionName }) => {
      log('セッションデタッチ: ' + sessionName);
      isAttached = false;
      currentSessionName = null;
      term.write('\r\n\x1b[33m[セッションから切断されました]\x1b[0m\r\n');

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

    // 特殊キーツールバー
    function sendKey(key) {
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

      // スクロールモード時もPgUp/PgDnはそのままエスケープシーケンスを送信
      // tmuxのコピーモードはPgUp/PgDnを直接認識する
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

      e.preventDefault();

      if (btn.dataset.key) {
        sendKey(btn.dataset.key);
      } else if (btn.dataset.ctrl) {
        sendCtrl(btn.dataset.ctrl);
      }

      term.focus();
    });

    // ペースト機能
    async function pasteFromClipboard(restoreFocus = true) {
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
      if (socket && socket.connected) {
        if (!scrollModeActive) {
          // コピーモードに入る
          socket.emit('input', '\x02['); // \x02 = Ctrl+b
          scrollModeActive = true;
          scrollModeBtn.classList.add('active');
          scrollModeBtn.textContent = '📜✓';
          scrollModeBtn.setAttribute('aria-pressed', 'true');
          log('スクロールモード ON');
        } else {
          // コピーモードを抜ける
          socket.emit('input', 'q');
          scrollModeActive = false;
          scrollModeBtn.classList.remove('active');
          scrollModeBtn.textContent = '📜';
          scrollModeBtn.setAttribute('aria-pressed', 'false');
          log('スクロールモード OFF');
        }
      }
      if (restoreFocus) {
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
      term.focus();
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

    settingsToggle.addEventListener('click', openSettings);
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
        metaThemeColor.content = themeName === 'light' ? '#FAF9F6' : '#2B2925';
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
    // セッションタブバーのイベントハンドラ
    // ===========================================

    // タブバーのクリック/タップイベント
    if (sessionTabsContainer) {
      sessionTabsContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.session-tab');
        if (tab) {
          const sessionName = tab.dataset.session;
          switchSession(sessionName);
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
