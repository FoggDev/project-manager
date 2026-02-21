import { useRef, useState } from 'react'

function Sidebar({ projects, selectedProject, defaultProjectId, onSelectProject, onAddProject, onRemoveProject, searchQuery, onSearchChange }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  const getProjectIcon = (type) => {
    switch (type) {
      case 'Node.js': return { emoji: '🟢', className: 'nodejs' }
      case 'Bun': return { emoji: '🟠', className: 'bun' }
      case 'Python': return { emoji: '🐍', className: 'python' }
      case 'Rust': return { emoji: '🦀', className: 'rust' }
      case 'Go': return { emoji: '🔷', className: 'go' }
      default: return { emoji: '📦', className: 'unknown' }
    }
  }

  const hasDropPayload = (event) => {
    const transfer = event.dataTransfer
    if (!transfer) return false
    if (transfer.files && transfer.files.length > 0) return true
    const types = Array.from(transfer.types || [])
    return (
      types.includes('Files') ||
      types.includes('public.file-url') ||
      types.includes('text/uri-list')
    )
  }

  const parseUriListPaths = (uriListText) => {
    if (!uriListText) return []
    return uriListText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        if (!line.startsWith('file://')) return null
        try {
          const url = new URL(line)
          let resolvedPath = decodeURIComponent(url.pathname)
          if (/^\/[A-Za-z]:\//.test(resolvedPath)) {
            resolvedPath = resolvedPath.slice(1)
          }
          return resolvedPath
        } catch {
          return null
        }
      })
      .filter(Boolean)
  }

  const handleDragEnter = (event) => {
    if (!hasDropPayload(event)) return
    event.preventDefault()
    dragCounterRef.current += 1
    setIsDragOver(true)
  }

  const handleDragOver = (event) => {
    if (!hasDropPayload(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event) => {
    if (!hasDropPayload(event)) return
    event.preventDefault()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) {
      setIsDragOver(false)
    }
  }

  const handleDrop = async (event) => {
    if (!hasDropPayload(event)) return
    event.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)

    const itemPaths = Array.from(event.dataTransfer?.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => {
        const entry = item.webkitGetAsEntry?.()
        const file = item.getAsFile?.()
        return { path: file?.path, isDirectory: entry?.isDirectory }
      })
      .filter((entry) => entry.path && entry.isDirectory !== false)
      .map((entry) => entry.path)

    const filePaths = Array.from(event.dataTransfer?.files || [])
      .map((file) => file.path)
      .filter(Boolean)

    const uriPaths = parseUriListPaths(event.dataTransfer?.getData('text/uri-list'))
    const droppedPaths = Array.from(new Set([...itemPaths, ...filePaths, ...uriPaths]))
    for (const dirPath of droppedPaths) {
      await onAddProject(dirPath)
    }
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-search">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="sidebar-label">Projects</div>

      <div
        className={`sidebar-projects ${isDragOver ? 'drag-over' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="sidebar-drop-hint">Drop project folder(s) to add</div>
        )}
        {projects.map((project) => {
          const icon = getProjectIcon(project.type)
          return (
            <div
              key={project.id}
              className={`project-item ${selectedProject?.id === project.id ? 'active' : ''}`}
              onClick={() => onSelectProject(project)}
            >
              <div className={`project-icon ${icon.className}`}>
                {icon.emoji}
              </div>
              <div className="project-info">
                <div className="project-name-row">
                  <div className="project-name">{project.name}</div>
                  {defaultProjectId === project.id && (
                    <span className="default-project-badge" title="Default project">★</span>
                  )}
                </div>
                <div className="project-type">{project.type}</div>
              </div>
              <button
                className="remove-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveProject(project.id)
                }}
                title="Remove project"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      <div className="sidebar-footer">
        <button className="add-project-btn" onClick={onAddProject}>
          <span>＋</span> Add Existing
        </button>
      </div>
    </div>
  )
}

export default Sidebar
