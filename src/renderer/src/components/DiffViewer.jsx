function formatContextLabel(contextLines) {
  if (!contextLines) return 'default'
  if (contextLines >= 20000) return 'full'
  return `${contextLines}`
}

function getLanguageFromFilePath(filePath) {
  const extension = filePath.split('.').pop()?.toLowerCase()
  if (!extension) return null

  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(extension)) return 'javascript'
  if (['css', 'scss', 'sass', 'less'].includes(extension)) return 'css'
  if (['json', 'jsonc'].includes(extension)) return 'json'
  return null
}

function getSyntaxRegex(language) {
  if (language === 'javascript') {
    return /(\/\/.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|import|from|export|default|async|await|class|extends|new|try|catch|finally|throw|typeof|instanceof|in|of)\b|\b(?:true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b|<\/?[A-Za-z][\w-]*\b|[A-Za-z_$][\w$]*(?=\s*\())/g
  }

  if (language === 'css') {
    return /(\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[0-9a-fA-F]{3,8}\b|@[a-zA-Z-]+\b|[a-zA-Z-]+(?=\s*:)|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms)?\b)/g
  }

  if (language === 'json') {
    return /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/gi
  }

  return null
}

function getTokenClass(token, language, fullLine, startIndex) {
  if (token.startsWith('//') || token.startsWith('/*')) return 'comment'
  if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
    if (language === 'json') {
      const rest = fullLine.slice(startIndex + token.length)
      if (/^\s*:/.test(rest)) return 'property'
    }
    return 'string'
  }

  if (language === 'javascript') {
    if (/^(const|let|var|function|return|if|else|for|while|switch|case|break|continue|import|from|export|default|async|await|class|extends|new|try|catch|finally|throw|typeof|instanceof|in|of)$/.test(token)) {
      return 'keyword'
    }
    if (/^(true|false|null|undefined)$/.test(token)) return 'literal'
    if (/^<\/?[A-Za-z][\w-]*$/.test(token)) return 'tag'
    if (/^[A-Za-z_$][\w$]*$/.test(token)) return 'function'
    if (/^\d/.test(token)) return 'number'
  }

  if (language === 'css') {
    if (token.startsWith('@')) return 'keyword'
    if (token.startsWith('#')) return 'number'
    if (/^\d/.test(token)) return 'number'
    if (/^[a-zA-Z-]+$/.test(token)) return 'property'
  }

  if (language === 'json') {
    if (/^(true|false|null)$/i.test(token)) return 'literal'
    if (/^-?\d/.test(token)) return 'number'
  }

  return ''
}

function tokenizeLine(line, language) {
  const regex = getSyntaxRegex(language)
  if (!regex || !line) return [line]

  const nodes = []
  let lastIndex = 0
  let tokenCounter = 0
  let match

  while ((match = regex.exec(line)) !== null) {
    const token = match[0]
    const start = match.index

    if (start > lastIndex) {
      nodes.push(line.slice(lastIndex, start))
    }

    const tokenClass = getTokenClass(token, language, line, start)
    if (tokenClass) {
      nodes.push(
        <span key={`tok-${start}-${tokenCounter}`} className={`token-${tokenClass}`}>
          {token}
        </span>
      )
      tokenCounter += 1
    } else {
      nodes.push(token)
    }

    lastIndex = start + token.length
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex))
  }

  return nodes
}

function getCodeWithoutDiffMarker(content) {
  if (!content) return ''
  if (content.startsWith('+') || content.startsWith('-') || content.startsWith(' ')) {
    return content.slice(1)
  }
  return content
}

function buildIntralineSegments(oldText, newText) {
  let prefix = 0
  const oldLength = oldText.length
  const newLength = newText.length

  while (prefix < oldLength && prefix < newLength && oldText[prefix] === newText[prefix]) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < oldLength - prefix &&
    suffix < newLength - prefix &&
    oldText[oldLength - 1 - suffix] === newText[newLength - 1 - suffix]
  ) {
    suffix += 1
  }

  const oldMiddleStart = prefix
  const oldMiddleEnd = oldLength - suffix
  const newMiddleStart = prefix
  const newMiddleEnd = newLength - suffix

  const oldSegments = []
  const newSegments = []

  if (prefix > 0) {
    oldSegments.push({ text: oldText.slice(0, prefix), changed: false })
    newSegments.push({ text: newText.slice(0, prefix), changed: false })
  }

  const oldMiddle = oldText.slice(oldMiddleStart, oldMiddleEnd)
  const newMiddle = newText.slice(newMiddleStart, newMiddleEnd)

  if (oldMiddle.length > 0) oldSegments.push({ text: oldMiddle, changed: true })
  if (newMiddle.length > 0) newSegments.push({ text: newMiddle, changed: true })

  if (suffix > 0) {
    oldSegments.push({ text: oldText.slice(oldLength - suffix), changed: false })
    newSegments.push({ text: newText.slice(newLength - suffix), changed: false })
  }

  if (oldSegments.length === 0) oldSegments.push({ text: oldText, changed: false })
  if (newSegments.length === 0) newSegments.push({ text: newText, changed: false })

  return { oldSegments, newSegments }
}

function applyIntralineDiff(lines) {
  const enriched = lines.map((line) => ({
    ...line,
    intralineSegments: [{ text: getCodeWithoutDiffMarker(line.content), changed: false }]
  }))

  for (let i = 0; i < enriched.length; i += 1) {
    if (enriched[i].type !== 'removed') continue

    const removedIndexes = []
    while (i < enriched.length && enriched[i].type === 'removed') {
      removedIndexes.push(i)
      i += 1
    }

    const addedIndexes = []
    while (i < enriched.length && enriched[i].type === 'added') {
      addedIndexes.push(i)
      i += 1
    }

    const pairCount = Math.min(removedIndexes.length, addedIndexes.length)
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const removedLine = enriched[removedIndexes[pairIndex]]
      const addedLine = enriched[addedIndexes[pairIndex]]
      const oldCode = getCodeWithoutDiffMarker(removedLine.content)
      const newCode = getCodeWithoutDiffMarker(addedLine.content)
      const { oldSegments, newSegments } = buildIntralineSegments(oldCode, newCode)

      removedLine.intralineSegments = oldSegments
      addedLine.intralineSegments = newSegments
    }

    i -= 1
  }

  return enriched
}

function renderLineContent(line, language) {
  if (line.type === 'header' || line.type === 'meta') {
    return line.content
  }

  const hasPrefix = line.content.startsWith('+') || line.content.startsWith('-') || line.content.startsWith(' ')
  const prefix = hasPrefix ? line.content[0] : ''
  const segments = line.intralineSegments || [{ text: getCodeWithoutDiffMarker(line.content), changed: false }]

  return (
    <>
      <span className={`diff-prefix prefix-${line.type}`}>{prefix}</span>
      {segments.map((segment, index) => {
        const tokenized = tokenizeLine(segment.text, language)
        if (!segment.changed) {
          return <span key={`seg-${index}`}>{tokenized}</span>
        }

        return (
          <span key={`seg-${index}`} className={`intraline-change intraline-${line.type}`}>
            {tokenized}
          </span>
        )
      })}
    </>
  )
}

function DiffViewer({
  filePath,
  diff,
  contextLines,
  isExpandingContext,
  onExpandContext,
  onResetContext,
  onClose
}) {
  const language = getLanguageFromFilePath(filePath)
  const lines = diff.split('\n')
  let oldLine = 0
  let newLine = 0

  const parsedLines = lines.map((line, index) => {
    if (line.startsWith('\\ No newline at end of file')) {
      return { content: line, type: 'noeol', index, oldNumber: '', newNumber: '' }
    }

    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = Number(match[1])
        newLine = Number(match[2])
      }
      return { content: line, type: 'header', index, oldNumber: '', newNumber: '' }
    }

    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      return { content: line, type: 'meta', index, oldNumber: '', newNumber: '' }
    }

    if (line.startsWith('+')) {
      const currentNew = newLine
      newLine += 1
      return { content: line, type: 'added', index, oldNumber: '', newNumber: currentNew }
    }

    if (line.startsWith('-')) {
      const currentOld = oldLine
      oldLine += 1
      return { content: line, type: 'removed', index, oldNumber: currentOld, newNumber: '' }
    }

    const currentOld = oldLine
    const currentNew = newLine
    oldLine += 1
    newLine += 1
    return { content: line, type: 'context', index, oldNumber: currentOld, newNumber: currentNew }
  })

  const linesWithIntralineDiff = applyIntralineDiff(parsedLines)
  const displayLines = []
  for (const line of linesWithIntralineDiff) {
    if (line.type === 'meta') {
      continue
    }
    if (line.type === 'noeol') {
      const previous = displayLines[displayLines.length - 1]
      if (previous) previous.noNewlineAtEnd = true
      continue
    }
    displayLines.push(line)
  }

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <span>{filePath}</span>
        <div className="diff-header-actions">
          <span className="diff-context-label">Context: {formatContextLabel(contextLines)}</span>
          <button
            className="diff-context-btn"
            onClick={onExpandContext}
            disabled={isExpandingContext || contextLines >= 20000}
          >
            + Context
          </button>
          <button
            className="diff-context-btn"
            onClick={onResetContext}
            disabled={isExpandingContext || contextLines <= 3}
          >
            Reset
          </button>
          <button
            className="diff-close-btn"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="diff-content">
        {isExpandingContext && (
          <div className="diff-loading-row">Loading more unchanged lines...</div>
        )}
        {displayLines.map((line) => (
          <div key={line.index} className={`diff-line diff-${line.type}`}>
            <span className="line-number old">{line.oldNumber}</span>
            <span className="line-number new">{line.newNumber}</span>
            <span className="line-content">
              {renderLineContent(line, language)}
              {line.noNewlineAtEnd && (
                <span
                  className="noeol-icon"
                  title="No newline at end of file"
                >
                  ⏎
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DiffViewer
