import { reactive } from 'vue'

const KEY = 'gs:v1:hints'
function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const seen = reactive(new Set<string>(load()))
try {
  if (localStorage.getItem('gs:v1:pdf-hint') === '1') seen.add('pdf')
} catch {
}

export const hintSeen = (id: string) => seen.has(id)

export function hideHint(id: string) {
  if (seen.has(id)) return
  seen.add(id)
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]))
  } catch {
  }
}

export function resetHints() {
  seen.clear()
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem('gs:v1:pdf-hint')
  } catch {
  }
}
