import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Projects
  listProjects: () => ipcRenderer.invoke('projects:list'),
  addProject: (dirPath) => ipcRenderer.invoke('projects:add', dirPath),
  removeProject: (id) => ipcRenderer.invoke('projects:remove', id),
  detectProjectInfo: (dirPath) => ipcRenderer.invoke('projects:detect-info', dirPath),
  refreshProject: (id) => ipcRenderer.invoke('projects:refresh', id),

  // Git
  gitStatus: (dirPath) => ipcRenderer.invoke('git:status', dirPath),
  gitLog: (dirPath, maxCount) => ipcRenderer.invoke('git:log', dirPath, maxCount),
  gitPull: (dirPath) => ipcRenderer.invoke('git:pull', dirPath),
  gitPush: (dirPath) => ipcRenderer.invoke('git:push', dirPath),
  gitBranches: (dirPath) => ipcRenderer.invoke('git:branches', dirPath),
  gitCheckout: (dirPath, branch) => ipcRenderer.invoke('git:checkout', dirPath, branch),
  gitCreateBranch: (dirPath, branch) => ipcRenderer.invoke('git:create-branch', dirPath, branch),
  gitStage: (dirPath, files) => ipcRenderer.invoke('git:stage', dirPath, files),
  gitUnstage: (dirPath, files) => ipcRenderer.invoke('git:unstage', dirPath, files),
  gitCommit: (dirPath, message) => ipcRenderer.invoke('git:commit', dirPath, message),
  gitUndoLastCommit: (dirPath, expectedHash) => ipcRenderer.invoke('git:undo-last-commit', dirPath, expectedHash),
  gitDiff: (dirPath, filePath, contextLines) => ipcRenderer.invoke('git:diff', dirPath, filePath, contextLines),
  gitDiffStaged: (dirPath) => ipcRenderer.invoke('git:diff-staged', dirPath),
  gitDiscardFile: (dirPath, filePath) => ipcRenderer.invoke('git:discard-file', dirPath, filePath),
  gitIgnorePattern: (dirPath, pattern) => ipcRenderer.invoke('git:ignore-pattern', dirPath, pattern),

  // AI
  generateCommitMessage: (dirPath) => ipcRenderer.invoke('ai:generate-commit', dirPath),

  // Terminal
  terminalSpawn: (id, cwd) => ipcRenderer.invoke('terminal:spawn', id, cwd),
  terminalInput: (id, data) => ipcRenderer.invoke('terminal:input', id, data),
  terminalResize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
  terminalKill: (id) => ipcRenderer.invoke('terminal:kill', id),
  onTerminalData: (callback) => {
    const handler = (_event, id, data) => callback(id, data)
    ipcRenderer.on('terminal:data', handler)
    return () => ipcRenderer.removeListener('terminal:data', handler)
  },
  onTerminalExit: (callback) => {
    const handler = (_event, id) => callback(id)
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.removeListener('terminal:exit', handler)
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),

  // Shell / Dialog
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  openInFinder: (dirPath) => ipcRenderer.invoke('shell:open-in-finder', dirPath),
  revealInFinder: (targetPath) => ipcRenderer.invoke('shell:reveal-in-finder', targetPath),
  openInEditor: (dirPath, editor) => ipcRenderer.invoke('shell:open-in-editor', dirPath, editor),
  openInTerminal: (dirPath) => ipcRenderer.invoke('shell:open-in-terminal', dirPath),
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath)
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  window.api = api
}
