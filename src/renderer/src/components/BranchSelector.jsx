import { useState, useEffect, useRef } from 'react'

function BranchSelector({ project, currentBranch, onBranchChange, addToast }) {
  const [isOpen, setIsOpen] = useState(false)
  const [branches, setBranches] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      loadBranches()
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadBranches = async () => {
    const result = await window.api.gitBranches(project.path)
    if (!result.error) {
      setBranches(result.all)
    }
  }

  const handleCheckout = async (branch) => {
    const result = await window.api.gitCheckout(project.path, branch)
    if (result.error) {
      addToast(`Failed to switch: ${result.error}`, 'error')
    } else {
      addToast(`Switched to ${branch}`, 'success')
      onBranchChange()
    }
    setIsOpen(false)
  }

  const handleCreateBranch = async () => {
    if (!searchQuery.trim()) return
    setCreating(true)
    const result = await window.api.gitCreateBranch(project.path, searchQuery.trim())
    setCreating(false)
    if (result.error) {
      addToast(`Failed to create branch: ${result.error}`, 'error')
    } else {
      addToast(`Created and switched to ${searchQuery.trim()}`, 'success')
      setSearchQuery('')
      onBranchChange()
    }
    setIsOpen(false)
  }

  const filteredBranches = branches.filter((b) =>
    b.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className={`branch-selector ${isOpen ? 'open' : ''}`} ref={dropdownRef}>
      <button className="branch-selector-btn" onClick={() => setIsOpen(!isOpen)}>
        🌿 <strong>{currentBranch}</strong> ▾
      </button>

      {isOpen && (
        <div className="branch-dropdown">
          <div className="branch-dropdown-header">
            <input
              type="text"
              placeholder="Find or create a branch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredBranches.length === 0 && searchQuery.trim()) {
                  handleCreateBranch()
                }
              }}
            />
          </div>

          {filteredBranches.map((branch) => (
            <button
              key={branch}
              className={`branch-dropdown-item ${branch === currentBranch ? 'active' : ''}`}
              onClick={() => handleCheckout(branch)}
            >
              <span className="branch-check">{branch === currentBranch ? '✓' : ''}</span>
              {branch}
            </button>
          ))}

          {searchQuery.trim() && !filteredBranches.includes(searchQuery.trim()) && (
            <button className="create-branch-btn" onClick={handleCreateBranch} disabled={creating}>
              ＋ Create branch "<strong>{searchQuery.trim()}</strong>"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default BranchSelector
