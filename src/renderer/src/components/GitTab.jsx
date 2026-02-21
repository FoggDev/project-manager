import { useState, useEffect, useCallback } from 'react'
import BranchSelector from './BranchSelector'
import DiffViewer from './DiffViewer'

function GitTab({ project, addToast }) {
  const [status, setStatus] = useState(null)
  const [commits, setCommits] = useState([])
  const [loading, setLoading] = useState(true)
  const [commitMessage, setCommitMessage] = useState('')
  const [commitDescription, setCommitDescription] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [diff, setDiff] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState('overview')

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

  useEffect(() => {
    loadGitData()
  }, [loadGitData])

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

  const handleStageFile = async (filePath) => {
    await window.api.gitStage(project.path, [filePath])
    loadGitData()
  }

  const handleUnstageFile = async (filePath) => {
    await window.api.gitUnstage(project.path, [filePath])
    loadGitData()
  }

  const handleStageAll = async () => {
    if (!status) return
    const files = status.files.map((f) => f.path)
    await window.api.gitStage(project.path, files)
    loadGitData()
  }

  const handleUnstageAll = async () => {
    if (!status) return
    const files = status.staged
    await window.api.gitUnstage(project.path, files)
    loadGitData()
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

  const handleViewDiff = async (filePath) => {
    setSelectedFile(filePath)
    const result = await window.api.gitDiff(project.path, filePath)
    setDiff(typeof result === 'string' ? result : '')
  }

  const handleBranchChange = () => {
    loadGitData()
  }

  const getFileStatus = (file) => {
    if (file.index === 'A' || file.working_dir === '?') return { label: 'A', className: 'added' }
    if (file.index === 'D' || file.working_dir === 'D') return { label: 'D', className: 'deleted' }
    if (file.index === 'R') return { label: 'R', className: 'renamed' }
    return { label: 'M', className: 'modified' }
  }

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

  const hasChanges = status.files && status.files.length > 0
  const hasStagedChanges = status.staged && status.staged.length > 0
  const githubRepoUrl = getGitHubRepoUrl(status.remote)

  return (
    <div>
      {/* Git Actions Bar */}
      <div className="git-header-actions">
        <BranchSelector project={project} currentBranch={status.branch} onBranchChange={handleBranchChange} addToast={addToast} />
        
        <button className="git-action-btn" onClick={handlePull} disabled={pulling}>
          {pulling ? <span className="spinner"></span> : '⬇️'} Pull
          {status.behind > 0 && <span className="btn-badge">{status.behind}</span>}
        </button>
        
        <button className="git-action-btn" onClick={handlePush} disabled={pushing}>
          {pushing ? <span className="spinner"></span> : '⬆️'} Push
          {status.ahead > 0 && <span className="btn-badge">{status.ahead}</span>}
        </button>

        <button
          className={`git-action-btn ${activeSubTab === 'overview' ? 'primary' : ''}`}
          onClick={() => setActiveSubTab('overview')}
        >
          Overview
        </button>
        <button
          className={`git-action-btn ${activeSubTab === 'changes' ? 'primary' : ''}`}
          onClick={() => setActiveSubTab('changes')}
          style={{ position: 'relative' }}
        >
          Changes
          {hasChanges && <span className="btn-badge" style={{ background: 'var(--accent-orange)', color: '#000', marginLeft: 4 }}>{status.files.length}</span>}
        </button>
      </div>

      {activeSubTab === 'overview' && (
        <>
          {/* Repository Info */}
          <div className="git-section">
            <h3><span className="section-icon">📦</span> Repository</h3>
            <div className="info-card">
              <div className="info-row">
                <div className="info-icon green">🌿</div>
                <span className="info-label">Branch</span>
                <span className="info-value" style={{ fontFamily: 'var(--font-family)' }}>{status.branch}</span>
              </div>
              {status.remote && (
                <div className="info-row">
                  <div className="info-icon blue">🔗</div>
                  <span className="info-label">Remote</span>
                  <span className="info-value">{status.remote}</span>
                </div>
              )}
              {status.tracking && (
                <div className="info-row">
                  <div className="info-icon purple">📡</div>
                  <span className="info-label">Tracking</span>
                  <span className="info-value">{status.tracking}</span>
                </div>
              )}
            </div>
          </div>

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
      )}

      {activeSubTab === 'changes' && (
        <div className="changes-panel">
          {/* Staged Changes */}
          {hasStagedChanges && (
            <div className="git-section">
              <div className="changes-header">
                <h3><span className="section-icon">✅</span> Staged Changes ({status.staged.length})</h3>
                <button className="git-action-btn" onClick={handleUnstageAll}>Unstage All</button>
              </div>
              <div className="info-card">
                <div className="file-list">
                  {status.files
                    .filter((f) => status.staged.includes(f.path))
                    .map((file) => {
                      const fileStatus = getFileStatus(file)
                      return (
                        <div key={`staged-${file.path}`} className="file-item" onClick={() => handleViewDiff(file.path)}>
                          <input
                            type="checkbox"
                            className="file-checkbox"
                            checked={true}
                            onChange={() => handleUnstageFile(file.path)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className={`file-status ${fileStatus.className}`}>{fileStatus.label}</span>
                          <span className="file-path">{file.path}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Unstaged Changes */}
          {status.files.filter((f) => !status.staged.includes(f.path)).length > 0 && (
            <div className="git-section">
              <div className="changes-header">
                <h3><span className="section-icon">📝</span> Changes ({status.files.filter((f) => !status.staged.includes(f.path)).length})</h3>
                <button className="git-action-btn" onClick={handleStageAll}>Stage All</button>
              </div>
              <div className="info-card">
                <div className="file-list">
                  {status.files
                    .filter((f) => !status.staged.includes(f.path))
                    .map((file) => {
                      const fileStatus = getFileStatus(file)
                      return (
                        <div key={`unstaged-${file.path}`} className="file-item" onClick={() => handleViewDiff(file.path)}>
                          <input
                            type="checkbox"
                            className="file-checkbox"
                            checked={false}
                            onChange={() => handleStageFile(file.path)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className={`file-status ${fileStatus.className}`}>{fileStatus.label}</span>
                          <span className="file-path">{file.path}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Diff Viewer */}
          {selectedFile && diff && (
            <DiffViewer filePath={selectedFile} diff={diff} onClose={() => { setSelectedFile(null); setDiff('') }} />
          )}

          {/* Commit Panel */}
          <div className="commit-panel">
            <div className="commit-input-row">
              <div className="commit-input">
                <input
                  type="text"
                  placeholder="Commit message..."
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && commitMessage.trim()) {
                      handleCommit()
                    }
                  }}
                />
                <textarea
                  placeholder="Description (optional)"
                  value={commitDescription}
                  onChange={(e) => setCommitDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <div className="commit-actions">
              <button className="ai-btn" onClick={handleGenerateCommit} disabled={aiLoading || !hasStagedChanges}>
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
            </div>
          </div>

          {!hasChanges && (
            <div className="empty-state" style={{ paddingTop: '40px' }}>
              <div className="empty-icon" style={{ fontSize: '48px' }}>✨</div>
              <h2>Working tree clean</h2>
              <p>No changes to commit.</p>
            </div>
          )}
        </div>
      )}
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
