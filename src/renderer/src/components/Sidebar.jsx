function Sidebar({ projects, selectedProject, onSelectProject, onAddProject, onRemoveProject, searchQuery, onSearchChange }) {
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

      <div className="sidebar-projects">
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
                <div className="project-name">{project.name}</div>
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
