export const fmtInt = (n: number | string): string => {
  const v = typeof n === 'number' ? Math.round(n) : parseInt(String(n), 10)
  if (!Number.isFinite(v)) return String(n)
  return String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0').replace(/^/, v < 0 ? '−' : '')
}
