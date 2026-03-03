# ccmobile2 Architecture Design

**Date**: 2026-02-24
**Status**: APPROVED — User decisions finalized
**Author**: Architect Agent + Team Lead
**Research**: Researcher Agent (tech stack, library constraints, mobile UI patterns)

### User Decisions (Final)
- **Frontend**: React + Vite + TypeScript
- **Backend**: Hono + TypeScript
- **Package Manager**: npm (NOT pnpm)
- **Linter/Formatter**: Biome
- **CSS**: Tailwind CSS (NOT CSS Modules)
- **New Features**: Terminal Search + Connection Quality Indicator
- **Excluded**: PIN auth (not needed), Command palette (not in v2.0)

---

## 1. Project Overview

ccmobile2 is a complete rebuild of ccmobile, a mobile-first web terminal application for Raspberry Pi 5. The rebuild moves from vanilla JS monolith to a modular React + Hono architecture while maintaining ALL existing features and adding new capabilities.

### Design Principles

1. **Mobile-first**: Every decision prioritizes mobile touch experience
2. **Lightweight**: Runs on Raspberry Pi 5 (4GB RAM, ARM64) - no heavy dependencies
3. **Modular**: Clear separation of concerns (vs current 3,140-line monolith)
4. **Type-safe**: TypeScript throughout, catch errors at compile time
5. **Offline-resilient**: PWA with graceful degradation on connection loss
6. **Feature parity**: ALL existing features must work in v2 before adding new ones

---

## 2. Project Structure

Monorepo using npm workspaces:

```
ccmobile2/
├── package.json                    # Workspace root
├── pnpm-workspace.yaml             # pnpm workspace config
├── tsconfig.base.json              # Shared TypeScript config
├── biome.json                      # Linter + formatter config
├── .env.example                    # Environment template
├── packages/
│   ├── server/                     # Hono backend
│   │   ├── src/
│   │   │   ├── index.ts            # Entry: create app, start server
│   │   │   ├── app.ts              # Hono app factory
│   │   │   ├── config.ts           # Configuration (env-based)
│   │   │   ├── routes/
│   │   │   │   ├── sessions.ts     # GET/DELETE/PUT /api/sessions
│   │   │   │   ├── files.ts        # /api/files/* CRUD
│   │   │   │   ├── upload.ts       # /api/upload (image)
│   │   │   │   ├── usage.ts        # /api/usage/claude
│   │   │   │   └── health.ts       # /health
│   │   │   ├── services/
│   │   │   │   ├── tmux.ts         # TmuxService: session CRUD, attach
│   │   │   │   ├── file.ts         # FileService: browse, read, write, delete
│   │   │   │   ├── upload.ts       # UploadService: image + general upload
│   │   │   │   ├── oauth.ts        # OAuthService: Anthropic token refresh
│   │   │   │   └── pty.ts          # PtyService: node-pty management
│   │   │   ├── ws/
│   │   │   │   ├── handler.ts      # WebSocket connection handler
│   │   │   │   └── protocol.ts     # Message protocol types
│   │   │   ├── middleware/
│   │   │   │   ├── security.ts     # CSP headers
│   │   │   │   ├── auth.ts         # Optional PIN/password auth
│   │   │   │   ├── validation.ts   # Input validation helpers
│   │   │   │   └── error.ts        # Error handler middleware
│   │   │   └── utils/
│   │   │       ├── path.ts         # Path validation (HOME-scoped)
│   │   │       └── text.ts         # Text file detection
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── client/                     # React frontend (Vite)
│   │   ├── src/
│   │   │   ├── main.tsx            # Entry point
│   │   │   ├── App.tsx             # Root component
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   │   ├── AppShell.tsx       # Main layout wrapper
│   │   │   │   │   ├── StatusBar.tsx      # Bottom status bar
│   │   │   │   │   └── Toolbar.tsx        # Special keys toolbar
│   │   │   │   ├── terminal/
│   │   │   │   │   ├── TerminalView.tsx   # xterm.js container
│   │   │   │   │   ├── ChatInput.tsx      # Chat input bar
│   │   │   │   │   └── CopyButton.tsx     # Floating copy button
│   │   │   │   ├── session/
│   │   │   │   │   ├── SessionTabs.tsx    # Tab bar
│   │   │   │   │   ├── SessionManager.tsx # Session list/create
│   │   │   │   │   └── SessionMenu.tsx    # Context menu (rename/delete)
│   │   │   │   ├── files/
│   │   │   │   │   ├── FileManager.tsx    # File browser modal
│   │   │   │   │   ├── FileList.tsx       # Directory listing
│   │   │   │   │   ├── FileViewer.tsx     # Text/markdown viewer
│   │   │   │   │   ├── FileEditor.tsx     # Text editor
│   │   │   │   │   ├── Breadcrumb.tsx     # Path breadcrumb
│   │   │   │   │   └── BottomSheet.tsx    # File actions sheet
│   │   │   │   ├── upload/
│   │   │   │   │   └── ImageUpload.tsx    # Image upload modal
│   │   │   │   ├── settings/
│   │   │   │   │   ├── SettingsPanel.tsx  # Settings slide panel
│   │   │   │   │   ├── ThemeToggle.tsx    # Light/dark toggle
│   │   │   │   │   ├── FontSize.tsx       # Font size control
│   │   │   │   │   └── UsageDisplay.tsx   # Claude usage stats
│   │   │   │   └── shared/
│   │   │   │       ├── Modal.tsx          # Reusable modal
│   │   │   │       ├── Toast.tsx          # Toast notifications
│   │   │   │       └── Icon.tsx           # Icon wrapper (lucide-react)
│   │   │   ├── hooks/
│   │   │   │   ├── useTerminal.ts         # xterm.js lifecycle
│   │   │   │   ├── useSocket.ts           # WebSocket connection
│   │   │   │   ├── useSession.ts          # Session management
│   │   │   │   ├── useFileManager.ts      # File operations
│   │   │   │   ├── useTheme.ts            # Theme management
│   │   │   │   ├── useTouch.ts            # Touch gesture handling
│   │   │   │   └── useKeyboard.ts         # Virtual keyboard handling
│   │   │   ├── stores/
│   │   │   │   ├── terminal.ts            # Terminal state (Zustand)
│   │   │   │   ├── session.ts             # Session state
│   │   │   │   ├── settings.ts            # Settings state (persisted)
│   │   │   │   └── ui.ts                  # UI state (modals, panels)
│   │   │   ├── lib/
│   │   │   │   ├── socket.ts              # WebSocket client singleton
│   │   │   │   ├── api.ts                 # REST API client
│   │   │   │   └── constants.ts           # Shared constants
│   │   │   ├── styles/
│   │   │   │   ├── globals.css            # CSS variables, reset
│   │   │   │   ├── themes.css             # Theme definitions
│   │   │   │   └── terminal.css           # Terminal-specific styles
│   │   │   └── types/
│   │   │       ├── session.ts             # Session types
│   │   │       ├── file.ts                # File types
│   │   │       └── ws.ts                  # WebSocket message types
│   │   ├── public/
│   │   │   ├── icons/                     # PWA icons (from v1)
│   │   │   ├── manifest.json              # PWA manifest
│   │   │   └── sw.js                      # Service Worker
│   │   ├── index.html                     # Vite entry HTML
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   └── shared/                    # Shared types/utilities
│       ├── src/
│       │   ├── types.ts           # Shared TypeScript types
│       │   └── constants.ts       # Shared constants
│       ├── package.json
│       └── tsconfig.json
├── scripts/
│   └── dev.ts                     # Dev script (concurrent server + client)
└── tests/
    ├── server/                    # Backend unit tests
    ├── client/                    # Frontend unit tests
    └── e2e/                       # Playwright E2E tests
```

### Key Structural Decisions

| Decision | Rationale | Alternative |
|----------|-----------|-------------|
| npm workspaces | Standard, no extra install needed | pnpm workspaces |
| No Turborepo | Unnecessary for 2-3 packages on Pi | Turborepo |
| Biome (lint+format) | Single fast tool, replaces ESLint+Prettier | ESLint + Prettier |
| Tailwind CSS | Utility-first, rapid prototyping, small production CSS | CSS Modules |
| Shared package | Type-safe API contract | Inline types |

---

## 3. Backend Architecture (Hono)

### 3.1 Why Hono

- Ultrafast (Cloudflare Workers-grade performance)
- Lightweight (~14KB)
- TypeScript-native
- Built-in WebSocket support via `@hono/node-ws`
- Perfect for resource-constrained Raspberry Pi 5

### 3.2 Server Entry Point

```typescript
// packages/server/src/index.ts
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { app } from "./app";
import { config } from "./config";

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Export upgradeWebSocket for use in route handlers
export { upgradeWebSocket };

const server = serve(
  { fetch: app.fetch, port: config.PORT, hostname: config.HOST },
  (info) => {
    console.log(`Server running at http://${info.address}:${info.port}`);
  }
);

// CRITICAL: injectWebSocket() MUST be called AFTER serve()
injectWebSocket(server);
```

**Caveats from research**:
- `injectWebSocket(server)` MUST be called AFTER `serve(app)` — order matters
- CORS middleware and WebSocket helpers can conflict (both modify headers) — apply CORS only to `/api/*` routes, NOT to `/ws` route
- Hono uses Web Standard `Request`/`Response`, not Node.js `req`/`res`
- Define API/WS routes BEFORE static file catch-all
- Use `c.req.parseBody()` for multipart file uploads (not multer)

### 3.3 Route Design

| Method | Path | Handler | Source (v1) |
|--------|------|---------|-------------|
| GET | /api/sessions | sessions.list | server.js:289-292 |
| DELETE | /api/sessions/:name | sessions.delete | server.js:295-303 |
| PUT | /api/sessions/:name/rename | sessions.rename | server.js:306-328 |
| GET | /api/files/browse | files.browse | server.js:364-410 |
| GET | /api/files/read | files.read | server.js:413-445 |
| PUT | /api/files/write | files.write | server.js:448-485 |
| DELETE | /api/files/delete | files.delete | server.js:488-512 |
| PUT | /api/files/rename | files.rename | server.js:515-555 |
| GET | /api/files/download | files.download | server.js:558-584 |
| POST | /api/files/upload | files.upload | server.js:629-643 |
| POST | /api/upload | upload.image | server.js:695-710 |
| GET | /api/usage/claude | usage.claude | server.js:915-1027 |
| GET | /health | health.check | server.js:1212-1218 |
| GET | /ws | ws.handler | NEW (replaces Socket.IO) |

### 3.4 Service Layer

**TmuxService** (port from server.js:133-282):
```typescript
class TmuxService {
  listSessions(): Session[]           // execFileSync tmux list-sessions
  createSession(name: string): Result // new-session + apply settings
  killSession(name: string): Result   // kill-session
  sessionExists(name: string): boolean // has-session
  renameSession(old: string, new_: string): Result
  generateName(): string              // Auto-increment 1,2,3...
  applySettings(name: string): void   // mouse, history, escape-time, vi-mode
}
```

**PtyService** (port from server.js:217-238):
```typescript
class PtyService {
  attach(sessionName: string): IPty   // pty.spawn('tmux', ['attach-session'])
  // PTY lifecycle managed per-connection in WS handler
  // Filters DA1/DA2 responses: /\x1b\[[\?>]?[0-9;]*c/g
}
```

**FileService** (port from server.js:337-643):
```typescript
class FileService {
  browse(path: string, showHidden: boolean): DirectoryListing
  read(path: string): FileContent
  write(path: string, content: string): Result
  delete(path: string): Result
  rename(path: string, newName: string): Result
  download(path: string): ReadStream
  isText(filename: string): boolean
  isBinary(path: string): boolean
  validatePath(path: string): string  // HOME-scoped validation
}
```

**OAuthService** (port from server.js:772-912):
```typescript
class OAuthService {
  refreshAccessToken(refreshToken: string): Promise<TokenResult>
  updateCredentials(tokenData: TokenData): boolean
  ensureValidToken(oauth: OAuthConfig): Promise<ValidTokenResult>
}
```

### 3.5 WebSocket Protocol

Replace Socket.IO with native WebSocket. Messages are JSON-encoded:

```typescript
// Client → Server
type ClientMessage =
  | { type: "attach"; sessionName?: string }
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "switch"; sessionName: string }
  | { type: "ping" };

// Server → Client
type ServerMessage =
  | { type: "attached"; sessionName: string; displayName: string }
  | { type: "switched"; sessionName: string; displayName: string; oldSessionName: string }
  | { type: "output"; data: string }
  | { type: "detached"; exitCode: number; signal: number; sessionName: string }
  | { type: "error"; message: string; error?: string }
  | { type: "pong" };
```

### 3.6 Socket.IO vs Native WebSocket

**Decision: Native WebSocket via `@hono/node-ws`**

| Factor | Socket.IO | Native WS |
|--------|-----------|-----------|
| Client bundle | +90KB | 0KB (browser native) |
| Auto-reconnect | Built-in | Custom (~50 lines) |
| Long-polling fallback | Yes | No (not needed) |
| Binary support | Yes | Yes (not needed) |
| Rooms/namespaces | Yes | No (not needed) |
| Hono integration | Possible | First-class |

Current Socket.IO usage is simple emit/on patterns with no rooms, namespaces, or binary data. Migration is straightforward.

**Optimization from research**: Use binary frames for terminal data (input/output), JSON only for control messages (attach, switch, resize). This reduces serialization overhead for the most frequent messages. Set `ws.binaryType = 'arraybuffer'` on client.

---

## 4. Frontend Component Architecture

### 4.1 Component Tree

```
App
├── ToastProvider
├── AppShell
│   ├── SessionManager (full-screen when no active session)
│   │   ├── SessionList
│   │   └── NewSessionButton
│   ├── TerminalView (main content)
│   │   ├── xterm.js canvas (ref-based, NOT React-managed)
│   │   ├── CopyButton (floating, on selection)
│   │   └── OfflineBanner (on disconnect)
│   ├── ChatInput (always visible)
│   ├── Toolbar (special keys, horizontally scrollable)
│   ├── SessionTabs (tab bar)
│   │   ├── SessionTab[] (tap=switch, long-press=context menu)
│   │   ├── AddSessionButton
│   │   └── SessionMenu (context: rename/delete)
│   └── StatusBar (connection + usage)
├── SettingsPanel (slide-in from right)
│   ├── ThemeToggle
│   ├── FontSize
│   ├── UsageDisplay
│   └── SessionDetach
├── FileManager (modal, lazy-loaded)
│   ├── Breadcrumb
│   ├── FileList
│   ├── FileViewer (markdown + syntax highlight)
│   ├── FileEditor
│   └── BottomSheet (rename/download/delete)
├── ImageUpload (modal, lazy-loaded)
└── PasteModal
```

### 4.2 State Management: Zustand

**Decision: Zustand** over Jotai/Context

Rationale:
- Minimal API, zero boilerplate (~1KB)
- Works outside React (useful for WebSocket message handlers)
- No provider wrapper needed
- Built-in persist middleware for localStorage
- Proven at scale in mobile apps

```typescript
// stores/terminal.ts
interface TerminalStore {
  isAttached: boolean;
  currentSession: string | null;
  scrollMode: boolean;
  connected: boolean;
  setAttached: (v: boolean) => void;
  setCurrentSession: (name: string | null) => void;
  toggleScrollMode: () => void;
  setConnected: (v: boolean) => void;
}

// stores/session.ts
interface SessionStore {
  sessions: Session[];
  setSessions: (s: Session[]) => void;
  fetchSessions: () => Promise<void>;
}

// stores/settings.ts (persisted to localStorage)
interface SettingsStore {
  theme: "light" | "dark";
  fontSize: number;
  lastSession: string | null;
  setTheme: (t: "light" | "dark") => void;
  setFontSize: (s: number) => void;
  setLastSession: (n: string | null) => void;
}

// stores/ui.ts
interface UIStore {
  settingsOpen: boolean;
  fileManagerOpen: boolean;
  imageUploadOpen: boolean;
  pasteModalOpen: boolean;
  toggleSettings: () => void;
  openFileManager: () => void;
  closeFileManager: () => void;
  openImageUpload: () => void;
  closeImageUpload: () => void;
}
```

### 4.3 Key Custom Hooks

**useTerminal** — xterm.js lifecycle (ref-based, NOT React state):
```typescript
function useTerminal(containerRef: RefObject<HTMLDivElement>) {
  // Creates Terminal + addons on mount
  // Disposes on unmount
  // Syncs theme/fontSize from Zustand store
  // Returns { termRef, fit }
}
```

**useSocket** — WebSocket with auto-reconnect:
```typescript
function useSocket(url: string) {
  // Creates WebSocket, auto-reconnects on close
  // Exponential backoff: 1s → 1.5s → 2.25s → ... → max 5s
  // Dispatches parsed messages to handlers
  // Returns { send, connected, reconnect }
}
```

**useSession** — Session lifecycle:
```typescript
function useSession(socket, term) {
  // Wires attach/switch/detach events
  // Connects PTY output → term.write
  // Connects term.onData → socket.send(input)
  // Manages session tab state
  // Returns { attach, switchSession, detach }
}
```

**useTouch** — Gesture abstraction:
```typescript
function useTouch(ref: RefObject<HTMLElement>, options) {
  // Tap detection (< 10px movement, < 300ms)
  // Swipe detection (> 50px horizontal, < 30px vertical)
  // Long-press detection (500ms hold, < 10px movement)
  // Returns callbacks for each gesture type
}
```

### 4.4 xterm.js v6 in React — Critical Pattern

xterm.js is imperative. It MUST be managed via refs, never via React state:

```typescript
export function useTerminal(containerRef: RefObject<HTMLDivElement>) {
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { theme, fontSize } = useSettingsStore();

  // Initialize once on mount
  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      fontFamily: '"Noto Sans Mono CJK JP", "Noto Sans Mono", monospace',
      fontSize,
      theme: THEMES[theme],
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new Unicode11Addon());
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;
    fitAddonRef.current = fitAddon;
    return () => term.dispose();
  }, []); // Empty deps - create once

  // React to theme changes
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = THEMES[theme];
  }, [theme]);

  // React to fontSize changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  return { termRef, fitAddonRef };
}
```

**Performance rules**:
- Terminal canvas is never re-rendered by React
- Only Zustand state changes (theme, fontSize) trigger Terminal option updates
- Touch events registered once on mount via useEffect
- Use `React.memo` on TerminalView parent components
- Use `ResizeObserver` + `requestAnimationFrame` for fit debouncing (not setTimeout)
- Consider `scrollback: 1000-5000` range (save memory on Pi)

**Caveats from research**:
- **CSS required**: Must `import '@xterm/xterm/css/xterm.css'` or rendering breaks
- **React StrictMode**: Effects run twice in dev — guard `terminal.open()` against double-init
- **Container must have size**: Container div needs explicit width/height before `terminal.open()`
- **Never call `terminal.open()` twice** — dispose first
- **Focus triggers keyboard**: On mobile, `terminal.focus()` opens virtual keyboard — be intentional
- Packages are `@xterm/` scoped: `@xterm/xterm`, `@xterm/addon-fit`, etc.

**Reference files**:
- `.claude/docs/libraries/xterm-react.md` — Complete useXterm hook, TerminalView component, mobile keyboard handling
- `.claude/docs/libraries/hono.md` — Hono patterns, auth, file upload, route organization

---

## 5. UI Layout Design

### 5.1 Screen Layout (Mobile)

```
┌──────────────────────────────┐
│                              │
│       Terminal View           │  ← Full screen, flex-grow
│       (xterm.js canvas)      │
│                              │
│                              │
│                              │
├──────────────────────────────┤
│ [Message input...]    [Send] │  ← Chat input bar (auto-height)
├──────────────────────────────┤
│ ⎙ ⚙ 📷 📁 Esc Tab ⇧Tab ↑↓ │  ← Toolbar (h-scrollable)
├──────────────────────────────┤
│ [1] [2] [claude]       [+]  │  ← Session tabs (h-scrollable)
├──────────────────────────────┤
│ ● session  5h:42% | 7d:15%  │  ← Status bar
└──────────────────────────────┘
```

### 5.2 Visual Theme

Keep current Claude-inspired warm palette (excellent quality):

```css
/* Dark theme */
--bg: #1a1915;
--fg: #e8e4dc;
--cursor: #d97757;
--accent: #d97757;
--border: #3a3530;

/* Light theme */
--bg: #faf8f4;
--fg: #2d2a24;
--cursor: #c4551d;
--accent: #c4551d;
--border: #d8d4cc;
```

### 5.3 CSS Architecture

CSS Modules (built into Vite) + CSS custom properties:

```
styles/
├── globals.css     # Reset, CSS variables, body styles
├── themes.css      # Theme color definitions
└── terminal.css    # xterm.js overrides
```

Each component has co-located `.module.css`:
```
components/session/SessionTabs.tsx
components/session/SessionTabs.module.css
```

### 5.4 Touch Interactions (ALL preserved from v1)

| Gesture | Target | Action | Source |
|---------|--------|--------|--------|
| Tap (< 10px, < 300ms) | Terminal | Focus + show keyboard | terminal.js:2502-2521 |
| Tap | Toolbar button | Send key (with swipe filter) | terminal.js:796-884 |
| Tap | Session tab | Switch session | terminal.js:2869-2908 |
| Tap | File item | Open file/download | terminal.js:1542-1546 |
| Long-press (500ms) | File item | Show bottom sheet | terminal.js:1489-1504 |
| Long-press (500ms) | Session tab | Show context menu | terminal.js:2826-2854 |
| Edge swipe (left) | Terminal | Previous session | terminal.js:2985-2987 |
| Edge swipe (right) | Terminal | Next session | terminal.js:2992-2994 |
| 1-finger scroll | Terminal | Convert to WheelEvent | terminal.js:2527-2591 |
| Scroll mode drag | Terminal | tmux Ctrl+u/Ctrl+d | terminal.js:2601-2655 |

### 5.5 New Gesture Ideas

| Gesture | Action | Priority |
|---------|--------|----------|
| Two-finger pinch | Font size adjust | Medium |
| Double-tap terminal | Quick paste | Low |
| Pull-down from top | Command palette | Low |

---

## 6. New Features

### 6.1 PIN Authentication (Priority: HIGH)

```
Server: AUTH_PIN env var → bcrypt-hashed PIN
Login: POST /api/auth/login { pin } → JWT in httpOnly cookie (24h TTL)
Middleware: Hono built-in jwt() middleware reads from cookie, protects /api/* and /ws
Client: Full-screen PIN pad → stores nothing (cookie is httpOnly)
Rate limit: Login endpoint limited to prevent brute force
```

Implementation uses Hono's built-in `jwt` middleware + `setCookie`:
```typescript
// Protect API routes
app.use('/api/*', jwt({ secret: JWT_SECRET, cookie: 'token' }))
// Login endpoint (unprotected)
app.post('/api/auth/login', async (c) => {
  // Verify PIN → sign JWT → setCookie(c, 'token', jwt, { httpOnly: true })
})
```

### 6.2 Terminal Search (Priority: MEDIUM)

```
xterm.js SearchAddon → search bar overlay
Trigger: Toolbar button or Ctrl+Shift+F
Features: Case-sensitive toggle, regex toggle
```

### 6.3 Command Palette (Priority: MEDIUM)

```
Trigger: Ctrl+K or toolbar button
Actions: Switch session, open file manager, settings, etc.
UI: Overlay with fuzzy search input
```

### 6.4 Connection Quality Indicator (Priority: LOW)

```
Periodic ping/pong with timestamp measurement
Status bar: Green (< 100ms), Yellow (< 500ms), Red (> 500ms)
```

### 6.5 Push Notifications (Priority: LOW)

```
Monitor PTY output for shell prompt after long commands
Web Notifications API via ServiceWorker
Configurable threshold (default: 10s)
```

---

## 7. WebSocket Reconnection Strategy

Custom implementation replacing Socket.IO's auto-reconnect:

```typescript
class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private maxDelay = 5000;

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.attempts = 0;
      this.onConnected();
    };
    this.ws.onclose = () => {
      const delay = Math.min(1000 * Math.pow(1.5, this.attempts), this.maxDelay);
      this.attempts++;
      setTimeout(() => this.connect(), delay);
    };
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      this.dispatch(msg);
    };
  }
}
```

Must preserve these behaviors from v1:
- Auto-reconnect on disconnect (infinite attempts)
- Re-attach to last session on reconnect
- `visibilitychange` handler (wake from background)
- `pageshow` handler (bfcache recovery)
- 30-second keepalive ping

---

## 8. Implementation Plan

### Phase 1: Project Scaffolding
- Initialize monorepo (pnpm workspaces)
- TypeScript configs (base + per-package)
- Vite config for client
- Hono server skeleton with dev mode (tsx watch)
- Shared types package
- Biome config (lint + format)
- Dev script (concurrently runs server + client)

### Phase 2: Core Terminal
- Port TmuxService (server.js:133-282)
- Port PtyService (server.js:217-238)
- Implement Hono WebSocket handler (replaces Socket.IO)
- Create useSocket hook (reconnection logic)
- Create useTerminal hook (xterm.js + addons)
- Wire WS ↔ Terminal (input/output/resize)
- Port virtual keyboard height detection

### Phase 3: Session Management
- Port session REST APIs (list/delete/rename)
- Create Zustand session store
- Create SessionManager (initial full-screen view)
- Create SessionTabs (tab bar + add button)
- Session switching via WebSocket
- Edge-swipe gesture (prev/next session)
- Tab long-press context menu (rename/delete)

### Phase 4: Toolbar & Input
- Create Toolbar (special keys, h-scrollable)
- Port tap/swipe detection for toolbar buttons
- Scroll mode (tmux copy mode toggle)
- 1-finger touch scroll → WheelEvent conversion
- Scroll mode drag → tmux Ctrl+u/Ctrl+d
- Create ChatInput (auto-height textarea + send)
- Create CopyButton (floating, on selection)
- iOS Safari clipboard handling

### Phase 5: File Manager
- Port file REST APIs (all CRUD + upload + download)
- Create FileManager modal
- Create FileList (directory listing with icons)
- Create Breadcrumb navigation
- Create FileViewer (markdown via marked, code via highlight.js)
- Create FileEditor (textarea)
- Create BottomSheet (long-press: rename/download/delete)
- File upload to current directory
- New file creation

### Phase 6: Image Upload
- Port image upload API (multer equivalent)
- Create ImageUpload modal
- File selection + MIME validation + preview
- Upload with progress (XHR)
- Result path display + copy + terminal insertion

### Phase 7: Settings & Theme
- Create SettingsPanel (slide-in)
- Port theme system (CSS variables, data-theme attribute)
- Port xterm.js theme objects (dark + light)
- Font size control (min 6, max 24)
- Zustand persist middleware (theme, fontSize, lastSession)
- Port meta theme-color update

### Phase 8: OAuth & Usage
- Port OAuthService (Anthropic token refresh)
- Port Claude usage API endpoint
- Create UsageDisplay (settings panel)
- Create StatusBar usage indicator
- 5-minute auto-refresh timer

### Phase 9: PWA & Polish
- Use `vite-plugin-pwa` with `generateSW` strategy (researcher recommendation)
- Migrate manifest.json + icons
- CSP headers (Hono middleware)
- HTTPS setup notes
- Paste modal (Clipboard API fallback)
- Offline banner + manual reconnect
- Toast notification system
- Image cleanup cron (7-day TTL)

### Phase 10: New Features
- PIN authentication (env-based)
- Terminal search (SearchAddon)
- Command palette (optional)

### Phase 11: Testing
- Server unit tests (Vitest): TmuxService, FileService
- Store unit tests (Vitest): Zustand stores
- WebSocket integration tests
- E2E tests (Playwright): full workflows

---

## 9. Risk Assessment

### HIGH RISK: Hono WebSocket + node-pty

**Risk**: `@hono/node-ws` may have edge cases with long-lived PTY connections, binary data handling, or connection cleanup.

**Mitigation**: Prototype in Phase 2. If issues arise, use `ws` library directly alongside Hono HTTP routes. Socket.IO remains a final fallback (add `socket.io` adapter for Hono).

### MEDIUM RISK: xterm.js in React

**Risk**: React re-renders could cause terminal flickering, input lag, or memory leaks.

**Mitigation**: Ref-based pattern (never put Terminal in state). Memo parent components. Keep terminal container DOM-stable. Test on actual Pi 5.

### MEDIUM RISK: Mobile Touch Regression

**Risk**: 3,140 lines of touch handling could regress during migration.

**Mitigation**: Port touch handlers with minimal changes first. Create `useTouch` abstraction. Test on iOS Safari (PWA mode) and Android Chrome. E2E tests for critical gestures.

### MEDIUM RISK: Socket.IO → Native WebSocket

**Risk**: Loss of auto-reconnect reliability, especially on flaky mobile networks.

**Mitigation**: Custom reconnection with exponential backoff. Visibility change handlers. If unreliable, Socket.IO works with Hono too.

### LOW RISK: Bundle Size

**Risk**: React + deps too large for Pi's slow network.

**Target**: < 200KB gzipped. React (~40KB) + xterm.js (~80KB) + app code (~30KB) + lucide (~5KB) = ~155KB.
**Mitigation**: Lazy-load FileManager, ImageUpload. Tree-shake lucide-react.

---

## 10. Dependencies

### Server

| Package | Purpose | Approx Size |
|---------|---------|-------------|
| `hono` | Web framework | ~14KB |
| `@hono/node-server` | Node.js adapter | ~5KB |
| `@hono/node-ws` | WebSocket | ~3KB |
| `node-pty` | PTY spawning | Native addon |
| `zod` | Validation | ~13KB |
| `dotenv` | Env loading | ~3KB |

### Client

| Package | Purpose | Gzipped |
|---------|---------|---------|
| `react` + `react-dom` | UI | ~40KB |
| `@xterm/xterm` | Terminal | ~80KB |
| `@xterm/addon-fit` | Auto-resize | ~2KB |
| `@xterm/addon-unicode11` | Unicode | ~1KB |
| `@xterm/addon-web-links` | Links | ~2KB |
| `@xterm/addon-search` | Search (NEW) | ~3KB |
| `zustand` | State | ~1KB |
| `lucide-react` | Icons | ~5KB used |
| `marked` | Markdown | ~7KB |
| `highlight.js` | Syntax | Lazy-loaded |

### Dev

| Package | Purpose |
|---------|---------|
| `typescript` | Type checking |
| `vite` | Build |
| `@vitejs/plugin-react` | React in Vite |
| `@biomejs/biome` | Lint + format |
| `vitest` | Unit tests |
| `@playwright/test` | E2E tests |
| `concurrently` | Dev server runner |
| `tsx` | TypeScript execution (server dev) |

---

## 11. Feature Parity Checklist

Every feature from ccmobile v1 mapped to ccmobile2:

| v1 Feature | v2 Component | Phase |
|------------|--------------|-------|
| xterm.js terminal | TerminalView + useTerminal | 2 |
| Socket.IO real-time | useSocket (native WS) | 2 |
| Terminal resize (fit) | useTerminal (FitAddon) | 2 |
| Session list/create | SessionManager | 3 |
| Session switch | SessionTabs + useSession | 3 |
| Session rename/delete | SessionMenu | 3 |
| Session tab bar | SessionTabs | 3 |
| Edge-swipe session switch | useTouch in TerminalView | 3 |
| Tab long-press menu | useTouch in SessionTabs | 3 |
| Special keys toolbar | Toolbar | 4 |
| Toolbar tap/swipe detection | useTouch in Toolbar | 4 |
| Scroll mode (tmux copy) | Toolbar + useTerminal | 4 |
| 1-finger touch scroll | useTouch in TerminalView | 4 |
| Chat input bar | ChatInput | 4 |
| Copy button (floating) | CopyButton | 4 |
| iOS Safari clipboard | CopyButton + PasteModal | 4 |
| File browse/list | FileManager + FileList | 5 |
| File read (view) | FileViewer | 5 |
| File write (edit) | FileEditor | 5 |
| File delete/rename | BottomSheet | 5 |
| File upload | FileManager | 5 |
| File download | FileList | 5 |
| Breadcrumb navigation | Breadcrumb | 5 |
| Bottom sheet (actions) | BottomSheet | 5 |
| Markdown rendering | FileViewer (marked) | 5 |
| Syntax highlighting | FileViewer (highlight.js) | 5 |
| New file creation | FileManager | 5 |
| Image upload | ImageUpload | 6 |
| Image path insertion | ImageUpload | 6 |
| Upload progress | ImageUpload | 6 |
| Theme light/dark | ThemeToggle + useTheme | 7 |
| Font size control | FontSize | 7 |
| Settings panel | SettingsPanel | 7 |
| Session detach | SettingsPanel | 7 |
| Claude usage display | UsageDisplay | 8 |
| Usage status bar | StatusBar | 8 |
| OAuth token refresh | OAuthService | 8 |
| PWA (service worker) | sw.js + manifest.json | 9 |
| Offline banner | OfflineBanner | 9 |
| Manual reconnect | OfflineBanner | 9 |
| Toast notifications | Toast | 9 |
| Paste modal | PasteModal | 9 |
| Auto-reconnect | useSocket | 2 |
| Visibility change handler | useSocket | 2 |
| bfcache recovery | useSocket | 2 |
| Keepalive ping | useSocket | 2 |
| Image cleanup (7d) | Server cron | 9 |

**All 42 features accounted for.**

---

## 12. Open Questions for User

1. **Package manager**: pnpm (recommended) vs npm?
2. **Linter**: Biome (recommended, single tool) vs ESLint + Prettier?
3. **CSS approach**: CSS Modules (recommended) vs Tailwind CSS?
4. **Markdown renderer**: Keep `marked` (lighter) vs `react-markdown` (React-native)?
5. **New features priority**: Which of PIN auth, terminal search, command palette to include in v2.0?
