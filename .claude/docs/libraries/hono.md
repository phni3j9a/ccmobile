# Hono Framework — Library Constraints & Patterns

Reference for using Hono in ccmobile2 (Node.js backend).

## Packages Required

```json
{
  "dependencies": {
    "hono": "^4.x",
    "@hono/node-server": "^1.x",
    "@hono/node-ws": "^1.3.x"
  }
}
```

## Node.js Adapter Setup

```typescript
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => c.text('Hello Hono'))

const server = serve({
  fetch: app.fetch,
  port: 3000,
}, (info) => {
  console.log(`Server running at http://localhost:${info.port}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
```

## WebSocket (Node.js)

**IMPORTANT**: Must use `@hono/node-ws`, NOT the built-in `hono/cloudflare-workers` or `hono/deno` WebSocket helpers.

```typescript
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

app.get('/ws/terminal/:sessionId', upgradeWebSocket((c) => {
  const sessionId = c.req.param('sessionId')

  return {
    onOpen(event, ws) {
      // Create/attach PTY for this session
      console.log(`Terminal session ${sessionId} connected`)
    },
    onMessage(event, ws) {
      // Forward input to PTY
      const data = event.data
      // pty.write(data)
    },
    onClose(event, ws) {
      // Cleanup PTY if needed
      console.log(`Terminal session ${sessionId} disconnected`)
    },
    onError(event, ws) {
      console.error('WebSocket error:', event)
    }
  }
}))

const server = serve(app)
injectWebSocket(server)  // MUST call after serve()
```

### WebSocket Caveats
- `injectWebSocket(server)` must be called AFTER `serve(app)`
- WebSocket helpers + CORS middleware can conflict (both modify headers)
  - Apply CORS only to API routes, not WebSocket routes
- Event handler `ws` object has: `send()`, `close()`, `readyState`

## Static File Serving

```typescript
import { serveStatic } from '@hono/node-server/serve-static'

// Serve Vite build output
app.use('/*', serveStatic({ root: './dist' }))

// With cache headers
app.use('/assets/*', serveStatic({
  root: './dist',
  onFound: (_path, c) => {
    c.header('Cache-Control', 'public, immutable, max-age=31536000')
  }
}))

// Fallback for SPA routing
app.get('*', serveStatic({ path: './dist/index.html' }))
```

## File Upload (Multipart)

```typescript
import { bodyLimit } from 'hono/body-limit'

app.post('/api/files/upload',
  bodyLimit({
    maxSize: 50 * 1024 * 1024, // 50MB
    onError: (c) => c.json({ error: 'File too large' }, 413),
  }),
  async (c) => {
    const body = await c.req.parseBody()
    if (body['file'] instanceof File) {
      const buffer = await body['file'].arrayBuffer()
      // Write to filesystem
      return c.json({ success: true, size: body['file'].size })
    }
    return c.json({ error: 'No file' }, 400)
  }
)
```

## Middleware Stack

```typescript
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { jwt } from 'hono/jwt'
import { setCookie, getCookie } from 'hono/cookie'

// Global middleware
app.use('*', logger())

// CORS for API routes only (NOT WebSocket routes)
app.use('/api/*', cors({
  origin: ['http://localhost:5173'], // Vite dev server
  credentials: true,
}))

// JWT auth for protected routes
app.use('/api/*', jwt({
  secret: process.env.JWT_SECRET!,
  cookie: 'token',  // Read JWT from cookie
}))
```

## Authentication Pattern

```typescript
import { sign, verify } from 'hono/jwt'
import { setCookie } from 'hono/cookie'

// Login endpoint (NOT protected by JWT middleware)
app.post('/api/auth/login', async (c) => {
  const { pin } = await c.req.json()

  if (!await verifyPin(pin)) {
    return c.json({ error: 'Invalid PIN' }, 401)
  }

  const token = await sign(
    { exp: Math.floor(Date.now() / 1000) + 86400 },
    process.env.JWT_SECRET!
  )

  setCookie(c, 'token', token, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 86400,
    path: '/',
  })

  return c.json({ success: true })
})

// Logout
app.post('/api/auth/logout', (c) => {
  setCookie(c, 'token', '', { maxAge: 0, path: '/' })
  return c.json({ success: true })
})
```

## Error Handling

```typescript
// Global error handler
app.onError((err, c) => {
  console.error(`Error: ${err.message}`)
  return c.json({ error: 'Internal server error' }, 500)
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404)
})
```

## Route Organization

```typescript
// routes/terminal.ts
import { Hono } from 'hono'
const terminal = new Hono()

terminal.get('/sessions', async (c) => { /* list sessions */ })
terminal.post('/sessions', async (c) => { /* create session */ })
terminal.delete('/sessions/:id', async (c) => { /* delete session */ })

export default terminal

// routes/files.ts
import { Hono } from 'hono'
const files = new Hono()

files.get('/browse', async (c) => { /* browse files */ })
files.get('/read', async (c) => { /* read file */ })
files.put('/write', async (c) => { /* write file */ })

export default files

// index.ts
app.route('/api/terminal', terminal)
app.route('/api/files', files)
```

## Constraints & Gotchas

1. **Node.js only**: Use `@hono/node-server`, not `hono/bun` or `hono/deno`
2. **WebSocket**: Must use `@hono/node-ws` (separate package)
3. **No `req`/`res`**: Hono uses Web Standard `Request`/`Response` objects
4. **File system**: Use Node.js `fs` module directly (no Hono abstraction)
5. **Body parsing**: `c.req.json()` for JSON, `c.req.parseBody()` for multipart
6. **CORS + WS conflict**: Don't apply CORS middleware to WebSocket routes
7. **Serve order matters**: Define API/WS routes BEFORE static file catch-all
