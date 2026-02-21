import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

class Store {
  constructor(options = {}) {
    this.path = path.join(app.getPath('userData'), 'config.json')
    this.defaults = options.defaults || {}
    this.data = this._load()
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) {
        const raw = fs.readFileSync(this.path, 'utf-8')
        const saved = JSON.parse(raw)
        // Deep merge so nested defaults (like settings.openaiApiKey) are preserved
        return deepMerge(this.defaults, saved)
      }
    } catch {
      // corrupted file, reset
    }
    return { ...this.defaults }
  }

  _save() {
    try {
      const dir = path.dirname(this.path)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (err) {
      console.error('Store save error:', err)
    }
  }

  get(key) {
    if (key === undefined) return this.data
    return key.split('.').reduce((obj, k) => obj?.[k], this.data) ?? this.defaults[key]
  }

  set(key, value) {
    if (typeof key === 'object') {
      this.data = { ...this.data, ...key }
    } else {
      const keys = key.split('.')
      let obj = this.data
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
          obj[keys[i]] = {}
        }
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
    }
    this._save()
  }

  delete(key) {
    delete this.data[key]
    this._save()
  }
}

export default Store
