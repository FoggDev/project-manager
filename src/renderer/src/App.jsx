import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import ProjectOverview from './components/ProjectOverview'
import TerminalTab from './components/TerminalTab'
import GitTab from './components/GitTab'
import SettingsModal from './components/SettingsModal'
import Toast from './components/Toast'

function App() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [activeTab, setActiveTab] = useState('description')
  const [showSettings, setShowSettings] = useState(false)
  const [toasts, setToasts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const loadProjects = useCallback(async () => {
    const list = await window.api.listProjects()
    setProjects(list)
    return list
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleAddProject = async () => {
    const dirPath = await window.api.openDirectory()
    if (!dirPath) return
    const result = await window.api.addProject(dirPath)
    if (result.error) {
      addToast(result.error, 'error')
      return
    }
    const updated = await loadProjects()
    setSelectedProject(result)
    addToast(`Added "${result.name}"`, 'success')
  }

  const handleRemoveProject = async (projectId) => {
    await window.api.removeProject(projectId)
    const updated = await loadProjects()
    if (selectedProject?.id === projectId) {
      setSelectedProject(updated.length > 0 ? updated[0] : null)
    }
    addToast('Project removed', 'info')
  }

  const handleSelectProject = (project) => {
    setSelectedProject(project)
    setActiveTab('description')
  }

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const tabs = [
    { id: 'description', label: 'Description' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'git', label: 'Git' }
  ]

  return (
    <div className="app-layout">
      <Sidebar
        projects={filteredProjects}
        selectedProject={selectedProject}
        onSelectProject={handleSelectProject}
        onAddProject={handleAddProject}
        onRemoveProject={handleRemoveProject}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="main-content">
        {selectedProject ? (
          <>
            <div className="content-header">
              <div className="content-header-left">
                <div className="project-title">{selectedProject.name}</div>
                <div className="project-path">~{selectedProject.path.replace(/^\/Users\/[^/]+/, '')}</div>
              </div>
              <div className="content-header-actions">
                <button className="header-action-btn" onClick={() => window.api.openInFinder(selectedProject.path)}>
                  <span className="btn-icon">📁</span> Finder
                </button>
                <button className="header-action-btn" onClick={() => window.api.openInEditor(selectedProject.path, 'vscode')}>
                  <span className="btn-icon">💻</span> VSCode
                </button>
                <button className="header-action-btn" onClick={() => window.api.openInEditor(selectedProject.path, 'cursor')}>
                  <span className="btn-icon">⚡</span> Cursor
                </button>
              </div>
            </div>

            <div className="tab-bar">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="tab-content">
              {activeTab === 'description' && (
                <ProjectOverview project={selectedProject} addToast={addToast} />
              )}
              {activeTab === 'terminal' && (
                <TerminalTab project={selectedProject} />
              )}
              {activeTab === 'git' && (
                <GitTab project={selectedProject} addToast={addToast} />
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h2>No project selected</h2>
            <p>Select a project from the sidebar or add a new one to get started.</p>
          </div>
        )}
      </div>

      <button className="settings-btn" onClick={() => setShowSettings(true)} title="Settings">
        ⚙️
      </button>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} addToast={addToast} />
      )}

      <Toast toasts={toasts} />
    </div>
  )
}

export default App
