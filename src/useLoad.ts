import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

export function useLoadGate(loading: Ref<boolean>, opts: { min?: number; delay?: number } = {}) {
  const min = opts.min ?? 300
  const delay = opts.delay ?? 150
  const phase = ref<'wait' | 'sk' | 'content'>(loading.value ? 'wait' : 'content')
  const animate = ref(false)
  let t0 = 0
  let timer = 0
  const clear = () => { window.clearTimeout(timer); timer = 0 }
  function start() {
    clear()
    animate.value = false
    phase.value = 'wait'
    timer = window.setTimeout(() => { phase.value = 'sk'; t0 = Date.now() }, delay)
  }
  function stop() {
    clear()
    if (phase.value === 'sk') {
      const left = min - (Date.now() - t0)
      if (left > 0) { timer = window.setTimeout(() => { phase.value = 'content'; animate.value = true }, left); return }
    }
    phase.value = 'content'
    animate.value = true
  }
  if (loading.value) start()
  watch(loading, (v) => (v ? start() : stop()))
  onBeforeUnmount(clear)
  return { phase, animate }
}
