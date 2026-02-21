import { useCallback, useEffect, useRef, useState } from 'react'

function getTerminalTheme() {
  return {
    background: '#0d1117',
    foreground: '#e6edf3',
    cursor: '#58a6ff',
    cursorAccent: '#0d1117',
    selectionBackground: '#264f78',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39d2c0',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc'
  }
}

function TerminalSession({ sessionId, projectPath, isVisible, onStatusChange }) {
  const terminalRef = useRef(null)
  const fitAddonRef = useRef(null)

  useEffect(() => {
    let cleanup = null
    let mounted = true

    const setStatus = (status) => {
      onStatusChange(sessionId, status)
    }

    const initTerminal = async () => {
      try {
        const { Terminal } = await import('@xterm/xterm')
        const { FitAddon } = await import('@xterm/addon-fit')

        await import('@xterm/xterm/css/xterm.css')

        if (!mounted || !terminalRef.current) return

        const fitAddon = new FitAddon()
        const terminal = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
          theme: getTerminalTheme(),
          allowProposedApi: true,
          scrollback: 5000
        })

        terminal.loadAddon(fitAddon)
        terminal.open(terminalRef.current)
        fitAddon.fit()
        fitAddonRef.current = fitAddon

        const spawnResult = await window.api.terminalSpawn(sessionId, projectPath)
        if (spawnResult?.error) {
          throw new Error(spawnResult.error)
        }
        setStatus('running')

        terminal.onData((data) => {
          window.api.terminalInput(sessionId, data)
        })

        terminal.attachCustomKeyEventHandler((event) => {
          if (event.type !== 'keydown') return true
          const key = String(event.key || '').toLowerCase()
          if (event.metaKey && key === 'k') {
            event.preventDefault()
            terminal.clear()
            return false
          }
          return true
        })

        const removeDataListener = window.api.onTerminalData((termId, data) => {
          if (termId === sessionId && mounted) {
            terminal.write(data)
          }
        })

        const removeExitListener = window.api.onTerminalExit((termId) => {
          if (termId === sessionId && mounted) {
            terminal.writeln('\r\n\x1b[90m[Process exited]\x1b[0m')
            setStatus('exited')
          }
        })

        terminal.onResize(({ cols, rows }) => {
          window.api.terminalResize(sessionId, cols, rows)
        })

        const handleWindowResize = () => {
          if (fitAddonRef.current) {
            fitAddonRef.current.fit()
          }
        }
        window.addEventListener('resize', handleWindowResize)

        cleanup = () => {
          removeDataListener()
          removeExitListener()
          window.removeEventListener('resize', handleWindowResize)
          terminal.dispose()
          window.api.terminalKill(sessionId)
        }
      } catch (err) {
        console.error(`Failed to initialize terminal ${sessionId}:`, err)
        setStatus('error')
        if (terminalRef.current && mounted) {
          terminalRef.current.innerHTML = `
            <div style="padding: 20px; color: #8b949e; font-size: 13px;">
              <p>Terminal is not available.</p>
              <p style="margin-top: 8px; color: #6e7681; font-size: 12px;">Error: ${err.message}</p>
            </div>
          `
        }
      }
    }

    initTerminal()

    return () => {
      mounted = false
      onStatusChange(sessionId, 'closed')
      if (cleanup) cleanup()
    }
  }, [onStatusChange, projectPath, sessionId])

  useEffect(() => {
    if (!isVisible) return
    const timer = setTimeout(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [isVisible])

  return <div className="terminal-wrapper" ref={terminalRef}></div>
}

function formatStatus(status) {
  if (status === 'running') return 'Terminal running'
  if (status === 'exited') return 'Terminal exited'
  if (status === 'error') return 'Terminal unavailable'
  return 'Starting terminal...'
}

function TerminalTab({ project }) {
  const sessionCounterRef = useRef(1)
  const initialSession = useRef({
    id: `term-${project.id}-${Date.now()}-1`,
    label: 'Terminal 1'
  })
  const [sessions, setSessions] = useState([initialSession.current])
  const [activeSessionId, setActiveSessionId] = useState(initialSession.current.id)
  const [splitView, setSplitView] = useState(false)
  const [splitCount, setSplitCount] = useState(2)
  const [sessionStatuses, setSessionStatuses] = useState({
    [initialSession.current.id]: 'starting'
  })

  const setSessionStatus = useCallback((sessionId, status) => {
    setSessionStatuses((prev) => {
      if (status === 'closed') {
        if (!(sessionId in prev)) return prev
        const next = { ...prev }
        delete next[sessionId]
        return next
      }
      if (prev[sessionId] === status) return prev
      return { ...prev, [sessionId]: status }
    })
  }, [])

  const addSession = () => {
    sessionCounterRef.current += 1
    const sessionNumber = sessionCounterRef.current
    const newSession = {
      id: `term-${project.id}-${Date.now()}-${sessionNumber}`,
      label: `Terminal ${sessionNumber}`
    }

    setSessions((prev) => [...prev, newSession])
    setSessionStatuses((prev) => ({ ...prev, [newSession.id]: 'starting' }))
    setActiveSessionId(newSession.id)
  }

  const closeSession = (sessionId) => {
    if (sessions.length === 1) return

    const currentIndex = sessions.findIndex((session) => session.id === sessionId)
    const nextSessions = sessions.filter((session) => session.id !== sessionId)

    setSessions(nextSessions)
    setSessionStatuses((prev) => {
      const next = { ...prev }
      delete next[sessionId]
      return next
    })

    if (activeSessionId === sessionId) {
      const fallbackIndex = Math.min(currentIndex, nextSessions.length - 1)
      setActiveSessionId(nextSessions[fallbackIndex].id)
    }
  }

  useEffect(() => {
    if (!splitView) return
    if (sessions.length < 2) {
      setSplitView(false)
      return
    }
    const maxAllowed = Math.min(4, sessions.length)
    if (splitCount > maxAllowed) {
      setSplitCount(maxAllowed)
    }
  }, [sessions, splitCount, splitView])

  const restartActive = async () => {
    if (!activeSessionId) return
    setSessionStatus(activeSessionId, 'starting')
    await window.api.terminalKill(activeSessionId)
    const result = await window.api.terminalSpawn(activeSessionId, project.path)
    if (result?.error) {
      setSessionStatus(activeSessionId, 'error')
      return
    }
    setSessionStatus(activeSessionId, 'running')
  }

  const activeStatus = sessionStatuses[activeSessionId] || 'starting'
  const canSplit = sessions.length > 1
  const visibleLimit = splitView ? Math.min(splitCount, 4, sessions.length) : 1
  const visibleSessionIds = [activeSessionId, ...sessions
    .filter((session) => session.id !== activeSessionId)
    .slice(0, Math.max(0, visibleLimit - 1))
    .map((session) => session.id)]

  const handleToggleSplitView = () => {
    if (!canSplit) return
    if (splitView) {
      setSplitView(false)
      return
    }
    setSplitView(true)
  }

  return (
    <div className="terminal-container">
      <div className="terminal-toolbar">
        <div className="terminal-status">
          <span className={`status-dot status-${activeStatus}`}></span>
          <span>
            {formatStatus(activeStatus)} • {sessions.length} terminal{sessions.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="terminal-toolbar-actions">
          <button className="git-action-btn" onClick={restartActive}>
            🔄 Restart
          </button>
          <button className="git-action-btn" onClick={addSession}>
            + New Terminal
          </button>
          <button className="git-action-btn" onClick={handleToggleSplitView} disabled={!canSplit}>
            {splitView ? 'Single View' : 'Split View'}
          </button>
        </div>
      </div>

      {splitView && canSplit && (
        <div className="terminal-split-controls">
          <label>Visible terminals</label>
          <div className="terminal-split-counts">
            {[2, 3, 4].map((count) => {
              const disabled = sessions.length < count
              return (
                <button
                  key={count}
                  className={`terminal-split-count-btn ${splitCount === count ? 'active' : ''}`}
                  onClick={() => setSplitCount(count)}
                  disabled={disabled}
                >
                  {count}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="terminal-session-tabs">
        {sessions.map((session) => {
          const isActive = activeSessionId === session.id
          return (
            <div key={session.id} className={`terminal-session-tab ${isActive ? 'active' : ''}`}>
              <button className="terminal-session-select" onClick={() => setActiveSessionId(session.id)}>
                {session.label}
              </button>
              {sessions.length > 1 && (
                <button
                  className="terminal-session-close"
                  onClick={(event) => {
                    event.stopPropagation()
                    closeSession(session.id)
                  }}
                  aria-label={`Close ${session.label}`}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className={`terminal-panels ${splitView ? `split split-count-${visibleSessionIds.length}` : 'single'}`}>
        {sessions.map((session) => {
          const isVisible = visibleSessionIds.includes(session.id)
          return (
            <div key={session.id} className={`terminal-panel ${isVisible ? 'visible' : ''}`}>
              {splitView && isVisible && (
                <div className="terminal-panel-label">
                  {session.label}
                  {session.id === activeSessionId ? ' (active)' : ''}
                </div>
              )}
              <TerminalSession
                sessionId={session.id}
                projectPath={project.path}
                isVisible={isVisible}
                onStatusChange={setSessionStatus}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TerminalTab
