import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from './store'
import simpleGit from 'simple-git'
import OpenAI from 'openai'
import * as fs from 'fs'
import * as path from 'path'

const store = new Store({
  defaults: {
    projects: [],
    settings: {
      openaiApiKey: '',
      openaiModel: 'gpt-4o-mini'
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
    const result = await git.push()
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
    return { success: true, summary: result.summary }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('git:diff', async (_, dirPath, filePath) => {
  try {
    const git = simpleGit(dirPath)
    const diff = await git.diff([filePath])
    if (!diff) {
      const stagedDiff = await git.diff(['--cached', filePath])
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

// ── AI Commit Message ───────────────────────────────────────────────────────

ipcMain.handle('ai:generate-commit', async (_, dirPath) => {
  try {
    const settings = store.get('settings')

    if (!settings.openaiApiKey) {
      return { error: 'OpenAI API key not configured. Go to Settings to add your key.' }
    }

    const git = simpleGit(dirPath)
    const diff = await git.diff(['--cached'])
    if (!diff || diff.trim() === '') {
      return { error: 'No staged changes found. Stage your changes first.' }
    }

    // Truncate diff if too long
    const maxDiffLength = 8000
    const truncatedDiff = diff.length > maxDiffLength
      ? diff.substring(0, maxDiffLength) + '\n... (diff truncated)'
      : diff

    const openai = new OpenAI({ apiKey: settings.openaiApiKey })
    const response = await openai.chat.completions.create({
      model: settings.openaiModel || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a commit message generator. Given a git diff, produce a single concise commit message following the Conventional Commits format (e.g., "feat: add user login", "fix: resolve null pointer in parser", "refactor: extract helper functions"). 
Rules:
- Use lowercase for the type and description
- Keep the message under 72 characters
- Be specific about WHAT changed, not HOW
- Do not include a body or footer
- Only return the commit message text, nothing else`
        },
        {
          role: 'user',
          content: `Generate a commit message for this diff:\n\n${truncatedDiff}`
        }
      ],
      temperature: 0.3,
      max_tokens: 100
    })

    return { message: response.choices[0].message.content.trim() }
  } catch (err) {
    return { error: err.message }
  }
})

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

ipcMain.handle('shell:open-in-finder', (_, dirPath) => {
  shell.showItemInFolder(dirPath)
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
