import { ref } from 'vue'

export const demoText = ref('')
let timer = 0

export function demoNote(what: string) {
  demoText.value = ''
  clearTimeout(timer)
  requestAnimationFrame(() => { demoText.value = what + ' — только для демонстрации' })
  timer = window.setTimeout(() => (demoText.value = ''), 6000)
}
export const closeDemoNote = () => (demoText.value = '')
