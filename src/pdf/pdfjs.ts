import type { PDFDocumentProxy } from 'pdfjs-dist'
import { API_URL, isApi } from '../config'
import { authHeaders } from '../api/client'

type PdfJs = typeof import('pdfjs-dist')
let lib: Promise<PdfJs> | null = null

export function pdfjs(): Promise<PdfJs> {
  lib ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([m, w]) => {
    m.GlobalWorkerOptions.workerSrc = w.default
    return m
  })
  return lib
}

const cache = new Map<string, Promise<PDFDocumentProxy>>()

export async function pdfError(src: string, e: unknown): Promise<string> {
  const st = (e as { status?: number } | null)?.status
  if (isApi && src.startsWith(API_URL + '/')) {
    try {
      const r = await fetch(src, { headers: { ...(await authHeaders()), Range: 'bytes=0-1023' }, credentials: 'include' })
      if (r.ok) {
        const type = r.headers.get('Content-Type') ?? ''
        if (!type.includes('pdf')) return `Сервер вернул не PDF (${type || 'без типа'})`
        const head = new TextDecoder().decode((await r.arrayBuffer()).slice(0, 5))
        return head.startsWith('%PDF') ? 'Сервер отдаёт PDF, но его не удалось прочитать — файл повреждён или обрезан' : 'Сервер вернул файл, который не похож на PDF'
      }
      let msg = ''
      try { msg = ((await r.json()) as { error?: { message?: string } }).error?.message ?? '' } catch { }
      if (r.status === 401) return 'Сервер не принял вход — войдите заново'
      if (r.status === 404) return msg || 'На сервере нет PDF этой статьи'
      return `Сервер ответил ${r.status}${msg ? ': ' + msg : ''}`
    } catch { return 'Сервер недоступен' }
  }
  return st ? `Ошибка загрузки ${st}` : e instanceof Error ? e.message : 'Неизвестная ошибка'
}

export async function openPdf(src: string): Promise<PDFDocumentProxy> {
  const fromApi = isApi && src.startsWith(API_URL + '/')
  const headers = fromApi ? await authHeaders() : undefined
  const hit = cache.get(src)
  if (hit) {
    cache.delete(src)
    cache.set(src, hit)
    return hit
  }
  const p = pdfjs().then((m) => m.getDocument({ url: src, isEvalSupported: false, ...(headers ? { httpHeaders: headers, withCredentials: true } : {}) }).promise)
  cache.set(src, p)
  p.catch(() => cache.delete(src))
  while (cache.size > 4) {
    const [k, old] = cache.entries().next().value as [string, Promise<PDFDocumentProxy>]
    cache.delete(k)
    old.then((d) => d.destroy()).catch(() => {})
  }
  return p
}
