import { useState, useEffect, useCallback, useRef } from 'react'
import BranchSelector from './BranchSelector'
import DiffViewer from './DiffViewer'

function GitTab({ project, addToast }) {
  const [status, setStatus] = useState(null)
  const [commits, setCommits] = useState([])
  const [loading, setLoading] = useState(true)
  const [fileFilter, setFileFilter] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [commitDescription, setCommitDescription] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [diff, setDiff] = useState('')
  const [diffContextLines, setDiffContextLines] = useState(3)
  const [diffLoading, setDiffLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [undoingCommit, setUndoingCommit] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState('changes')
  const [contextMenu, setContextMenu] = useState(null)
  const masterCheckboxRef = useRef(null)
  const contextMenuRef = useRef(null)
  const MIN_DIFF_CONTEXT = 3
  const MAX_DIFF_CONTEXT = 20000

  const loadGitData = useCallback(async () => {
    setLoading(true)
    try {
      const [statusResult, logResult] = await Promise.all([
        window.api.gitStatus(project.path),
        window.api.gitLog(project.path, 20)
      ])
      if (!statusResult.error) setStatus(statusResult)
      if (!logResult.error) setCommits(logResult)
    } catch (err) {
      console.error('Failed to load git data:', err)
    }
    setLoading(false)
  }, [project.path])

  const loadDiffForFile = useCallback(async (filePath, contextLines = diffContextLines) => {
    if (!filePath) {
      setDiff('')
      return
    }

    setDiffLoading(true)
    try {
      const result = await window.api.gitDiff(project.path, filePath, contextLines)
      setDiff(typeof result === 'string' ? result : '')
    } finally {
      setDiffLoading(false)
    }
  }, [diffContextLines, project.path])

  useEffect(() => {
    loadGitData()
  }, [loadGitData])

  useEffect(() => {
    const files = status?.files || []
    if (files.length === 0) {
      if (selectedFile) {
        setSelectedFile(null)
        setDiff('')
      }
      return
    }

    const selectedStillExists = selectedFile && files.some((file) => file.path === selectedFile)
    if (!selectedStillExists) {
      const nextFile = files[0].path
      setSelectedFile(nextFile)
      loadDiffForFile(nextFile)
    }
  }, [loadDiffForFile, selectedFile, status])

  const handlePull = async () => {
    setPulling(true)
    const result = await window.api.gitPull(project.path)
    setPulling(false)
    if (result.error) {
      addToast(`Pull failed: ${result.error}`, 'error')
    } else {
      addToast('Pulled successfully', 'success')
      loadGitData()
    }
  }

  const handlePush = async () => {
    setPushing(true)
    const result = await window.api.gitPush(project.path)
    setPushing(false)
    if (result.error) {
      addToast(`Push failed: ${result.error}`, 'error')
    } else {
      addToast('Pushed successfully', 'success')
      loadGitData()
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadGitData()
    if (selectedFile) {
      await loadDiffForFile(selectedFile)
    }
    setRefreshing(false)
  }

  const refreshDiffForFile = async (filePath) => {
    if (!filePath) return
    await loadDiffForFile(filePath)
  }

  const handleStageFile = async (filePath) => {
    await window.api.gitStage(project.path, [filePath])
    await loadGitData()
    await refreshDiffForFile(filePath)
  }

  const handleUnstageFile = async (filePath) => {
    await window.api.gitUnstage(project.path, [filePath])
    await loadGitData()
    await refreshDiffForFile(filePath)
  }

  const handleStageAll = async () => {
    if (!status) return
    const files = status.files.map((f) => f.path)
    await window.api.gitStage(project.path, files)
    await loadGitData()
    await refreshDiffForFile(selectedFile)
  }

  const handleUnstageAll = async () => {
    if (!status) return
    const files = status.staged
    await window.api.gitUnstage(project.path, files)
    await loadGitData()
    await refreshDiffForFile(selectedFile)
  }

  const handleToggleAllVisible = async () => {
    if (!filteredFiles.length) return
    const visiblePaths = filteredFiles.map((file) => file.path)
    const allVisibleStaged = filteredFiles.every((file) => stagedSet.has(file.path))

    if (allVisibleStaged) {
      await window.api.gitUnstage(project.path, visiblePaths)
    } else {
      await window.api.gitStage(project.path, visiblePaths)
    }

    await loadGitData()
    await refreshDiffForFile(selectedFile)
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      addToast('Please enter a commit message', 'error')
      return
    }
    setCommitting(true)
    const fullMessage = commitDescription
      ? `${commitMessage}\n\n${commitDescription}`
      : commitMessage
    const result = await window.api.gitCommit(project.path, fullMessage)
    setCommitting(false)
    if (result.error) {
      addToast(`Commit failed: ${result.error}`, 'error')
    } else {
      addToast('Committed successfully!', 'success')
      setCommitMessage('')
      setCommitDescription('')
      loadGitData()
    }
  }

  const handleGenerateCommit = async () => {
    setAiLoading(true)
    const result = await window.api.generateCommitMessage(project.path)
    setAiLoading(false)
    if (result.error) {
      addToast(result.error, 'error')
    } else {
      const nextTitle = (result.title || result.message || '').trim()
      if (nextTitle) {
        setCommitMessage(nextTitle)
      }

      const nextDescription = typeof result.description === 'string'
        ? result.description.trim()
        : ''
      setCommitDescription(nextDescription)
      addToast('AI commit message generated!', 'success')
    }
  }

  const handleUndoLastCommit = async () => {
    const latestCommit = commits[0]
    if (!latestCommit) {
      addToast('No commits available to undo', 'error')
      return
    }
    if (status?.tracking && Number(status.ahead || 0) <= 0) {
      addToast('Nothing to undo. Latest commit is already merged/pushed.', 'error')
      return
    }

    const confirmed = window.confirm(
      `Undo last commit "${latestCommit.message}"?\n\nThis rewinds HEAD by 1 commit and keeps your file changes locally.`
    )
    if (!confirmed) return

    setUndoingCommit(true)
    const result = await window.api.gitUndoLastCommit(project.path, latestCommit.fullHash)
    setUndoingCommit(false)

    if (result?.error) {
      addToast(`Undo failed: ${result.error}`, 'error')
      return
    }

    addToast('Last commit undone', 'success')
    await loadGitData()
    if (selectedFile) {
      await loadDiffForFile(selectedFile)
    }
  }

  const handleViewDiff = async (filePath) => {
    setSelectedFile(filePath)
    await loadDiffForFile(filePath)
  }

  const handleExpandContext = async () => {
    if (!selectedFile) return
    const nextContext = Math.min(MAX_DIFF_CONTEXT, diffContextLines * 4)
    if (nextContext === diffContextLines) return
    setDiffContextLines(nextContext)
    await loadDiffForFile(selectedFile, nextContext)
  }

  const handleResetContext = async () => {
    if (!selectedFile || diffContextLines === MIN_DIFF_CONTEXT) return
    setDiffContextLines(MIN_DIFF_CONTEXT)
    await loadDiffForFile(selectedFile, MIN_DIFF_CONTEXT)
  }

  const handleBranchChange = () => {
    loadGitData()
  }

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  useEffect(() => {
    if (!contextMenu) return

    const handleWindowClick = (event) => {
      if (contextMenuRef.current && contextMenuRef.current.contains(event.target)) return
      closeContextMenu()
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') closeContextMenu()
    }

    window.addEventListener('mousedown', handleWindowClick)
    window.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', closeContextMenu)
    window.addEventListener('scroll', closeContextMenu, true)

    return () => {
      window.removeEventListener('mousedown', handleWindowClick)
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', closeContextMenu)
      window.removeEventListener('scroll', closeContextMenu, true)
    }
  }, [closeContextMenu, contextMenu])

  const toAbsolutePath = useCallback((filePath) => {
    const base = project.path.replace(/\/+$/, '')
    const relative = String(filePath || '').replace(/^\/+/, '')
    return `${base}/${relative}`
  }, [project.path])

  const copyText = async (text, successLabel) => {
    try {
      await navigator.clipboard.writeText(text)
      addToast(successLabel, 'success')
    } catch (err) {
      addToast(`Copy failed: ${err.message}`, 'error')
    }
  }

  const handleOpenContextMenu = (event, file) => {
    event.preventDefault()
    event.stopPropagation()

    const menuWidth = 290
    const menuHeight = 360
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8)
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8)

    setContextMenu({
      x: Math.max(8, x),
      y: Math.max(8, y),
      file
    })
  }

  const handleDiscardFile = async (filePath) => {
    const confirmed = window.confirm(`Discard all local changes for ${filePath}?`)
    if (!confirmed) return

    try {
      if (typeof window.api.gitDiscardFile !== 'function') {
        addToast('Discard not available in this build. Restart/update the app.', 'error')
        return
      }

      const result = await window.api.gitDiscardFile(project.path, filePath)
      if (result?.error) {
        addToast(`Discard failed: ${result.error}`, 'error')
        return
      }

      addToast('Changes discarded', 'success')
      if (selectedFile === filePath || filePath.includes(' -> ')) {
        setSelectedFile(null)
        setDiff('')
      }
      await loadGitData()
      if (selectedFile && selectedFile !== filePath) {
        await refreshDiffForFile(selectedFile)
      }
    } catch (err) {
      addToast(`Discard failed: ${err.message}`, 'error')
    }
  }

  const handleIgnorePattern = async (pattern, label) => {
    const result = await window.api.gitIgnorePattern(project.path, pattern)
    if (result?.error) {
      addToast(`Ignore failed: ${result.error}`, 'error')
      return
    }
    addToast(label, 'success')
    await loadGitData()
  }

  const getFileStatus = (file) => {
    if (file.index === 'A' || file.working_dir === '?') return { label: 'A', className: 'added' }
    if (file.index === 'D' || file.working_dir === 'D') return { label: 'D', className: 'deleted' }
    if (file.index === 'R') return { label: 'R', className: 'renamed' }
    return { label: 'M', className: 'modified' }
  }

  const hasChanges = status?.files && status.files.length > 0
  const hasStagedChanges = status?.staged && status.staged.length > 0
  const latestCommit = commits[0] || null
  const canUndoLastCommit = Boolean(latestCommit) && (!status?.tracking || Number(status.ahead || 0) > 0)
  const githubRepoUrl = getGitHubRepoUrl(status?.remote)
  const stagedSet = new Set(status?.staged || [])
  const filteredFiles = (status?.files || []).filter((file) =>
    file.path.toLowerCase().includes(fileFilter.toLowerCase().trim())
  )
  const visibleAllStaged = filteredFiles.length > 0 && filteredFiles.every((file) => stagedSet.has(file.path))
  const visibleSomeStaged = filteredFiles.some((file) => stagedSet.has(file.path))
  const syncStatusText = pulling
    ? 'Pulling from origin...'
    : pushing
      ? 'Pushing to origin...'
      : refreshing
        ? 'Refreshing changes...'
        : 'Ready'

  useEffect(() => {
    if (!masterCheckboxRef.current) return
    masterCheckboxRef.current.indeterminate = visibleSomeStaged && !visibleAllStaged
  }, [visibleAllStaged, visibleSomeStaged])

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        Loading git data...
      </div>
    )
  }

  if (!status) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔀</div>
        <h2>Not a Git repository</h2>
        <p>This project doesn't appear to be a Git repository.</p>
      </div>
    )
  }

<<<<<<< Updated upstream
  const hasChanges = status.files && status.files.length > 0
  const hasStagedChanges = status.staged && status.staged.length > 0
  const githubRepoUrl = getGitHubRepoUrl(status.remote)

=======
>>>>>>> Stashed changes
  return (
    <div className="git-workbench">
      <div className="git-workbench-header">
        <div className="git-header-pane">
          <div className="git-header-label">Current Repository</div>
          <div className="git-header-value">{project.name}</div>
        </div>
        <div className="git-header-pane git-header-pane-branch">
          <div className="git-header-label">Current Branch</div>
          <BranchSelector project={project} currentBranch={status.branch} onBranchChange={handleBranchChange} addToast={addToast} />
        </div>
        <div className="git-header-pane git-header-pane-sync">
          <div className="git-header-label">{syncStatusText}</div>
          <div className="git-sync-actions">
            <button className="git-action-btn" onClick={handlePull} disabled={pulling}>
              {pulling ? <span className="spinner"></span> : '⬇️'} Pull
              {status.behind > 0 && <span className="btn-badge">{status.behind}</span>}
            </button>
            <button className="git-action-btn" onClick={handlePush} disabled={pushing}>
              {pushing ? <span className="spinner"></span> : '⬆️'} Push
              {status.ahead > 0 && <span className="btn-badge">{status.ahead}</span>}
            </button>
            <button className="git-action-btn" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <span className="spinner"></span> : '🔄'} Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="git-workbench-tabs">
        <button
          className={`git-workbench-tab ${activeSubTab === 'changes' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('changes')}
        >
          Changes <span className="tab-count">{status.files.length}</span>
        </button>
        <button
          className={`git-workbench-tab ${activeSubTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('history')}
        >
          History
        </button>
      </div>

      {activeSubTab === 'history' && (
        <div className="git-history-view">
          <div className="commit-list">
            {commits.map((commit) => (
              <div key={commit.fullHash} className="commit-item">
                {githubRepoUrl ? (
                  <a
                    href={`${githubRepoUrl}/commit/${commit.fullHash}`}
                    className="commit-hash commit-hash-link"
                    title="Open commit on GitHub"
                    onClick={(event) => {
                      event.preventDefault()
                      window.open(`${githubRepoUrl}/commit/${commit.fullHash}`, '_blank', 'noopener,noreferrer')
                    }}
                  >
                    {commit.hash}
                  </a>
                ) : (
                  <span className="commit-hash">{commit.hash}</span>
                )}
                <div className="commit-details">
                  <div className="commit-message">{commit.message}</div>
                  <div className="commit-meta">{commit.author} • {formatDate(commit.date)}</div>
                </div>
              </div>
            ))}
          </div>
<<<<<<< Updated upstream

          {/* Last Commit */}
          {commits.length > 0 && (
            <div className="git-section">
              <h3><span className="section-icon">🕐</span> Last Commit</h3>
              <div className="info-card">
                <div className="info-row">
                  <div className="info-icon cyan">💬</div>
                  <span className="info-value" style={{ fontFamily: 'var(--font-family)', fontSize: '13px' }}>
                    {commits[0].message}
                  </span>
                </div>
                <div className="info-row">
                  <div className="info-icon purple">👤</div>
                  <span className="info-label" style={{ fontFamily: 'var(--font-family)' }}>{commits[0].author}</span>
                  <span className="info-value" style={{ fontFamily: 'var(--font-family)', color: 'var(--text-secondary)' }}>
                    {formatDate(commits[0].date)}
                  </span>
                </div>
                <div className="info-row">
                  <div className="info-icon blue">#</div>
                  <span className="info-label">Commit</span>
                  {githubRepoUrl ? (
                    <a
                      href={`${githubRepoUrl}/commit/${commits[0].fullHash}`}
                      className="commit-hash commit-hash-link"
                      title="Open commit on GitHub"
                      onClick={(event) => {
                        event.preventDefault()
                        window.open(`${githubRepoUrl}/commit/${commits[0].fullHash}`, '_blank', 'noopener,noreferrer')
                      }}
                    >
                      {commits[0].hash}
                    </a>
                  ) : (
                    <span className="commit-hash">{commits[0].hash}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Recent Commits */}
          <div className="git-section">
            <h3><span className="section-icon">📜</span> Recent Commits</h3>
            <div className="info-card">
              <div className="commit-list">
                {commits.map((commit) => (
                  <div key={commit.fullHash} className="commit-item">
                    {githubRepoUrl ? (
                      <a
                        href={`${githubRepoUrl}/commit/${commit.fullHash}`}
                        className="commit-hash commit-hash-link"
                        title="Open commit on GitHub"
                        onClick={(event) => {
                          event.preventDefault()
                          window.open(`${githubRepoUrl}/commit/${commit.fullHash}`, '_blank', 'noopener,noreferrer')
                        }}
                      >
                        {commit.hash}
                      </a>
                    ) : (
                      <span className="commit-hash">{commit.hash}</span>
                    )}
                    <div className="commit-details">
                      <div className="commit-message">{commit.message}</div>
                      <div className="commit-meta">{commit.author} • {formatDate(commit.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
=======
        </div>
>>>>>>> Stashed changes
      )}

      {activeSubTab === 'changes' && (
        <div className="git-workbench-layout">
          <div className="git-sidebar-pane">
            <div className="git-sidebar-toolbar">
              <input
                type="text"
                className="git-filter-input"
                placeholder="Filter changed files..."
                value={fileFilter}
                onChange={(event) => setFileFilter(event.target.value)}
              />
              <div className="git-sidebar-actions">
                <button className="git-action-btn" onClick={handleStageAll} disabled={!hasChanges}>
                  Stage All
                </button>
                <button className="git-action-btn" onClick={handleUnstageAll} disabled={!hasStagedChanges}>
                  Unstage All
                </button>
              </div>
            </div>

            <div className="git-sidebar-list">
              <div className="git-sidebar-title">
                <label className="git-sidebar-master-toggle">
                  <input
                    ref={masterCheckboxRef}
                    type="checkbox"
                    className="file-checkbox"
                    checked={visibleAllStaged}
                    onChange={handleToggleAllVisible}
                    disabled={filteredFiles.length === 0}
                  />
                  <span>{filteredFiles.length} changed files</span>
                </label>
              </div>
              {filteredFiles.map((file) => {
                const fileStatus = getFileStatus(file)
                const isStaged = stagedSet.has(file.path)
                const isSelected = selectedFile === file.path
                return (
                  <div
                    key={file.path}
                    className={`scm-file-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleViewDiff(file.path)}
                    onContextMenu={(event) => handleOpenContextMenu(event, file)}
                  >
                    <input
                      type="checkbox"
                      className="file-checkbox"
                      checked={isStaged}
                      onChange={() => (isStaged ? handleUnstageFile(file.path) : handleStageFile(file.path))}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <span className={`file-status ${fileStatus.className}`}>{fileStatus.label}</span>
                    <span className="file-path">{file.path}</span>
                  </div>
                )
              })}
              {filteredFiles.length === 0 && (
                <div className="git-sidebar-empty">No files match this filter.</div>
              )}
            </div>

            <div className="git-commit-dock">
              <div className="commit-input">
                <input
                  type="text"
                  placeholder="Summary (required)"
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && commitMessage.trim()) {
                      handleCommit()
                    }
                  }}
                />
                <textarea
                  placeholder="Description"
                  value={commitDescription}
                  onChange={(event) => setCommitDescription(event.target.value)}
                  rows={3}
                />
              </div>
<<<<<<< Updated upstream
            </div>
            <div className="commit-actions">
              <button className="ai-btn" onClick={handleGenerateCommit} disabled={aiLoading || !hasChanges}>
                {aiLoading ? <span className="spinner"></span> : <span className="sparkle">✨</span>}
                {aiLoading ? 'Generating...' : 'AI Message'}
              </button>
              <button
                className="commit-submit-btn"
                onClick={handleCommit}
                disabled={!commitMessage.trim() || !hasStagedChanges || committing}
              >
                {committing ? <span className="spinner"></span> : '✓'}
                Commit{hasStagedChanges ? ` ${status.staged.length} file${status.staged.length > 1 ? 's' : ''}` : ''}
              </button>
=======
              <div className="commit-actions">
                <button className="ai-btn" onClick={handleGenerateCommit} disabled={aiLoading || !hasChanges}>
                  {aiLoading ? <span className="spinner"></span> : <span className="sparkle">✨</span>}
                  {aiLoading ? 'Generating...' : 'AI Message'}
                </button>
                <button
                  className="commit-submit-btn"
                  onClick={handleCommit}
                  disabled={!commitMessage.trim() || !hasStagedChanges || committing}
                >
                  {committing ? <span className="spinner"></span> : '✓'}
                  Commit {status.staged.length} file{status.staged.length === 1 ? '' : 's'}
                </button>
              </div>
              {canUndoLastCommit && (
                <div className="last-commit-row">
                  <div className="last-commit-details">
                    <div className="last-commit-time">Committed {formatDate(latestCommit.date)}</div>
                    <div className="last-commit-message">{latestCommit.message}</div>
                  </div>
                  <button
                    className="git-action-btn last-commit-undo-btn"
                    onClick={handleUndoLastCommit}
                    disabled={undoingCommit}
                    title="Undo latest local unmerged commit (keeps file changes locally)"
                  >
                    {undoingCommit ? <span className="spinner"></span> : 'Undo'}
                  </button>
                </div>
              )}
>>>>>>> Stashed changes
            </div>
          </div>

          <div className="git-diff-pane">
            {selectedFile && (diffLoading || diff) ? (
              <DiffViewer
                filePath={selectedFile}
                diff={diff}
                contextLines={diffContextLines}
                isExpandingContext={diffLoading}
                onExpandContext={handleExpandContext}
                onResetContext={handleResetContext}
                onClose={() => {
                  setSelectedFile(null)
                  setDiff('')
                  setDiffContextLines(MIN_DIFF_CONTEXT)
                }}
              />
            ) : (
              <div className="git-diff-empty">
                <div className="empty-icon">🧾</div>
                <h2>Select a changed file</h2>
                <p>Choose a file from the left panel to inspect its diff.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {contextMenu?.file && (() => {
        const menuFilePath = contextMenu.file.path
        const absoluteFilePath = toAbsolutePath(menuFilePath)
        const isStaged = stagedSet.has(menuFilePath)
        const lastSlash = menuFilePath.lastIndexOf('/')
        const folderPath = lastSlash > -1 ? menuFilePath.slice(0, lastSlash) : ''
        const fileName = lastSlash > -1 ? menuFilePath.slice(lastSlash + 1) : menuFilePath
        const dotIndex = fileName.lastIndexOf('.')
        const extension = dotIndex > 0 ? fileName.slice(dotIndex + 1) : ''

        return (
          <div
            ref={contextMenuRef}
            className="scm-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              className="scm-context-item"
              onClick={async () => {
                await handleViewDiff(menuFilePath)
                closeContextMenu()
              }}
            >
              View Diff
            </button>
            <button
              className="scm-context-item"
              onClick={async () => {
                if (isStaged) {
                  await handleUnstageFile(menuFilePath)
                } else {
                  await handleStageFile(menuFilePath)
                }
                closeContextMenu()
              }}
            >
              {isStaged ? 'Unstage File' : 'Stage File'}
            </button>
            <button
              className="scm-context-item scm-context-danger"
              onClick={async () => {
                await handleDiscardFile(menuFilePath)
                closeContextMenu()
              }}
            >
              Discard Changes
            </button>

            <div className="scm-context-separator" />

            <button
              className="scm-context-item"
              onClick={async () => {
                await handleIgnorePattern(menuFilePath, 'Added file pattern to .gitignore')
                closeContextMenu()
              }}
            >
              Ignore File (Add to .gitignore)
            </button>
            <button
              className="scm-context-item"
              disabled={!folderPath}
              onClick={async () => {
                if (!folderPath) return
                await handleIgnorePattern(`${folderPath}/`, 'Added folder pattern to .gitignore')
                closeContextMenu()
              }}
            >
              Ignore Folder (Add to .gitignore)
            </button>
            <button
              className="scm-context-item"
              disabled={!extension}
              onClick={async () => {
                if (!extension) return
                await handleIgnorePattern(`*.${extension}`, `Added *.${extension} to .gitignore`)
                closeContextMenu()
              }}
            >
              Ignore All {extension || 'ext'} Files (Add to .gitignore)
            </button>

            <div className="scm-context-separator" />

            <button
              className="scm-context-item"
              onClick={async () => {
                await copyText(absoluteFilePath, 'Copied file path')
                closeContextMenu()
              }}
            >
              Copy File Path
            </button>
            <button
              className="scm-context-item"
              onClick={async () => {
                await copyText(menuFilePath, 'Copied relative path')
                closeContextMenu()
              }}
            >
              Copy Relative File Path
            </button>

            <div className="scm-context-separator" />

            <button
              className="scm-context-item"
              onClick={async () => {
                await window.api.revealInFinder(absoluteFilePath)
                closeContextMenu()
              }}
            >
              Reveal in Finder
            </button>
            <button
              className="scm-context-item"
              onClick={async () => {
                await window.api.openInEditor(absoluteFilePath, 'vscode')
                closeContextMenu()
              }}
            >
              Open in VSCode
            </button>
            <button
              className="scm-context-item"
              onClick={async () => {
                await window.api.openInEditor(absoluteFilePath, 'cursor')
                closeContextMenu()
              }}
            >
              Open in Cursor
            </button>
            <button
              className="scm-context-item"
              onClick={async () => {
                await window.api.openPath(absoluteFilePath)
                closeContextMenu()
              }}
            >
              Open with Default Program
            </button>
          </div>
        )
      })()}
    </div>
  )
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
  return date.toLocaleDateString()
}

function getGitHubRepoUrl(remoteUrl) {
  if (!remoteUrl) return null
  const trimmed = remoteUrl.trim()

  const sshMatch = trimmed.match(/^git@github\.com:(.+?)(?:\.git)?\/?$/i)
  if (sshMatch) return `https://github.com/${stripGitSuffix(sshMatch[1])}`

  const urlMatch = trimmed.match(/^(?:https?|ssh|git):\/\/(?:git@)?github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/i)
  if (urlMatch) return `https://github.com/${stripGitSuffix(urlMatch[1])}`

  return null
}

function stripGitSuffix(repoPath) {
  return repoPath.replace(/\.git$/i, '').replace(/\/+$/, '')
}

export default GitTab
