import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from './store'
import simpleGit from 'simple-git'
import OpenAI from 'openai'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'

const store = new Store({
  defaults: {
    projects: [],
    settings: {
      openaiApiKey: '',
      openaiModel: 'gpt-4o-mini',
      defaultProjectId: ''
    }
  }
})

let mainWindow = null
const terminals = new Map()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Project Management ──────────────────────────────────────────────────────

ipcMain.handle('projects:list', () => {
  return store.get('projects')
})

ipcMain.handle('projects:add', async (_, dirPath) => {
  const projects = store.get('projects')
  if (projects.find((p) => p.path === dirPath)) {
    return { error: 'Project already exists' }
  }
  const info = await detectProjectInfo(dirPath)
  const project = { id: Date.now().toString(), path: dirPath, ...info }
  projects.push(project)
  store.set('projects', projects)
  return project
})

ipcMain.handle('projects:remove', (_, projectId) => {
  const projects = store.get('projects').filter((p) => p.id !== projectId)
  store.set('projects', projects)
  return projects
})

ipcMain.handle('projects:detect-info', async (_, dirPath) => {
  return await detectProjectInfo(dirPath)
})

ipcMain.handle('projects:refresh', async (_, projectId) => {
  const projects = store.get('projects')
  const idx = projects.findIndex((p) => p.id === projectId)
  if (idx === -1) return null
  const info = await detectProjectInfo(projects[idx].path)
  projects[idx] = { ...projects[idx], ...info }
  store.set('projects', projects)
  return projects[idx]
})

async function detectProjectInfo(dirPath) {
  const info = {
    name: path.basename(dirPath),
    type: 'Unknown',
    fileCount: 0,
    gitRemote: null,
    platform: null,
    configFiles: []
  }

  try {
    const entries = fs.readdirSync(dirPath)
    info.fileCount = entries.filter((e) => !e.startsWith('.')).length

    // Detect project type & platform
    if (entries.includes('package.json')) {
      const pkg = JSON.parse(fs.readFileSync(path.join(dirPath, 'package.json'), 'utf-8'))
      if (entries.includes('bun.lockb') || entries.includes('bun.lock')) {
        info.type = 'Bun'
        info.platform = { runtime: 'Bun', config: 'package.json' }
      } else {
        info.type = 'Node.js'
        info.platform = { runtime: 'Node.js', config: 'package.json' }
      }
      if (pkg.devDependencies?.typescript || entries.includes('tsconfig.json')) {
        info.platform.language = 'TypeScript'
        info.platform.languageConfig = 'tsconfig.json'
      }
    } else if (entries.includes('Cargo.toml')) {
      info.type = 'Rust'
      info.platform = { runtime: 'Rust', config: 'Cargo.toml' }
    } else if (entries.includes('go.mod')) {
      info.type = 'Go'
      info.platform = { runtime: 'Go', config: 'go.mod' }
    } else if (entries.includes('requirements.txt') || entries.includes('pyproject.toml')) {
      info.type = 'Python'
      info.platform = { runtime: 'Python', config: entries.includes('pyproject.toml') ? 'pyproject.toml' : 'requirements.txt' }
    }

    // Detect config files
    const configPatterns = [
      '.gitignore', '.prettierrc', '.eslintrc', '.eslintrc.js', '.eslintrc.json',
      'README.md', 'LICENSE', 'package.json', 'tsconfig.json',
      'vite.config.ts', 'vite.config.js', 'next.config.js', 'next.config.mjs',
      'astro.config.ts', 'astro.config.mjs', 'webpack.config.js',
      'Dockerfile', 'docker-compose.yml', '.env.example',
      'Cargo.toml', 'go.mod', 'pyproject.toml', 'requirements.txt'
    ]
    info.configFiles = entries.filter((e) => configPatterns.includes(e))

    // Detect git remote
    try {
      const git = simpleGit(dirPath)
      const isRepo = await git.checkIsRepo()
      if (isRepo) {
        const remotes = await git.getRemotes(true)
        if (remotes.length > 0) {
          info.gitRemote = remotes[0].refs.fetch || remotes[0].refs.push
        } else {
          info.gitRemote = 'Local repository'
        }
      }
    } catch {
      // Not a git repo
    }
  } catch (err) {
    console.error('Error detecting project info:', err)
  }

  return info
}

function extractJsonObject(text) {
  const source = String(text || '')
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return {}
  const jsonSlice = source.slice(start, end + 1)
  return JSON.parse(jsonSlice)
}

function runNcu(dirPath, args = []) {
  return new Promise((resolve, reject) => {
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    const child = spawn(npxCmd, ['--yes', 'npm-check-updates', ...args], {
      cwd: dirPath,
      env: process.env
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        const message = (stderr || stdout || `npm-check-updates exited with code ${code}`).trim()
        reject(new Error(message))
      }
    })
  })
}

// ── Package Updates (npm-check-updates) ────────────────────────────────────

ipcMain.handle('packages:check-updates', async (_, dirPath) => {
  try {
    const packageJsonPath = path.join(dirPath, 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      return { error: 'No package.json found in this project.' }
    }

    const { stdout } = await runNcu(dirPath, ['--jsonUpgraded', '--packageFile', 'package.json'])
    const updates = extractJsonObject(stdout)
    const entries = Object.entries(updates)
      .map(([name, target]) => ({ name, targetVersion: String(target) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return { success: true, updates: entries, count: entries.length }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('packages:apply-updates', async (_, dirPath) => {
  try {
    const packageJsonPath = path.join(dirPath, 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      return { error: 'No package.json found in this project.' }
    }

    const { stdout: checkStdout } = await runNcu(dirPath, ['--jsonUpgraded', '--packageFile', 'package.json'])
    const pending = extractJsonObject(checkStdout)
    const pendingEntries = Object.entries(pending)
      .map(([name, target]) => ({ name, targetVersion: String(target) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (pendingEntries.length === 0) {
      return { success: true, updated: false, count: 0, updates: [] }
    }

    await runNcu(dirPath, ['--upgrade', '--packageFile', 'package.json'])
    return { success: true, updated: true, count: pendingEntries.length, updates: pendingEntries }
  } catch (err) {
    return { error: err.message }
  }
})

// ── Git Operations ──────────────────────────────────────────────────────────

ipcMain.handle('git:status', async (_, dirPath) => {
  try {
    const git = simpleGit(dirPath)
    const status = await git.status()
    const branch = status.current
    const remotes = await git.getRemotes(true)
    return {
      branch,
      remote: remotes[0]?.refs?.fetch || null,
      staged: status.staged,
      modified: status.modified,
      not_added: status.not_added,
      deleted: status.deleted,
      files: status.files,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind
    }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:log', async (_, dirPath, maxCount = 20) => {
  try {
    const git = simpleGit(dirPath)
    const log = await git.log({ maxCount })
    return log.all.map((entry) => ({
      hash: entry.hash.substring(0, 7),
      fullHash: entry.hash,
      message: entry.message,
      author: entry.author_name,
      date: entry.date
    }))
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:pull', async (_, dirPath) => {
  try {
    const git = simpleGit(dirPath)
    const result = await git.pull()
    return { success: true, summary: result.summary }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:push', async (_, dirPath) => {
  try {
    const git = simpleGit(dirPath)
    const status = await git.status()

    if (!status.current) {
      return { error: 'Unable to detect current branch.' }
    }

    if (!status.tracking) {
      const remotes = await git.getRemotes(true)
      const preferredRemote = remotes.find((remote) => remote.name === 'origin')?.name
      const fallbackRemote = remotes[0]?.name
      const remoteName = preferredRemote || fallbackRemote || 'origin'

      await git.push(['--set-upstream', remoteName, status.current])
      return { success: true, upstreamSet: true, remote: remoteName, branch: status.current }
    }

    await git.push()
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:branches', async (_, dirPath) => {
  try {
    const git = simpleGit(dirPath)
    const branches = await git.branchLocal()
    return {
      current: branches.current,
      all: branches.all,
      branches: branches.branches
    }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:checkout', async (_, dirPath, branchName) => {
  try {
    const git = simpleGit(dirPath)
    await git.checkout(branchName)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:create-branch', async (_, dirPath, branchName) => {
  try {
    const git = simpleGit(dirPath)
    await git.checkoutLocalBranch(branchName)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:stage', async (_, dirPath, files) => {
  try {
    const git = simpleGit(dirPath)
    await git.add(files)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:unstage', async (_, dirPath, files) => {
  try {
    const git = simpleGit(dirPath)
    await git.reset(['HEAD', '--', ...files])
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:commit', async (_, dirPath, message) => {
  try {
    const git = simpleGit(dirPath)
    const result = await git.commit(message)
    return { success: true, summary: result.summary, commit: result.commit }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:undo-last-commit', async (_, dirPath, expectedHash) => {
  try {
    const git = simpleGit(dirPath)
    const headHash = (await git.raw(['rev-parse', 'HEAD'])).trim()
    const status = await git.status()

    if (expectedHash && !headHash.startsWith(expectedHash)) {
      return { error: 'HEAD changed since the last refresh. Please refresh and try again.' }
    }

    const resolveRef = async (ref) => {
      if (!ref) return null
      try {
        await git.raw(['rev-parse', '--verify', ref])
        return ref
      } catch {
        return null
      }
    }

    let integrationRef = null
    try {
      const remoteHeadRef = (await git.raw(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])).trim()
      integrationRef = await resolveRef(remoteHeadRef)
    } catch {
      // origin/HEAD not available
    }

    if (!integrationRef) integrationRef = await resolveRef('refs/remotes/origin/main')
    if (!integrationRef) integrationRef = await resolveRef('refs/remotes/origin/master')
    if (!integrationRef && status.tracking) integrationRef = await resolveRef(status.tracking)

    if (integrationRef) {
      try {
        await git.raw(['merge-base', '--is-ancestor', 'HEAD', integrationRef])
        const integrationLabel = integrationRef.replace(/^refs\/remotes\//, '')
        return { error: `Latest commit is already merged into ${integrationLabel}. Only unmerged commits can be undone.` }
      } catch {
        // HEAD is not merged into integration ref, allow undo.
      }
    }

    try {
      await git.raw(['rev-parse', '--verify', 'HEAD~1'])
    } catch {
      return { error: 'Cannot undo the initial commit.' }
    }

    await git.reset(['--mixed', 'HEAD~1'])
    return { success: true, undoneHash: headHash }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:diff', async (_, dirPath, filePath, contextLines = 3) => {
  try {
    if (!filePath) return { error: 'File path is required' }

    const git = simpleGit(dirPath)
    const parsedContext = Number(contextLines)
    const safeContext = Number.isFinite(parsedContext)
      ? Math.max(0, Math.min(20000, Math.floor(parsedContext)))
      : 3
    const unifiedArg = `--unified=${safeContext}`

    const diff = await git.diff([unifiedArg, '--', filePath])
    if (!diff) {
      const stagedDiff = await git.diff(['--cached', unifiedArg, '--', filePath])
      return stagedDiff
    }
    return diff
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:diff-staged', async (_, dirPath) => {
  try {
    const git = simpleGit(dirPath)
    const diff = await git.diff(['--cached'])
    return diff
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:discard-file', async (_, dirPath, filePath) => {
  try {
    if (!filePath) return { error: 'File path is required' }

    const git = simpleGit(dirPath)
    const status = await git.status()
    const renameParts = filePath.includes(' -> ')
      ? filePath.split(' -> ').map((part) => part.trim()).filter(Boolean)
      : null
    const targetPath = renameParts ? renameParts[1] : filePath
    const sourcePath = renameParts ? renameParts[0] : null
    const candidatePaths = Array.from(new Set([targetPath, sourcePath].filter(Boolean)))
    const statusEntry = (status.files || []).find((file) => file.path === filePath || file.path === targetPath)
    const isUntracked = (status.not_added || []).includes(targetPath)
    const isIndexAdded = statusEntry?.index === 'A'

    const removePathFromDiskAndIndex = async (relativePath) => {
      await git.raw(['rm', '--cached', '-f', '--', relativePath]).catch(() => {})
      const absolutePath = path.join(dirPath, relativePath)
      if (fs.existsSync(absolutePath)) {
        fs.rmSync(absolutePath, { recursive: true, force: true })
      }
      await git.raw(['clean', '-fd', '--', relativePath]).catch(() => {})
    }

    const isTrackedInHead = async (relativePath) => {
      try {
        await git.raw(['ls-files', '--error-unmatch', '--', relativePath])
        return true
      } catch {
        return false
      }
    }

    const trackedPaths = []
    const untrackedPaths = []
    for (const relativePath of candidatePaths) {
      if (await isTrackedInHead(relativePath)) {
        trackedPaths.push(relativePath)
      } else {
        untrackedPaths.push(relativePath)
      }
    }

    if (isUntracked || isIndexAdded || untrackedPaths.length > 0) {
      for (const relativePath of untrackedPaths.length > 0 ? untrackedPaths : [targetPath]) {
        await removePathFromDiskAndIndex(relativePath)
      }
    }

    if (trackedPaths.length > 0) {
      try {
        await git.raw(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...trackedPaths])
      } catch {
        await git.reset(['HEAD', '--', ...trackedPaths]).catch(() => {})
        await git.checkout(['--', ...trackedPaths]).catch(() => {})
      }
    }

    const postStatus = await git.status()
    const stillChanged = (postStatus.files || []).some((file) => {
      if (file.path === filePath) return true
      if (file.path === targetPath) return true
      if (sourcePath && file.path === sourcePath) return true
      if (file.path.endsWith(` -> ${targetPath}`)) return true
      return false
    })

    if (stillChanged) {
      return { error: `Unable to discard changes for ${targetPath}` }
    }

    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:ignore-pattern', async (_, dirPath, pattern) => {
  try {
    if (!pattern || !String(pattern).trim()) {
      return { error: 'Ignore pattern is required' }
    }

    const gitignorePath = path.join(dirPath, '.gitignore')
    const normalizedPattern = String(pattern).trim()

    let content = ''
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf-8')
    }

    const lines = content.split(/\r?\n/).map((line) => line.trim())
    if (!lines.includes(normalizedPattern)) {
      const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : ''
      fs.appendFileSync(gitignorePath, `${prefix}${normalizedPattern}\n`, 'utf-8')
    }

    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// ── AI Commit Message ───────────────────────────────────────────────────────

ipcMain.handle('ai:generate-commit', async (_, dirPath) => {
  try {
    const settings = store.get('settings')

    if (!settings.openaiApiKey) {
      return { error: 'OpenAI API key not configured. Go to Settings to add your key.' }
    }

    const git = simpleGit(dirPath)
    const aiContext = await buildAiCommitContext(git, dirPath)
    if (!aiContext.hasChanges) {
      return { error: 'No changes found in this repository.' }
    }

    const openai = new OpenAI({ apiKey: settings.openaiApiKey })
    const response = await openai.chat.completions.create({
      model: settings.openaiModel || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a git commit assistant. Given repository changes, produce:
1) a Conventional Commits title
2) an optional commit description/body when the title alone is not enough.

Rules:
- Title must be lowercase Conventional Commits format (feat/fix/refactor/chore/docs/test/perf/build/ci)
- Title must be <= 72 characters
- Description should summarize key changes in 1-4 short bullet lines when useful
- If title fully captures a tiny single change, description can be empty
- Output STRICT JSON only with this shape:
{"title":"...","description":"..."}`
        },
        {
          role: 'user',
          content: `Generate a commit title and description for these repository changes:\n\n${aiContext.prompt}`
        }
      ],
      temperature: 0.3,
      max_tokens: 260
    })

    const content = response.choices[0].message.content?.trim() || ''
    const parsed = parseAiCommitOutput(content)

    if (!parsed.title) {
      return { error: 'AI did not return a valid commit title.' }
    }

    return {
      message: parsed.title, // Backward-compatible field
      title: parsed.title,
      description: parsed.description || ''
    }
  } catch (err) {
    return { error: err.message }
  }
})

function truncateText(text, maxLength) {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n... (truncated)`
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 2048))
  for (const byte of sample) {
    if (byte === 0) return true
  }
  return false
}

function readUntrackedPreview(dirPath, filePath) {
  try {
    const fullPath = path.join(dirPath, filePath)
    const stat = fs.statSync(fullPath)
    if (!stat.isFile()) return `[untracked] ${filePath}: non-file entry`
    if (stat.size > 64 * 1024) return `[untracked] ${filePath}: file too large to preview`

    const buffer = fs.readFileSync(fullPath)
    if (looksBinary(buffer)) return `[untracked] ${filePath}: binary file`

    const content = buffer.toString('utf8')
    const preview = truncateText(content, 1200)
    return `[untracked] ${filePath}\n${preview}`
  } catch (err) {
    return `[untracked] ${filePath}: unable to read (${err.message})`
  }
}

async function buildAiCommitContext(git, dirPath) {
  const status = await git.status()
  const stagedDiff = await git.diff(['--cached'])
  const unstagedDiff = await git.diff()

  const statusLines = (status.files || []).map((file) => {
    const index = file.index || ' '
    const workTree = file.working_dir || ' '
    return `${index}${workTree} ${file.path}`
  })

  const untrackedFiles = (status.not_added || []).slice(0, 8)
  const untrackedPreviews = untrackedFiles.map((filePath) => readUntrackedPreview(dirPath, filePath))

  const hasChanges =
    statusLines.length > 0 ||
    (stagedDiff && stagedDiff.trim() !== '') ||
    (unstagedDiff && unstagedDiff.trim() !== '')

  const sections = [
    'Changed files (git status --short):',
    statusLines.length ? statusLines.join('\n') : '(none)',
    '',
    'Staged diff:',
    stagedDiff ? truncateText(stagedDiff, 7000) : '(none)',
    '',
    'Unstaged diff:',
    unstagedDiff ? truncateText(unstagedDiff, 7000) : '(none)'
  ]

  if (untrackedPreviews.length > 0) {
    sections.push('', 'Untracked file previews:', untrackedPreviews.join('\n\n'))
  }

  const prompt = truncateText(sections.join('\n'), 18000)
  return { hasChanges, prompt }
}

function parseAiCommitOutput(content) {
  if (!content) return { title: '', description: '' }

  const normalized = content.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()

  try {
    const parsed = JSON.parse(normalized)
    return {
      title: normalizeCommitTitle(parsed.title || ''),
      description: (parsed.description || '').trim()
    }
  } catch {
    const firstLine = normalized.split('\n')[0] || ''
    const title = normalizeCommitTitle(firstLine)
    const description = normalized
      .split('\n')
      .slice(1)
      .join('\n')
      .trim()
    return { title, description }
  }
}

function normalizeCommitTitle(input) {
  const title = String(input || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (title.length <= 72) return title
  return title.slice(0, 72).trimEnd()
}

// ── Terminal (node-pty) ─────────────────────────────────────────────────────

let pty
try {
  pty = require('node-pty')
} catch {
  console.warn('node-pty not available, terminal features will be disabled')
  pty = null
}

ipcMain.handle('terminal:spawn', (_, id, cwd) => {
  if (!pty) return { error: 'Terminal not available' }

  if (terminals.has(id)) {
    terminals.get(id).kill()
    terminals.delete(id)
  }

  const shell = process.env.SHELL || '/bin/zsh'
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd,
    env: { ...process.env, TERM: 'xterm-256color' }
  })

  terminals.set(id, ptyProcess)

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:data', id, data)
    }
  })

  ptyProcess.onExit(() => {
    terminals.delete(id)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:exit', id)
    }
  })

  return { success: true }
})

ipcMain.handle('terminal:input', (_, id, data) => {
  const term = terminals.get(id)
  if (term) term.write(data)
})

ipcMain.handle('terminal:resize', (_, id, cols, rows) => {
  const term = terminals.get(id)
  if (term) term.resize(cols, rows)
})

ipcMain.handle('terminal:kill', (_, id) => {
  const term = terminals.get(id)
  if (term) {
    term.kill()
    terminals.delete(id)
  }
})

// ── Settings ────────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => {
  return store.get('settings')
})

ipcMain.handle('settings:set', (_, settings) => {
  store.set('settings', { ...store.get('settings'), ...settings })
  return store.get('settings')
})

// ── Shell / Dialog ──────────────────────────────────────────────────────────

ipcMain.handle('dialog:open-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('shell:open-in-finder', async (_, dirPath) => {
  const result = await shell.openPath(dirPath)
  if (result) {
    return { error: result }
  }
  return { success: true }
})

ipcMain.handle('shell:open-in-editor', (_, dirPath, editor) => {
  const { execSync } = require('child_process')
  try {
    if (editor === 'vscode') {
      execSync(`code "${dirPath}"`)
    } else if (editor === 'cursor') {
      execSync(`cursor "${dirPath}"`)
    }
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('shell:open-in-terminal', (_, dirPath) => {
  const { exec } = require('child_process')
  exec(`open -a Terminal "${dirPath}"`)
})

ipcMain.handle('shell:reveal-in-finder', (_, targetPath) => {
  shell.showItemInFolder(targetPath)
  return { success: true }
})

ipcMain.handle('shell:open-path', async (_, targetPath) => {
  const result = await shell.openPath(targetPath)
  if (result) return { error: result }
  return { success: true }
})

// ── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.project-manager')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Kill all terminal processes
  for (const [id, term] of terminals) {
    term.kill()
  }
  terminals.clear()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
