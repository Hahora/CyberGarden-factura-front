import { reactive, watch } from 'vue'
import { FEATURES } from './features'

export const isMac = /mac|iphone|ipad/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? navigator.userAgent)

export type KeyPart = 'mod' | 'shift' | 'alt' | string

const MAC: Record<string, string> = { mod: '⌘', shift: '⇧', alt: '⌥', enter: '↩', backspace: '⌫', esc: 'Esc', up: '↑', down: '↓', left: '←', right: '→', space: 'Пробел', then: 'затем', tab: 'Tab', delete: 'Del', home: 'Home', end: 'End', pageup: 'PgUp', pagedown: 'PgDn', insert: 'Ins' }
const WIN: Record<string, string> = { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', enter: 'Enter', backspace: 'Backspace', esc: 'Esc', up: '↑', down: '↓', left: '←', right: '→', space: 'Пробел', then: 'затем', tab: 'Tab', delete: 'Del', home: 'Home', end: 'End', pageup: 'PgUp', pagedown: 'PgDn', insert: 'Ins' }

export const keyLabels = (parts: KeyPart[]) => parts.map((p) => (isMac ? MAC : WIN)[p.toLowerCase()] ?? p.toUpperCase())
export const keyText = (parts: KeyPart[]) => keyLabels(parts).join(parts.includes('then') ? ' ' : isMac ? '' : '+')

export interface Shortcut {
  id: string
  keys: KeyPart[]
  label: string
  group: 'Везде' | 'Переходы' | 'Одной клавишей' | 'Чаты' | 'Разбор статьи' | 'Поле вопроса'
}

export interface Binding {
  mod?: boolean
  shift?: boolean
  alt?: boolean
  code: string
}

export const EDITABLE_GROUPS = ['Везде', 'Одной клавишей', 'Чаты', 'Разбор статьи'] as const
export const FIXED_GROUPS = ['Переходы', 'Поле вопроса'] as const
const CHAT_GROUPS: string[] = ['Чаты', 'Разбор статьи', 'Поле вопроса']
export const shownGroup = (g: string) => FEATURES.chat || !CHAT_GROUPS.includes(g)
const NEEDS_MOD: string[] = ['Везде', 'Чаты']

const DEFAULTS: Record<string, Binding> = {
  palette: { mod: true, code: 'KeyK' },
  new: { mod: true, shift: true, code: 'KeyO' },
  upload: { mod: true, code: 'KeyO' },
  explore: { mod: true, shift: true, code: 'KeyD' },
  sidebar: { mod: true, code: 'Backslash' },
  settings: { mod: true, code: 'Comma' },
  profile: { mod: true, shift: true, code: 'KeyP' },
  keys: { mod: true, code: 'Slash' },
  undo: { mod: true, code: 'KeyZ' },
  help: { shift: true, code: 'Slash' },
  panel: { code: 'BracketLeft' },
  pdf: { code: 'KeyU' },
  pin: { alt: true, shift: true, code: 'KeyP' },
  export: { mod: true, shift: true, code: 'KeyE' },
  delete: { mod: true, shift: true, code: 'Backspace' },
  next: { code: 'ArrowDown' },
  prev: { code: 'ArrowUp' },
  accept: { code: 'Enter' },
  edit: { code: 'KeyE' },
  reject: { code: 'Backspace' },
  reveal: { code: 'Space' },
}

export const SHORTCUTS: Shortcut[] = [
  { id: 'palette', keys: ['mod', 'K'], label: 'Поиск и команды', group: 'Везде' },
  { id: 'new', keys: ['mod', 'shift', 'O'], label: FEATURES.chat ? 'Новый вопрос' : 'Новый разбор', group: 'Везде' },
  { id: 'upload', keys: ['mod', 'O'], label: 'Загрузить PDF', group: 'Везде' },
  { id: 'explore', keys: ['mod', 'shift', 'D'], label: 'Данные: таблица результатов', group: 'Везде' },
  { id: 'sidebar', keys: ['mod', '\\'], label: 'Свернуть / развернуть панель', group: 'Везде' },
  { id: 'settings', keys: ['mod', ','], label: 'Настройки', group: 'Везде' },
  { id: 'profile', keys: ['mod', 'shift', 'P'], label: 'Профиль (в настройках)', group: 'Везде' },
  { id: 'keys', keys: ['mod', '/'], label: 'Горячие клавиши', group: 'Везде' },
  { id: 'undo', keys: ['mod', 'Z'], label: 'Отменить последнюю правку («Вернуть»)', group: 'Везде' },
  { id: 'help', keys: ['?'], label: 'Список клавиш (вне полей ввода)', group: 'Одной клавишей' },
  { id: 'panel', keys: ['['], label: 'Свернуть / развернуть панель', group: 'Одной клавишей' },
  { id: 'pdf', keys: ['U'], label: 'Загрузить PDF', group: 'Одной клавишей' },
  { id: 'go-data', keys: ['G', 'then', 'D'], label: 'Перейти в «Данные»', group: 'Переходы' },
  { id: 'go-home', keys: ['G', 'then', 'H'], label: 'Перейти на главную', group: 'Переходы' },
  { id: 'pin', keys: ['alt', 'shift', 'P'], label: 'Закрепить / открепить чат', group: 'Чаты' },
  { id: 'export', keys: ['mod', 'shift', 'E'], label: 'Экспорт JSON', group: 'Чаты' },
  { id: 'delete', keys: ['mod', 'shift', 'backspace'], label: 'Удалить чат', group: 'Чаты' },
  { id: 'next', keys: ['down'], label: 'Следующий факт (или J)', group: 'Разбор статьи' },
  { id: 'prev', keys: ['up'], label: 'Предыдущий факт (или K)', group: 'Разбор статьи' },
  { id: 'accept', keys: ['enter'], label: 'Принять и перейти дальше', group: 'Разбор статьи' },
  { id: 'edit', keys: ['E'], label: 'Исправить значение', group: 'Разбор статьи' },
  { id: 'reject', keys: ['backspace'], label: 'Отклонить', group: 'Разбор статьи' },
  { id: 'reveal', keys: ['space'], label: 'Показать в статье', group: 'Разбор статьи' },
  { id: 'send', keys: ['enter'], label: 'Отправить', group: 'Поле вопроса' },
  { id: 'newline', keys: ['shift', 'enter'], label: 'Новая строка', group: 'Поле вопроса' },
]
const byId = (id: string) => SHORTCUTS.find((s) => s.id === id)
export const isEditable = (id: string) => id in DEFAULTS
export const labelOf = (id: string) => byId(id)?.label ?? id

const KEY = 'gs:v1:keys'
const overrides = reactive<Record<string, Binding>>({})
try {
  const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Binding>
  for (const [id, b] of Object.entries(raw)) {
    if (id in DEFAULTS && b && typeof b.code === 'string') overrides[id] = { mod: b.mod || undefined, shift: b.shift || undefined, alt: b.alt || undefined, code: b.code }
  }
} catch {
}
watch(overrides, () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides))
  } catch {
  }
}, { deep: true, flush: 'sync' })

export const bindingOf = (id: string): Binding | null => overrides[id] ?? DEFAULTS[id] ?? null
const same = (a: Binding, b: Binding) => a.code === b.code && !!a.mod === !!b.mod && !!a.shift === !!b.shift && !!a.alt === !!b.alt
export const isChanged = (id: string) => !!overrides[id]
export const changedCount = () => Object.keys(overrides).length

export function codeLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return code.slice(6)
  const t: Record<string, string> = {
    Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`', Minus: '-', Equal: '=',
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Space: 'space', Enter: 'enter', Backspace: 'backspace', Tab: 'tab', Delete: 'delete',
    Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', Insert: 'insert',
  }
  return t[code] ?? code
}

export function partsOf(b: Binding): KeyPart[] {
  if (b.shift && !b.mod && !b.alt && b.code === 'Slash') return ['?']
  const out: KeyPart[] = []
  if (b.mod) out.push('mod')
  if (b.alt) out.push('alt')
  if (b.shift) out.push('shift')
  out.push(codeLabel(b.code))
  return out
}

export const shortcut = (id: string): KeyPart[] => {
  const b = bindingOf(id)
  return b ? partsOf(b) : byId(id)!.keys
}

export function matches(id: string, e: KeyboardEvent): boolean {
  const b = bindingOf(id)
  if (!b || e.code !== b.code) return false
  const mod = isMac ? e.metaKey : e.ctrlKey
  const other = isMac ? e.ctrlKey : e.metaKey
  return mod === !!b.mod && !other && e.shiftKey === !!b.shift && e.altKey === !!b.alt
}

export function bindingFromEvent(e: KeyboardEvent): Binding | null {
  if (!e.code || e.code === 'Unidentified' || /^(Control|Shift|Alt|Meta|AltGraph|OS)/.test(e.code)) return null
  const mod = isMac ? e.metaKey : e.ctrlKey
  return { mod: mod || undefined, shift: e.shiftKey || undefined, alt: e.altKey || undefined, code: e.code }
}

export function conflictOf(id: string, b: Binding): string | null {
  for (const s of SHORTCUTS) {
    if (s.id === id || !isEditable(s.id)) continue
    const o = bindingOf(s.id)
    if (o && same(o, b)) return s.id
  }
  if (!b.mod && !b.alt && !b.shift) {
    if (b.code === 'KeyG') return 'go-data'
    if (b.code === 'KeyJ' && id !== 'next') return 'next'
    if (b.code === 'KeyK' && id !== 'prev') return 'prev'
  }
  return null
}

export function problemOf(id: string, b: Binding): string | null {
  const group = byId(id)?.group ?? ''
  if (b.code === 'Escape') return 'Esc отменяет запись — выберите другую клавишу'
  if (NEEDS_MOD.includes(group)) {
    const printable = /^(Key|Digit|Numpad|Comma|Period|Slash|Backslash|Bracket|Semicolon|Quote|Backquote|Minus|Equal|Space)/.test(b.code)
    if (!b.mod && !b.alt && !(b.shift && !printable)) return 'Добавьте Ctrl/⌘ или Alt, иначе сочетание мешает печатать'
  }
  return null
}

export function browserReserved(b: Binding): boolean {
  if (b.alt && !b.mod && ['ArrowLeft', 'ArrowRight', 'Home'].includes(b.code)) return true
  if (/^F(5|11|12)$/.test(b.code)) return true
  if (!b.mod || b.alt) return false
  if (b.code === 'Tab') return true
  if (b.shift) return ['KeyN', 'KeyT', 'KeyW', 'KeyQ', 'Delete'].includes(b.code)
  return ['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'KeyL', 'KeyR', 'KeyP', 'KeyS', 'KeyF'].includes(b.code)
}
export const reservedOf = (id: string) => {
  const b = bindingOf(id)
  return !!b && browserReserved(b)
}

export function setBinding(id: string, b: Binding) {
  const d = DEFAULTS[id]
  if (!d) return
  const next: Binding = { mod: b.mod || undefined, shift: b.shift || undefined, alt: b.alt || undefined, code: b.code }
  if (same(d, next)) delete overrides[id]
  else overrides[id] = next
}
export const resetBinding = (id: string) => void delete overrides[id]
export const overridesSnapshot = (): Record<string, Binding> => JSON.parse(JSON.stringify(overrides))
export function restoreOverrides(s: Record<string, Binding>) {
  for (const [id, b] of Object.entries(s)) overrides[id] = b
}
export function resetAll() {
  for (const id of Object.keys(overrides)) delete overrides[id]
}
export function swapBinding(id: string, b: Binding) {
  const other = conflictOf(id, b)
  const mine = bindingOf(id)
  setBinding(id, b)
  if (other && isEditable(other) && mine) setBinding(other, mine)
}
