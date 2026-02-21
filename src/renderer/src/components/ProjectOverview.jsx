function ProjectOverview({ project, addToast }) {
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    addToast('Copied to clipboard', 'success')
  }

  const getRuntimeIcon = (type) => {
    switch (type) {
      case 'Node.js': return '🟢'
      case 'Bun': return '🟠'
      case 'Python': return '🐍'
      case 'Rust': return '🦀'
      case 'Go': return '🔷'
      default: return '📦'
    }
  }

  const getConfigIcon = (name) => {
    if (name.startsWith('.git')) return '🔀'
    if (name.includes('prettier') || name.includes('eslint')) return '✨'
    if (name === 'README.md') return '📄'
    if (name === 'LICENSE') return '📜'
    if (name.includes('config') || name.includes('tsconfig')) return '⚙️'
    if (name === 'package.json') return '📦'
    if (name === 'Dockerfile' || name.includes('docker')) return '🐳'
    return '📋'
  }

  return (
    <div>
      {/* Overview Section */}
      <div className="overview-section">
        <h3><span className="section-icon">📋</span> Overview</h3>
        <div className="info-card">
          <div className="info-row">
            <div className="info-icon blue">📁</div>
            <span className="info-label">Directory</span>
            <span className="info-value">~{project.path.replace(/^\/Users\/[^/]+/, '')}</span>
            <button className="copy-btn" onClick={() => handleCopy(project.path)} title="Copy path">📋</button>
            <button className="open-btn" onClick={() => window.api.openInFinder(project.path)} title="Open in Finder">📂</button>
          </div>
          <div className="info-row">
            <div className="info-icon orange">🏷️</div>
            <span className="info-label">Type</span>
            <span className="info-value" style={{ fontFamily: 'var(--font-family)' }}>{project.type}</span>
          </div>
          <div className="info-row">
            <div className="info-icon red">📚</div>
            <span className="info-label">Files</span>
            <span className="info-value" style={{ fontFamily: 'var(--font-family)' }}>{project.fileCount} items</span>
          </div>
          {project.gitRemote && (
            <div className="info-row">
              <div className="info-icon green">🔀</div>
              <span className="info-label">Git</span>
              <span className="info-value">{project.gitRemote}</span>
              <button className="copy-btn" onClick={() => handleCopy(project.gitRemote)} title="Copy">📋</button>
            </div>
          )}
        </div>
      </div>

      {/* Platform Section */}
      {project.platform && (
        <div className="overview-section">
          <h3><span className="section-icon">🖥️</span> Platform</h3>
          <div className="platform-grid">
            <div className="platform-card">
              <div className="platform-icon" style={{ background: 'rgba(63, 185, 80, 0.15)', fontSize: '24px' }}>
                {getRuntimeIcon(project.type)}
              </div>
              <div className="platform-details">
                <div className="platform-name">{project.platform.runtime}</div>
                <div className="platform-config">{project.platform.config}</div>
              </div>
            </div>
            {project.platform.language && (
              <div className="platform-card">
                <div className="platform-icon" style={{ background: 'rgba(56, 139, 253, 0.15)', fontSize: '24px' }}>
                  🔷
                </div>
                <div className="platform-details">
                  <div className="platform-name">{project.platform.language}</div>
                  <div className="platform-config">{project.platform.languageConfig}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Configuration Files */}
      {project.configFiles && project.configFiles.length > 0 && (
        <div className="overview-section">
          <h3><span className="section-icon">📄</span> Configuration Files</h3>
          <div className="config-grid">
            {project.configFiles.map((file) => (
              <div key={file} className="config-item">
                <span className="config-icon">{getConfigIcon(file)}</span>
                {file}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectOverview
