const LIG: Record<string, string> = { 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st', 'ё': 'е' }
const KEEP = /[a-z0-9.%а-я]/

export function norm(s: string): string {
  let out = ''
  for (const ch of s.toLowerCase()) {
    const c = LIG[ch] ?? ch
    for (const x of c) if (KEEP.test(x)) out += x
  }
  return out
}

export interface Piece { item: number; start: number; end: number }

export interface PageIndex { text: string; item: number[]; char: number[] }

export function indexPage(strs: string[]): PageIndex {
  let text = ''
  const item: number[] = []
  const char: number[] = []
  strs.forEach((s, i) => {
    for (let j = 0; j < s.length; j++) {
      const n = norm(s[j]!)
      for (const x of n) {
        text += x
        item.push(i)
        char.push(j)
      }
    }
  })
  return { text, item, char }
}

function piecesOf(ix: PageIndex, from: number, to: number): Piece[] {
  const out: Piece[] = []
  for (let k = from; k < to; k++) {
    const it = ix.item[k]!
    const ch = ix.char[k]!
    const last = out[out.length - 1]
    if (last && last.item === it) last.end = Math.max(last.end, ch + 1)
    else out.push({ item: it, start: ch, end: ch + 1 })
  }
  return out
}

function tableRef(fragment: string): { table: string; row: string; supp: boolean } | null {
  const m = /^\s*(supplementary\s+)?(table|tab\.)\s*([a-z]?\d+[a-z]?)\b[\s,.:;]*(.*)$/i.exec(fragment)
  if (m) {
    const row = (m[4] ?? '').replace(/^(строка|столбец|колонка|row|column)\s*/i, '').trim()
    return { table: 'table' + m[3]!.toLowerCase(), row, supp: !!m[1] }
  }
  if (/^\s*supplementary/i.test(fragment)) return { table: '', row: '', supp: true }
  return null
}

function allIndexes(text: string, needle: string): number[] {
  const out: number[] = []
  if (!needle) return out
  let i = text.indexOf(needle)
  while (i >= 0) {
    out.push(i)
    i = text.indexOf(needle, i + 1)
  }
  return out
}

function valueRegex(value: string): RegExp | null {
  const m = /\d+(?:[.,]\d+)?/.exec(value.replace(/[−–]/g, '-'))
  if (!m) return null
  return new RegExp(String.raw`(?<![\d.,])` + m[0].replace(/[.,]/g, '[.,]') + String.raw`(?!\d|[.,]\d)`, 'g')
}
function findValueNear(strs: string[], value: string, center: number, radius: number): Piece | null {
  const rx = valueRegex(value)
  if (!rx) return null
  for (let d = 0; d <= radius; d++) {
    for (const i of d === 0 ? [center] : [center + d, center - d]) {
      if (i < 0 || i >= strs.length) continue
      rx.lastIndex = 0
      const m = rx.exec(strs[i]!)
      if (m) return { item: i, start: m.index, end: m.index + m[0].length }
    }
  }
  return null
}
function findValue(strs: string[], value: string, item: number, char: number, maxItems: number): Piece | null {
  const rx = valueRegex(value)
  if (!rx) return null
  for (let i = Math.max(0, item); i < Math.min(strs.length, item + maxItems); i++) {
    rx.lastIndex = i === item ? char : 0
    const m = rx.exec(strs[i]!)
    if (m) return { item: i, start: m.index, end: m.index + m[0].length }
  }
  return null
}

export function findFragment(strs: string[], fragment: string, value = '', table = ''): Piece[] | null {
  let frag = fragment.trim()
  if (!frag && table.trim()) frag = table.trim()
  if (!frag) return null
  const ix = indexPage(strs)
  if (!ix.text) return null

  let tref = tableRef(frag)
  const viaTable = !tref && !!table.trim() && !!value
  if (viaTable) tref = tableRef(table.trim())
  let capFallback: Piece[] | null = null
  if (tref && !tref.row && table.trim() && table.trim() !== frag) tref = { ...tref, row: tableRef(table.trim())?.row ?? '' }
  if (tref) {
    if (!tref.table) {
      const at = ix.text.indexOf('supplementary')
      return at >= 0 ? piecesOf(ix, at, at + 'supplementary'.length) : null
    }
    const hits = allIndexes(ix.text, tref.table)
    const clean = hits.filter((h) => !/[0-9]/.test(ix.text[h + tref!.table.length] ?? ''))
    const caption = clean.length ? clean.find((h) => ix.char[h] === 0 || /^\s*$/.test(strs[ix.item[h]!]!.slice(0, ix.char[h]))) ?? clean[0]! : -1
    const capPieces = caption >= 0 ? piecesOf(ix, caption, caption + tref.table.length) : null
    const row = norm(tref.row)
    const from = caption >= 0 ? caption + tref.table.length : 0
    const rows = row.length >= 2 ? allIndexes(ix.text, row).filter((k) => k >= from) : []
    const r = rows[0] ?? -1
    if (value) {
      for (const k of rows) {
        const hit = findValue(strs, value, ix.item[k]!, ix.char[k]!, 60)
        if (hit) return [hit]
      }
      if (r < 0 && caption >= 0 && !row) {
        const hit = findValueNear(strs, value, ix.item[caption]!, 250)
        if (hit) return [hit]
      }
    }
    if (r >= 0) return piecesOf(ix, r, r + row.length)
    if (!viaTable) return capPieces
    capFallback = capPieces
  }

  const n = norm(frag)
  if (n.length < 3) return capFallback
  const at = ix.text.indexOf(n)
  if (at >= 0) return piecesOf(ix, at, at + n.length)

  const parts = frag.split(/\s*(?:…|\.\.\.|\[\.\.\.\])\s*/).map(norm).filter((p) => p.length >= 8).sort((a, b) => b.length - a.length)
  for (const p of parts) {
    const k = ix.text.indexOf(p)
    if (k >= 0) return piecesOf(ix, k, k + p.length)
  }
  if (n.length >= 40) {
    const head = n.slice(0, 24)
    const tail = n.slice(-24)
    const h = ix.text.indexOf(head)
    const t = h >= 0 ? ix.text.indexOf(tail, h) : -1
    if (h >= 0 && t >= 0 && t - h < n.length * 1.6) return piecesOf(ix, h, t + tail.length)
    if (h >= 0) return piecesOf(ix, h, Math.min(ix.text.length, h + n.length))
  }
  return capFallback
}
