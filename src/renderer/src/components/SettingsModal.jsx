import { useState, useEffect } from 'react'

function SettingsModal({ onClose, addToast }) {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await window.api.getSettings()
      setApiKey(settings.openaiApiKey || '')
      setModel(settings.openaiModel || 'gpt-4o-mini')
      setLoading(false)
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    await window.api.setSettings({ openaiApiKey: apiKey, openaiModel: model })
    addToast('Settings saved', 'success')
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚙️ Settings</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              Loading...
            </div>
          ) : (
            <>
              <div className="form-group">
                <label>OpenAI API Key</label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="form-hint">Required for AI-generated commit messages. Your key is stored locally.</p>
              </div>

              <div className="form-group">
                <label>AI Model</label>
                <select value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cheap)</option>
                  <option value="gpt-4o">GPT-4o (Best Quality)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Fastest)</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="git-action-btn" onClick={onClose}>Cancel</button>
          <button className="git-action-btn primary" onClick={handleSave}>Save Settings</button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
