const BASE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']
const PALETTE = [...BASE, ...BASE.map((c) => `color-mix(in srgb, ${c} 55%, var(--ink))`)]

const FIXED: Record<string, number> = {
  mapbi: 0, stab: 1, leadfree: 2, czts: 3, cigs: 4, cdte: 5, sbse: 7,
  hybrid: 0, chunks: 2, rerank: 3,
}

function hash(s: string) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

export function paperColor(paperId: string): string {
  const i = FIXED[paperId] ?? hash(paperId) % 6
  return PALETTE[i]!
}
