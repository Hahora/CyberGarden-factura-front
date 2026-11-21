import { onBeforeUnmount, ref, type Ref } from 'vue'
import { toast } from './store'

type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }
const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition

export function useVoice(text: Ref<string>, opts: { onText?: () => void; onEnd?: () => void } = {}) {
  const listening = ref(false)
  let rec: Rec | null = null
  let base = ''
  function toggle() {
    if (listening.value) return rec?.stop()
    if (!SR) return toast('Голосовой ввод не поддерживается в этом браузере — попробуйте Chrome или Edge')
    rec = new SR()
    rec.lang = 'ru-RU'
    rec.interimResults = true
    rec.continuous = true
    base = text.value ? text.value.replace(/\s*$/, ' ') : ''
    rec.onresult = (e) => {
      let fin = ''
      let mid = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!
        if (r.isFinal) fin += r[0]!.transcript
        else mid += r[0]!.transcript
      }
      if (fin) base += fin.trim() + ' '
      text.value = (base + mid).trimStart()
      opts.onText?.()
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') toast('Нет доступа к микрофону — разрешите его в настройках браузера')
      else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('Не удалось распознать речь')
    }
    rec.onend = () => {
      listening.value = false
      text.value = text.value.trim()
      opts.onEnd?.()
    }
    try {
      rec.start()
      listening.value = true
    } catch {
      listening.value = false
    }
  }
  const stop = () => rec?.stop()
  onBeforeUnmount(stop)
  return { listening, toggle, stop }
}
