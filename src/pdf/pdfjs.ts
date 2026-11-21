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
