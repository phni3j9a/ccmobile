# ccmobile Codebase Analysis Report

**Date**: 2026-02-24  
**Analyzer**: Gemini CLI (gemini-3-pro, 1M context)  
**Project**: Claude Code Web Terminal for Mobile (ccmobile)

---

## 1. Directory Structure & Organization

```
ccmobile/
├── server.js              # Backend entry point (1,253 lines)
├── config.js              # Centralized configuration (83 lines)
├── package.json           # Node.js dependencies
├── public/                # Frontend static assets
│   ├── index.html         # Main HTML (336 lines)
│   ├── css/
│   │   └── style.css      # All styles (2,394 lines)
│   ├── js/
│   │   └── terminal.js    # Monolithic frontend controller (3,140 lines)
│   ├── icons/             # PWA icons (192, 512, SVG)
│   ├── manifest.json      # PWA manifest
│   ├── sw.js              # Service Worker
│   └── rootCA.crt         # CA certificate for HTTPS
├── scripts/               # Utility scripts
├── tmp/                   # Temporary files (screenshots, etc.)
├── test-results/          # Playwright test results
├── localhost+2*.pem       # TLS certificates (mkcert)
├── README.md              # Documentation (Japanese)
├── SECURITY.md            # Security policy
├── CONTRIBUTING.md        # Contribution guide
├── CHANGELOG.md           # Change log
├── EULA.md                # End user license agreement
├── LICENSE                # MIT License
└── .claude/ .gemini/ .codex/  # AI agent configurations
```

**Total source code**: ~7,206 lines across 5 main files.

## 2. Key Modules & Responsibilities

| Module | File | Lines | Responsibility |
|--------|------|-------|----------------|
| **Backend Server** | `server.js` | 1,253 | Express server, Socket.IO, node-pty, tmux management, File API, auth helper |
| **Configuration** | `config.js` | 83 | Centralized config (ports, timeouts, upload limits) from env vars |
| **Frontend Controller** | `public/js/terminal.js` | 3,140 | Monolithic SPA: xterm.js integration, Socket.IO client, virtual keyboard, file manager UI, theme, session UI |
| **Styles** | `public/css/style.css` | 2,394 | All CSS: terminal, modals, toolbar, file manager, themes, responsive |
| **HTML Shell** | `public/index.html` | 336 | Main HTML structure, CDN script/style imports, modal templates |
| **Service Worker** | `public/sw.js` | ~100 | PWA offline caching |

## 3. Architecture Patterns

### 3.1 Client-Server Model
- **Frontend**: Single Page Application (SPA), vanilla JS (no framework)
- **Backend**: Node.js + Express, dual role as web server and terminal host
- **Communication**: Socket.IO for real-time bidirectional terminal I/O

### 3.2 Terminal Emulation Strategy
```
Mobile Browser (xterm.js)
    ↕ Socket.IO (WebSocket)
Node.js Server (node-pty)
    ↕ PTY
tmux session
    ↕
Shell (bash/zsh)
```

- **xterm.js** renders the terminal in the browser
- **Socket.IO** transports keystrokes (client→server) and terminal output (server→client)
- **node-pty** spawns pseudo-terminal processes on the server
- **tmux** provides session persistence - critical for mobile use where connections drop frequently

### 3.3 File System Access
- RESTful API endpoints (`/api/files/*`) provide CRUD operations
- Scoped to user's HOME directory for security
- Supports: browse, read, write, delete, rename, download, upload

### 3.4 PWA Architecture
- Service Worker for offline caching
- manifest.json for installable app experience
- HTTPS via mkcert self-signed certificates

## 4. Dependencies & Tech Stack

### Backend Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `express` | 4.22.1 | HTTP server & routing |
| `socket.io` | 4.8.1 | Real-time WebSocket communication |
| `node-pty` | 1.0.0 | Pseudo-terminal forking (spawns tmux) |
| `helmet` | 8.0.0 | Security headers (CSP) |
| `multer` | ^2.0.2 | File upload handling (multipart/form-data) |
| `dotenv` | 16.4.7 | Environment variable loading (optional) |

### Frontend Dependencies (CDN)
| Library | Version | Purpose |
|---------|---------|---------|
| `xterm.js` | - | Terminal emulator rendering |
| `socket.io-client` | - | WebSocket client |
| `marked` | @15 | Markdown rendering (file viewer) |
| `highlight.js` | @11 | Syntax highlighting (file viewer) |
| `lucide` | - | Icon set |

### Dev Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `playwright` | ^1.58.0 | E2E testing |

### Runtime Requirements
- Node.js >= 18.0.0
- tmux (system package)
- Raspberry Pi OS (primary target)

## 5. UI/UX Features & Components

### 5.1 Terminal Interface
- Full terminal emulation via xterm.js
- Responsive sizing (auto-fit to viewport)
- Touch-optimized for mobile devices

### 5.2 Virtual Keyboard & Special Keys Toolbar
- Custom on-screen toolbar for keys missing on mobile keyboards
- Keys: Esc, Tab, Ctrl, Alt, Arrow keys, pipe, etc.
- Touch event handling: touchstart/touchend/click with tap vs swipe detection
- Scroll button for terminal output navigation

### 5.3 Session Management
- Multiple tmux sessions via GUI
- Create, rename, switch, kill sessions
- Sequential naming (1, 2, 3...)
- Visual session selector

### 5.4 File Manager
- Built-in file browser modal (bottom sheet pattern)
- Browse files in HOME directory
- Text file editing with syntax highlighting
- Markdown rendering for .md files
- File upload (50MB limit) and download
- File operations: rename, delete (via long-press bottom sheet)
- Binary vs text detection (extension + byte check)

### 5.5 Theme Support
- Light and dark modes
- Toggle via UI button

### 5.6 PWA Features
- Installable as mobile app
- Service worker for offline capability
- App-like experience (no browser chrome)

## 6. Security Model

### 6.1 Transport Security
- HTTPS via mkcert self-signed certificates
- Helmet with custom CSP (Content Security Policy)
- Allowed CDN: cdn.jsdelivr.net

### 6.2 Input Validation
- Session names: regex validation (`/^[a-zA-Z0-9_\-\.]{1,50}$/`) prevents shell injection
- File paths: resolved and validated against HOME directory (path traversal prevention)
- File uploads: 50MB size limit via multer

### 6.3 Authentication
- **No user authentication** - designed for single-user use on private network
- Assumes network-level security (LAN/VPN access only)
- Server runs with user's permissions

### 6.4 Anthropic Token Management
- Special logic to refresh Anthropic OAuth tokens
- Modifies `credentials.json` for Claude CLI integration

### 6.5 z-index Hierarchy
| Element | z-index |
|---------|---------|
| Overlay | 1999 |
| Modal | 2000 |
| Toast | 2000 |
| Bottom sheet overlay | 2001 |
| Bottom sheet | 2002 |

## 7. Configuration Management

### config.js Structure
- Port configuration (default: 3000)
- Timeout values
- Upload size limits
- Environment variable based (`process.env`)

### Environment Variables
- Loaded via dotenv (optional dependency)
- `.env.example` provided as template

## 8. Known Limitations & Areas for Improvement

### 8.1 Monolithic Frontend (Critical)
- `terminal.js` at 3,140 lines is a single monolithic file
- Mixes concerns: DOM manipulation, business logic, networking, file management, theme handling
- **Recommendation**: Split into modules:
  - `TerminalController.js` - xterm.js and terminal logic
  - `SocketManager.js` - Socket.IO communication
  - `FileManager.js` - File browser and editor
  - `KeyboardManager.js` - Virtual keyboard and special keys
  - `SessionManager.js` - tmux session management
  - `ThemeManager.js` - Theme toggling

### 8.2 Large CSS File
- `style.css` at 2,394 lines covers all components
- Could benefit from splitting by component or using CSS modules

### 8.3 No Authentication
- Dangerous if exposed to public internet
- Should add at minimum basic auth or token-based authentication

### 8.4 No Automated Test Coverage
- Playwright is installed but test-results directory suggests limited testing
- No unit tests for server-side logic
- No integration tests for Socket.IO communication

### 8.5 Global Exception Handlers
- `uncaughtException` handler in server.js masks potential crash bugs
- Should use process managers (PM2) for crash recovery instead

### 8.6 Hardcoded Paths
- Often defaults to `process.env.HOME`
- No configurable workspace root option

### 8.7 No Build Pipeline
- Frontend served as raw JS (no bundling, minification, or tree-shaking)
- CDN dependencies could be vendored for offline reliability

## 9. Code Quality Observations

### Positives
- Well-commented code (Japanese comments explaining complex logic)
- Good edge case handling (binary file detection, viewport resize, mobile keyboard quirks)
- Centralized configuration via config.js
- Security considerations (CSP, path validation, input sanitization)
- tmux integration provides robust session persistence

### Concerns
- **Frontend modularity**: Single 3,140-line file violates single responsibility principle
- **CSS organization**: All styles in one file
- **No TypeScript**: Large JS codebase without type safety
- **No linting/formatting config** for JS (ruff config is for Python)
- **Vanilla JS only**: No framework means manual DOM management and potential memory leaks

## 10. File Sizes & Complexity Distribution

| File | Lines | Bytes | Complexity |
|------|-------|-------|------------|
| `public/js/terminal.js` | 3,140 | 110,133 | **Very High** - monolithic controller |
| `public/css/style.css` | 2,394 | 48,946 | **High** - all styles combined |
| `server.js` | 1,253 | 40,935 | **Medium** - well-structured but large |
| `public/index.html` | 336 | 15,975 | **Low** - mostly structure |
| `config.js` | 83 | 3,310 | **Low** - clean configuration |
| **Total** | **7,206** | **219,299** | |

### Complexity Hotspots
1. **terminal.js** - Touch event handling, virtual keyboard management, file manager UI
2. **server.js** - tmux process management, file API, token refresh
3. **style.css** - Mobile responsive styles, theme variables, modal/overlay stacking

---

## Summary

ccmobile is a purpose-built web terminal application optimized for accessing a Raspberry Pi 5 from mobile devices. It leverages tmux for session persistence, xterm.js for terminal rendering, and includes a full file manager. The primary technical debt is the monolithic frontend architecture (single 3,140-line JS file) which should be modularized. The application lacks authentication (by design for private network use) and automated testing. Despite these concerns, the code is well-commented and handles many edge cases specific to mobile terminal usage.
