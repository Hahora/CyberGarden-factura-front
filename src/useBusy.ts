import { nextTick, ref } from 'vue'

export function useBusy() {
  const busy = ref(false)
  async function run(fn: () => unknown, ev?: Event) {
    if (busy.value) return
    const el = ev?.currentTarget instanceof HTMLElement ? ev.currentTarget : null
    if (el) el.style.minWidth = el.offsetWidth + 'px'
    busy.value = true
    try {
      await nextTick()
      await new Promise((r) => setTimeout(r, 30))
      await fn()
    } finally {
      busy.value = false
      if (el) el.style.minWidth = ''
    }
  }
  return { busy, run }
}
