import { reactive } from 'vue'

export const dock = reactive({ on: false, top: 0, left: 0, right: 0, zone: false, zl: 0, zr: 0 })
let started = false

const visible = (r: DOMRect | undefined): r is DOMRect => !!r && r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0

function read() {
  const h = window.innerHeight
  const r = [...document.querySelectorAll<HTMLElement>('[data-dock], .cmp, .fc')].map((el) => el.getBoundingClientRect()).find((x) => visible(x) && x.bottom > h * 0.6)
  const on = !!r
  const top = r ? Math.round(r.top) : 0
  const left = r ? Math.round(r.left) : 0
  const right = r ? Math.round(r.right) : 0
  if (dock.on !== on) dock.on = on
  if (dock.top !== top) dock.top = top
  if (dock.left !== left) dock.left = left
  if (dock.right !== right) dock.right = right
  const z = document.querySelector<HTMLElement>('[data-toast-zone], .pp__panel')?.getBoundingClientRect()
  const zone = visible(z) && z.width < window.innerWidth - 40
  const zl = zone ? Math.round(z.left) : 0
  const zr = zone ? Math.round(z.right) : 0
  if (dock.zone !== zone) dock.zone = zone
  if (dock.zl !== zl) dock.zl = zl
  if (dock.zr !== zr) dock.zr = zr
}

export function watchDock() {
  if (started) return
  started = true
  read()
  window.setInterval(read, 150)
  window.addEventListener('resize', read)
}
