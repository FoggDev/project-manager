import { useEffect, useRef, useState } from 'react'

function TerminalTab({ project }) {
  const terminalRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const terminalId = useRef(`term-${project.id}`)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let cleanup = null
    let mounted = true

    const initTerminal = async () => {
      try {
        const { Terminal } = await import('@xterm/xterm')
        const { FitAddon } = await import('@xterm/addon-fit')

        // Dynamically import xterm CSS
        await import('@xterm/xterm/css/xterm.css')

        if (!mounted || !terminalRef.current) return

        const fitAddon = new FitAddon()
        const terminal = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
          theme: {
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
          },
          allowProposedApi: true,
          scrollback: 5000
        })

        terminal.loadAddon(fitAddon)
        terminal.open(terminalRef.current)
        fitAddon.fit()

        xtermRef.current = terminal
        fitAddonRef.current = fitAddon

        // Spawn pty
        const id = terminalId.current
        await window.api.terminalSpawn(id, project.path)

        // Send terminal input to pty
        terminal.onData((data) => {
          window.api.terminalInput(id, data)
        })

        // Receive pty data
        const removeDataListener = window.api.onTerminalData((termId, data) => {
          if (termId === id && mounted) {
            terminal.write(data)
          }
        })

        const removeExitListener = window.api.onTerminalExit((termId) => {
          if (termId === id && mounted) {
            terminal.writeln('\r\n\x1b[90m[Process exited]\x1b[0m')
          }
        })

        // Handle resize
        terminal.onResize(({ cols, rows }) => {
          window.api.terminalResize(id, cols, rows)
        })

        const handleWindowResize = () => {
          if (fitAddonRef.current) {
            fitAddonRef.current.fit()
          }
        }
        window.addEventListener('resize', handleWindowResize)

        setIsReady(true)

        cleanup = () => {
          removeDataListener()
          removeExitListener()
          window.removeEventListener('resize', handleWindowResize)
          terminal.dispose()
          window.api.terminalKill(id)
        }
      } catch (err) {
        console.error('Failed to initialize terminal:', err)
        // Fallback: show a message in the container
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
      if (cleanup) cleanup()
    }
  }, [project.id, project.path])

  // Re-fit when tab becomes visible
  useEffect(() => {
    const timer = setTimeout(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }, 100)
    return () => clearTimeout(timer)
  })

  return (
    <div className="terminal-container">
      <div className="terminal-toolbar">
        <div className="terminal-status">
          <span className="status-dot"></span>
          <span>Terminal running</span>
        </div>
        <button
          className="git-action-btn"
          onClick={async () => {
            const id = terminalId.current
            await window.api.terminalKill(id)
            if (xtermRef.current) {
              xtermRef.current.clear()
            }
            await window.api.terminalSpawn(id, project.path)
          }}
        >
          🔄 Restart
        </button>
      </div>
      <div className="terminal-wrapper" ref={terminalRef}></div>
    </div>
  )
}

export default TerminalTab
