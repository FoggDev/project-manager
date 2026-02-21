import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import ProjectOverview from './components/ProjectOverview'
import TerminalTab from './components/TerminalTab'
import GitTab from './components/GitTab'
import PackagesTab from './components/PackagesTab'
import SettingsModal from './components/SettingsModal'
import Toast from './components/Toast'

function App() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [defaultProjectId, setDefaultProjectId] = useState('')
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

  const persistDefaultProject = useCallback(async (projectId) => {
    setDefaultProjectId(projectId || '')
    try {
      await window.api.setSettings({ defaultProjectId: projectId || '' })
    } catch (err) {
      console.error('Failed to persist default project:', err)
    }
  }, [])

  useEffect(() => {
    const loadInitialState = async () => {
      const [list, settings] = await Promise.all([
        loadProjects(),
        window.api.getSettings()
      ])

      if (list.length === 0) {
        setSelectedProject(null)
        return
      }

      const preferredId = settings?.defaultProjectId
      const preferredProject = preferredId ? list.find((project) => project.id === preferredId) : null
      const initialProject = preferredProject || list[0]
      setSelectedProject(initialProject)
      setActiveTab('git')
      setDefaultProjectId(preferredProject ? preferredId : initialProject.id)

      if (!preferredProject) {
        persistDefaultProject(initialProject.id)
      }
    }

    loadInitialState()
  }, [loadProjects, persistDefaultProject])

  const handleAddProject = async (providedDirPath = null) => {
    const dirPath = providedDirPath || await window.api.openDirectory()
    if (!dirPath) return
    const result = await window.api.addProject(dirPath)
    if (result.error) {
      addToast(result.error, 'error')
      return
    }
    await loadProjects()
    setSelectedProject(result)
    setActiveTab('git')
    persistDefaultProject(result.id)
    addToast(`Added "${result.name}"`, 'success')
  }

  const handleRemoveProject = async (projectId) => {
    await window.api.removeProject(projectId)
    const updated = await loadProjects()
    let nextProject = selectedProject

    if (selectedProject?.id === projectId) {
      nextProject = updated.length > 0 ? updated[0] : null
      setSelectedProject(nextProject)
      if (nextProject) {
        setActiveTab('git')
      }
    }

    persistDefaultProject(nextProject?.id || '')
    addToast('Project removed', 'info')
  }

  const handleSelectProject = (project) => {
    setSelectedProject(project)
    setActiveTab('git')
    persistDefaultProject(project.id)
  }

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const tabs = [
    { id: 'description', label: 'Description' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'git', label: 'Git' },
    { id: 'packages', label: 'Packages' }
  ]

  return (
    <div className="app-layout">
      <Sidebar
        projects={filteredProjects}
        selectedProject={selectedProject}
        defaultProjectId={defaultProjectId}
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
                <TerminalTab key={selectedProject.id} project={selectedProject} />
              )}
              {activeTab === 'git' && (
                <GitTab project={selectedProject} addToast={addToast} />
              )}
              {activeTab === 'packages' && (
                <PackagesTab project={selectedProject} addToast={addToast} />
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
