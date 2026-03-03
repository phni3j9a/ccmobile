# xterm.js + React Integration Guide

Reference for integrating xterm.js v6 with React in ccmobile2.

## Packages Required

```json
{
  "dependencies": {
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0",
    "@xterm/addon-unicode11": "^0.8.0"
  }
}
```

> Note: xterm.js v6 uses `@xterm/` scoped packages. Version numbers may differ — check npm for latest.

## CSS Import

```typescript
// Must import xterm.js CSS
import '@xterm/xterm/css/xterm.css'
```

## Custom Hook: useXterm (Recommended Pattern)

```typescript
// hooks/useXterm.ts
import { useRef, useEffect, useCallback } from 'react'
import { Terminal, ITerminalOptions } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'

interface UseXtermOptions extends ITerminalOptions {
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
  onTitleChange?: (title: string) => void
}

interface UseXtermReturn {
  containerRef: React.RefObject<HTMLDivElement>
  terminal: Terminal | null
  fit: () => void
  write: (data: string | Uint8Array) => void
  clear: () => void
  focus: () => void
}

export function useXterm(options: UseXtermOptions = {}): UseXtermReturn {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  const { onData, onResize, onTitleChange, ...termOptions } = options

  useEffect(() => {
    if (!containerRef.current) return

    // Create terminal
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#f0f0f0',
      },
      allowProposedApi: true,
      ...termOptions,
    })

    // Load addons
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())

    const unicode11 = new Unicode11Addon()
    terminal.loadAddon(unicode11)
    terminal.unicode.activeVersion = '11'

    // Open terminal
    terminal.open(containerRef.current)
    fitAddon.fit()

    // Store refs
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Event handlers
    if (onData) {
      terminal.onData(onData)
    }
    if (onResize) {
      terminal.onResize(({ cols, rows }) => onResize(cols, rows))
    }
    if (onTitleChange) {
      terminal.onTitleChange(onTitleChange)
    }

    // ResizeObserver for container changes
    const observer = new ResizeObserver(() => {
      // Debounce fit calls
      requestAnimationFrame(() => {
        fitAddon.fit()
      })
    })
    observer.observe(containerRef.current)
    observerRef.current = observer

    // Cleanup
    return () => {
      observer.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, []) // Empty deps — terminal created once

  const fit = useCallback(() => {
    fitAddonRef.current?.fit()
  }, [])

  const write = useCallback((data: string | Uint8Array) => {
    terminalRef.current?.write(data)
  }, [])

  const clear = useCallback(() => {
    terminalRef.current?.clear()
  }, [])

  const focus = useCallback(() => {
    terminalRef.current?.focus()
  }, [])

  return {
    containerRef,
    terminal: terminalRef.current,
    fit,
    write,
    clear,
    focus,
  }
}
```

## Terminal Component

```typescript
// components/terminal/TerminalView.tsx
import React, { useEffect } from 'react'
import { useXterm } from '../../hooks/useXterm'
import { useWebSocket } from '../../hooks/useWebSocket'

interface TerminalViewProps {
  sessionId: string
  className?: string
}

export function TerminalView({ sessionId, className }: TerminalViewProps) {
  const { containerRef, write, fit } = useXterm({
    onData: (data) => {
      // Send terminal input to server via WebSocket
      ws.send(data)
    },
    onResize: (cols, rows) => {
      // Notify server of terminal resize
      ws.sendJSON({ type: 'resize', cols, rows })
    },
  })

  const ws = useWebSocket(`/ws/terminal/${sessionId}`, {
    onMessage: (data) => {
      // Write server output to terminal
      write(data)
    },
    onOpen: () => {
      fit() // Ensure terminal is sized correctly
    },
  })

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    />
  )
}
```

## WebSocket Hook

```typescript
// hooks/useWebSocket.ts
import { useRef, useEffect, useCallback } from 'react'

interface UseWebSocketOptions {
  onMessage?: (data: string | ArrayBuffer) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  reconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

export function useWebSocket(path: string, options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectCount = useRef(0)
  const {
    onMessage, onOpen, onClose, onError,
    reconnect = true,
    reconnectInterval = 1000,
    maxReconnectAttempts = 10,
  } = options

  const connect = useCallback(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${location.host}${path}`
    const ws = new WebSocket(url)

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      reconnectCount.current = 0
      onOpen?.()
    }

    ws.onmessage = (event) => {
      onMessage?.(event.data)
    }

    ws.onclose = () => {
      onClose?.()
      if (reconnect && reconnectCount.current < maxReconnectAttempts) {
        const delay = reconnectInterval * Math.pow(2, reconnectCount.current)
        reconnectCount.current++
        setTimeout(connect, Math.min(delay, 30000))
      }
    }

    ws.onerror = (error) => {
      onError?.(error)
    }

    wsRef.current = ws
  }, [path])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((data: string | ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  const sendJSON = useCallback((data: unknown) => {
    send(JSON.stringify(data))
  }, [send])

  return { send, sendJSON, ws: wsRef }
}
```

## Mobile-Specific Considerations

### Virtual Keyboard Handling
```typescript
// Detect virtual keyboard show/hide
useEffect(() => {
  if ('visualViewport' in window) {
    const viewport = window.visualViewport!
    const handleResize = () => {
      // viewport.height changes when virtual keyboard appears
      const keyboardVisible = viewport.height < window.innerHeight * 0.75
      if (keyboardVisible) {
        // Scroll terminal into view, refit
        fit()
      }
    }
    viewport.addEventListener('resize', handleResize)
    return () => viewport.removeEventListener('resize', handleResize)
  }
}, [fit])
```

### Touch Scroll Mode
```typescript
// Toggle between input mode and scroll mode
const [scrollMode, setScrollMode] = useState(false)

// In scroll mode: terminal.options.scrollback is accessible
// In input mode: touches are forwarded as input

// Use touch event interception on the container
```

### Performance Tips
- Use `requestAnimationFrame` for fit debouncing (not setTimeout)
- Consider `@xterm/addon-canvas` renderer for mobile (lighter than WebGL)
- Set `scrollback: 1000` (not too high) to save memory on mobile
- Batch writes: buffer rapid output and flush via `requestAnimationFrame`

## Addon Reference

### FitAddon
```typescript
import { FitAddon } from '@xterm/addon-fit'
const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)
fitAddon.fit()                    // Fit to container
fitAddon.proposeDimensions()      // Get proposed cols/rows without applying
```

### WebLinksAddon
```typescript
import { WebLinksAddon } from '@xterm/addon-web-links'
terminal.loadAddon(new WebLinksAddon())
// URLs in terminal output become clickable automatically
```

### Unicode11Addon
```typescript
import { Unicode11Addon } from '@xterm/addon-unicode11'
const unicode11 = new Unicode11Addon()
terminal.loadAddon(unicode11)
terminal.unicode.activeVersion = '11'  // Must activate explicitly
```

## Constraints & Gotchas

1. **CSS required**: Must import `@xterm/xterm/css/xterm.css` or terminal renders incorrectly
2. **Container must have size**: The container div needs explicit width/height before `terminal.open()`
3. **Single open()**: Never call `terminal.open()` twice — dispose first
4. **React StrictMode**: In development, effects run twice — guard against double initialization
5. **Cleanup**: Always call `terminal.dispose()` in useEffect cleanup
6. **Focus management**: On mobile, focusing terminal may trigger virtual keyboard
7. **Scroll position**: Terminal auto-scrolls to bottom — manual scroll requires scroll mode toggle
8. **Binary data**: For binary terminal output, use `terminal.write(new Uint8Array(data))`
