function DiffViewer({ filePath, diff, onClose }) {
  const lines = diff.split('\n')

  const parsedLines = lines.map((line, index) => {
    let type = 'context'
    if (line.startsWith('+++') || line.startsWith('---')) type = 'header'
    else if (line.startsWith('@@')) type = 'header'
    else if (line.startsWith('+')) type = 'added'
    else if (line.startsWith('-')) type = 'removed'

    return { content: line, type, index }
  })

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <span>{filePath}</span>
        <button
          className="git-action-btn"
          style={{ padding: '4px 10px', fontSize: '11px' }}
          onClick={onClose}
        >
          ✕ Close
        </button>
      </div>
      <div className="diff-content">
        {parsedLines.map((line) => (
          <div key={line.index} className={`diff-line ${line.type}`}>
            <span className="line-number">{line.index + 1}</span>
            <span className="line-content">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DiffViewer
