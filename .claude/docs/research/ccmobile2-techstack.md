# ccmobile2 Tech Stack Research

Research findings for the ccmobile2 rebuild (mobile web terminal for Raspberry Pi 5).

---

## 1. Hono Framework (Node.js)

### Overview
- **Latest stable**: v4.x (ultrafast, Web Standards-based framework)
- **Node.js adapter**: `@hono/node-server` (requires Node.js 18+)
- **TypeScript**: First-class support, built in TypeScript
- **Performance**: ~4x faster than Express in benchmarks, approaching Fastify

### Key Features for ccmobile2
- **WebSocket**: `@hono/node-ws` package provides WebSocket support for Node.js
- **Static files**: `@hono/node-server/serve-static` middleware
- **File upload**: `bodyLimit` middleware + `c.req.parseBody()` for multipart
- **Middleware**: logger, cors, etag, jwt, basic-auth, cookie, body-limit all built-in
- **RPC**: Type-safe client-server communication via `hc` client

### WebSocket Setup (Node.js)
```typescript
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

app.get('/ws', upgradeWebSocket((c) => ({
  onOpen(event, ws) { /* connection opened */ },
  onMessage(event, ws) { /* handle message */ },
  onClose(event, ws) { /* connection closed */ },
  onError(event, ws) { /* handle error */ },
})))

const server = serve(app)
injectWebSocket(server)
```

### node-pty Integration
- No built-in node-pty support, but straightforward integration:
  - Create pty in `onOpen`, pipe data via `onMessage`/`ws.send()`
  - Same pattern as Express/ws — just different WebSocket API surface
- The `@hono/node-ws` uses standard `ws` library underneath

### Authentication Options
- **JWT middleware** (built-in): `hono/jwt` — verify token from header or cookie
- **Basic Auth** (built-in): `hono/basic-auth` — simple username/password
- **Cookie sessions**: `hono_sessions` (third-party) — cookie-based sessions
- **Recommendation for single-user LAN app**: JWT stored in httpOnly cookie
  - Simple PIN/password login → generate JWT → store in httpOnly cookie
  - JWT middleware protects all API routes
  - No external auth service needed

### Caveats
- WebSocket + CORS middleware can conflict (both modify headers)
- `@hono/node-ws` is separate package from core Hono
- Node.js adapter uses Web Standards APIs internally (not native req/res)

### Verdict: RECOMMENDED
Hono is an excellent Express replacement with better TypeScript, performance, and modern API design. WebSocket support via `@hono/node-ws` is mature enough for terminal streaming.

---

## 2. xterm.js + React Integration

### xterm.js v6 Status
- **Package**: `@xterm/xterm` (v6 uses scoped packages)
- **Addons** (all scoped under `@xterm/`):
  - `@xterm/addon-fit` — Auto-resize terminal to container
  - `@xterm/addon-web-links` — Clickable URLs in terminal
  - `@xterm/addon-unicode11` — Better Unicode character rendering
  - `@xterm/addon-webgl` — GPU-accelerated rendering (if needed)
  - `@xterm/addon-canvas` — Canvas-based renderer (fallback)

### React Integration Approaches

#### Option A: Custom Hook (RECOMMENDED)
No maintained, up-to-date React wrapper exists for xterm.js v6. Build a custom hook:

```typescript
import { useRef, useEffect, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

function useXterm(options?: ITerminalOptions) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal(options);
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(terminalRef.current);

    return () => {
      observer.disconnect();
      terminal.dispose();
    };
  }, []);

  return { terminalRef, xtermRef, fitAddonRef };
}
```

#### Option B: Existing Libraries
- `@pablo-lion/xterm-react` — Most active, but may lag behind xterm.js v6
- `react-xtermjs` (Qovery) — Provides component + hook, but unknown v6 support
- `xterm-for-react` — Outdated, no hooks support

### Performance Considerations
- Use `ResizeObserver` instead of window resize event for container fitting
- Debounce resize events (100ms) to avoid excessive reflows
- WebGL renderer significantly improves performance for heavy output
- On mobile (Raspberry Pi access via phone), canvas renderer may be sufficient

### Verdict: Custom useXterm hook
Build a custom React hook wrapping xterm.js v6 directly. This gives full control and avoids dependency on potentially unmaintained wrappers.

---

## 3. Socket.IO vs Native WebSocket

### Performance Comparison
| Metric | Native WebSocket | Socket.IO |
|--------|-----------------|-----------|
| Latency | Lower (raw binary) | Higher (event wrapping + serialization) |
| Memory (10K connections) | ~201 MB | ~2 GB |
| Message overhead | Minimal | Event name + JSON envelope |
| Binary support | Native | Supported but wrapped |

### Socket.IO Advantages
- Automatic reconnection with backoff
- Room/namespace multiplexing
- Fallback to long-polling when WS unavailable
- Built-in acknowledgements

### For Terminal Streaming (node-pty)
- Terminal data is high-frequency, small messages → native WS is better
- Reconnection can be implemented manually (simpler for single-user)
- No need for rooms/namespaces in single-user app
- Binary transfer (terminal output) more efficient with raw WS

### Recommendation: Native WebSocket via @hono/node-ws
- Use `@hono/node-ws` for WebSocket connections
- Implement manual reconnection logic on the client (simple exponential backoff)
- Use binary frames for terminal data where possible
- For terminal resize events, use JSON messages on same connection

---

## 4. React + Vite Project Structure

### Recommended Structure for ccmobile2
```
ccmobile2/
├── public/
│   ├── manifest.json          # PWA manifest
│   └── icons/                 # PWA icons
├── src/
│   ├── main.tsx               # Entry point
│   ├── App.tsx                # Root component
│   ├── router.tsx             # React Router setup
│   ├── components/
│   │   ├── ui/                # Reusable UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── BottomSheet.tsx
│   │   ├── terminal/          # Terminal-specific components
│   │   │   ├── TerminalView.tsx
│   │   │   ├── TerminalToolbar.tsx
│   │   │   └── VirtualKeyboard.tsx
│   │   ├── file-manager/      # File manager components
│   │   └── layout/            # Layout components
│   ├── hooks/
│   │   ├── useXterm.ts        # xterm.js integration
│   │   ├── useWebSocket.ts    # WebSocket connection
│   │   ├── useSession.ts      # Terminal session management
│   │   └── useAuth.ts         # Authentication
│   ├── services/
│   │   ├── api.ts             # REST API client
│   │   ├── terminal.ts        # Terminal service (WS + pty)
│   │   └── fileManager.ts     # File operations
│   ├── stores/                # State management (Zustand or Context)
│   │   ├── sessionStore.ts
│   │   └── settingsStore.ts
│   ├── types/
│   │   └── index.ts           # Shared TypeScript types
│   ├── styles/
│   │   └── global.css
│   └── utils/
│       └── helpers.ts
├── server/                    # Hono backend
│   ├── index.ts               # Server entry
│   ├── routes/
│   │   ├── terminal.ts        # Terminal WebSocket routes
│   │   ├── files.ts           # File manager API
│   │   ├── auth.ts            # Authentication routes
│   │   └── sessions.ts        # Session management
│   ├── services/
│   │   ├── pty.ts             # node-pty management
│   │   └── fileSystem.ts      # File operations
│   └── middleware/
│       └── auth.ts            # Auth middleware
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
└── package.json
```

### Key Decisions
- **Monorepo or separate**: Single repo with `src/` (frontend) and `server/` (backend)
- **State management**: Zustand (lightweight) over Redux for this app size
- **Routing**: React Router v7 (latest) — minimal routes needed
- **CSS**: CSS Modules or Tailwind CSS — either works for component-scoped styles

---

## 5. PWA with React + Vite

### Setup: vite-plugin-pwa
```bash
npm install vite-plugin-pwa --save-dev
```

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ccmobile2',
        short_name: 'ccmobile2',
        description: 'Mobile Web Terminal for Raspberry Pi',
        theme_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        icons: [/* icon entries */]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'cdn-cache', expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 } }
          }
        ]
      }
    })
  ]
})
```

### Strategies
- **generateSW** (default): Auto-generates service worker — sufficient for ccmobile2
- **injectManifest**: For custom SW logic — use if complex offline behavior needed
- **Caching**: Cache static assets aggressively, API responses with network-first
- **Offline**: Terminal requires live connection, so offline mode is limited to UI shell

---

## 6. Mobile Terminal UI Design Patterns

### Learnings from Termius & Blink Shell

**Termius (Feature-Rich)**:
- Multi-tab interface with split-view
- Virtual keyboard with special keys (Ctrl, Alt, Esc, Tab, arrows)
- One-tap connection (saved sessions)
- Customizable themes/fonts per connection
- SFTP file browser alongside terminal

**Blink Shell (Minimalist)**:
- Full-screen terminal (no menus/chrome)
- Mosh support for unstable connections
- Bluetooth keyboard with customizable key mappings (Caps → Esc)
- HTerm-based rendering for speed
- Gesture-based navigation

### Design Principles for ccmobile2
1. **Maximize terminal space**: Full-screen by default, collapsible toolbar
2. **Thumb-friendly**: Critical actions in bottom zone (keyboard toolbar)
3. **Virtual keyboard toolbar**: Special keys row above system keyboard
   - Must include: Ctrl, Alt, Esc, Tab, arrows, pipe, tilde
   - Swipeable for more keys
4. **Touch gestures**:
   - Swipe up/down: Scroll through output
   - Two-finger tap: Paste
   - Long press: Context menu (copy/paste/select)
5. **Session tabs**: Swipeable tab bar at top or bottom
6. **Haptic feedback**: Vibration on key press (if available)
7. **Safe area**: Respect iOS notch/home indicator areas

### Responsive Sizing
- Use `FitAddon` with `ResizeObserver` for dynamic terminal sizing
- Account for virtual keyboard appearing/hiding (viewport resize)
- Use `visualViewport` API for accurate viewport with keyboard

---

## 7. Authentication for Single-User LAN App

### Recommended: JWT + PIN/Password

```
Flow:
1. User opens app → sees login screen (PIN input)
2. POST /api/auth/login { pin: "1234" }
3. Server validates PIN (hashed in config)
4. Server returns JWT in httpOnly cookie
5. All subsequent requests include cookie automatically
6. JWT middleware protects all routes
```

### Implementation with Hono
```typescript
import { jwt } from 'hono/jwt'
import { setCookie, getCookie } from 'hono/cookie'

// Protect API routes
app.use('/api/*', jwt({ secret: JWT_SECRET, cookie: 'token' }))

// Login
app.post('/api/auth/login', async (c) => {
  const { pin } = await c.req.json()
  if (!verifyPin(pin)) return c.json({ error: 'Invalid PIN' }, 401)

  const token = await sign({ exp: Math.floor(Date.now() / 1000) + 86400 }, JWT_SECRET)
  setCookie(c, 'token', token, { httpOnly: true, sameSite: 'Lax', maxAge: 86400 })
  return c.json({ success: true })
})
```

### Security Considerations
- **httpOnly cookie**: Prevents XSS from stealing token
- **SameSite=Lax**: CSRF protection (adequate for LAN)
- **HTTPS optional**: On LAN, HTTP is acceptable but HTTPS preferred
- **Rate limiting**: Apply to login endpoint (prevent brute force)
- **PIN hashing**: Use bcrypt/argon2 for stored PIN hash
- **Token expiry**: 24h is reasonable for LAN single-user

### Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| JWT + cookie | Simple, stateless, built-in Hono support | Token rotation complexity |
| Session cookie | Simple, server-controlled | Requires session store |
| API key in header | Simplest | Manual header management on frontend |
| No auth | Zero friction | Insecure even on LAN |

---

## Summary of Recommendations

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Backend framework** | Hono + @hono/node-server | Fast, TypeScript-first, modern, built-in middleware |
| **WebSocket** | @hono/node-ws (native WS) | Lower overhead than Socket.IO, sufficient for single-user |
| **Frontend framework** | React + Vite | Standard, fast builds, excellent PWA support |
| **Terminal** | @xterm/xterm v6 + custom hook | Direct control, no wrapper dependency |
| **State management** | Zustand | Lightweight, simple API, TypeScript support |
| **PWA** | vite-plugin-pwa | Zero-config, auto service worker generation |
| **Auth** | JWT in httpOnly cookie | Simple, stateless, built-in Hono support |
| **CSS** | CSS Modules (or Tailwind) | Scoped styles, no runtime overhead |
| **Monorepo** | Single package, src/ + server/ | Simple for small team, shared types |
