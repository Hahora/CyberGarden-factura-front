export function scrollWithin(container: HTMLElement | null | undefined, el: Element | null | undefined, block: 'center' | 'nearest' = 'nearest', smooth = true) {
  if (!container || !el) return
  const c = container.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  let delta = 0
  if (block === 'center') delta = r.top + r.height / 2 - (c.top + c.height / 2)
  else if (r.top < c.top) delta = r.top - c.top - 8
  else if (r.bottom > c.bottom) delta = r.bottom - c.bottom + 8
  if (Math.abs(delta) < 1) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off'
  container.scrollTo({ top: container.scrollTop + delta, behavior: smooth && !reduce ? 'smooth' : 'auto' })
}
