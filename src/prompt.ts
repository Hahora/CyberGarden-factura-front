import { reactive } from 'vue'

export interface PromptOptions {
  title: string
  value?: string
  placeholder?: string
  ok?: string
  label?: string
  message?: string
  danger?: boolean
}

export const prompt = reactive<{ open: boolean; opts: PromptOptions; value: string; resolve: ((v: string | null) => void) | null }>({
  open: false,
  opts: { title: '' },
  value: '',
  resolve: null,
})

export function askText(opts: PromptOptions): Promise<string | null> {
  prompt.resolve?.(null)
  prompt.opts = opts
  prompt.value = opts.value ?? ''
  prompt.open = true
  return new Promise((resolve) => (prompt.resolve = resolve))
}

export function closePrompt(ok: boolean) {
  const r = prompt.resolve
  const v = prompt.value.trim()
  prompt.open = false
  prompt.resolve = null
  r?.(ok && (v || prompt.opts.message) ? v : null)
}

export async function askConfirm(title: string, message: string, ok = 'Удалить'): Promise<boolean> {
  return (await askText({ title, message, ok, danger: true })) !== null
}
