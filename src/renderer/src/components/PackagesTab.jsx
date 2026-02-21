import { useCallback, useEffect, useState } from 'react'

function PackagesTab({ project, addToast }) {
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [updates, setUpdates] = useState([])
  const [error, setError] = useState('')
  const [lastCheckedAt, setLastCheckedAt] = useState(null)
  const hasPackagesApi =
    typeof window.api?.packagesCheckUpdates === 'function' &&
    typeof window.api?.packagesApplyUpdates === 'function'

  const loadUpdates = useCallback(async () => {
    setLoading(true)
    setError('')
    if (!hasPackagesApi) {
      setUpdates([])
      setError('Packages tools are unavailable in this app instance. Restart/update the app and try again.')
      setLoading(false)
      return
    }
    try {
      const result = await window.api.packagesCheckUpdates(project.path)
      if (result?.error) {
        setUpdates([])
        setError(result.error)
      } else {
        setUpdates(result?.updates || [])
        setLastCheckedAt(new Date())
      }
    } catch (err) {
      setUpdates([])
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [hasPackagesApi, project.path])

  useEffect(() => {
    loadUpdates()
  }, [loadUpdates])

  const handleApplyUpdates = async () => {
    if (!hasPackagesApi) {
      const message = 'Packages tools are unavailable in this app instance. Restart/update the app and try again.'
      setError(message)
      addToast(message, 'error')
      return
    }
    setApplying(true)
    setError('')
    try {
      const result = await window.api.packagesApplyUpdates(project.path)
      if (result?.error) {
        setError(result.error)
        addToast(`Update failed: ${result.error}`, 'error')
        return
      }

      if (result.updated) {
        addToast(`Updated ${result.count} package${result.count === 1 ? '' : 's'} in package.json`, 'success')
        addToast('Run npm install to update lockfile and install new versions.', 'info')
      } else {
        addToast('All packages are already up to date.', 'info')
      }

      await loadUpdates()
    } catch (err) {
      const message = err.message || 'Failed to update packages.'
      setError(message)
      addToast(`Update failed: ${message}`, 'error')
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        Checking package updates...
      </div>
    )
  }

  return (
    <div className="packages-tab">
      <div className="packages-toolbar">
        <div className="packages-summary">
          <span className="packages-count">{updates.length}</span>
          <span className="packages-label">package update{updates.length === 1 ? '' : 's'} available</span>
          {lastCheckedAt && (
            <span className="packages-checked-at">Last checked {lastCheckedAt.toLocaleTimeString()}</span>
          )}
        </div>
        <div className="packages-actions">
          <button className="git-action-btn" onClick={loadUpdates} disabled={loading || applying || !hasPackagesApi}>
            {loading ? <span className="spinner"></span> : '🔄'} Check
          </button>
          <button
            className="git-action-btn primary"
            onClick={handleApplyUpdates}
            disabled={applying || updates.length === 0 || !hasPackagesApi}
          >
            {applying ? <span className="spinner"></span> : '⬆️'} Update package.json
          </button>
        </div>
      </div>

      {error && (
        <div className="packages-error">
          {error}
        </div>
      )}

      {updates.length === 0 && !error ? (
        <div className="packages-empty">
          <div className="empty-icon">📦</div>
          <h2>Everything is up to date</h2>
          <p>No package upgrades were found by npm-check-updates.</p>
        </div>
      ) : (
        <div className="packages-list">
          {updates.map((item) => (
            <div key={item.name} className="package-row">
              <span className="package-name">{item.name}</span>
              <span className="package-arrow">→</span>
              <span className="package-target">{item.targetVersion}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PackagesTab
