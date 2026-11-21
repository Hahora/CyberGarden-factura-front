import { ApiError, get, request } from './client'
import { dictionary, type Synonym } from '../dictionary'
import type { CollectionId } from '../data'

const enc = encodeURIComponent
const runPath = (id: string) => `/runs/${enc(id)}`

export const askApi = (run: string, question: string, pids: string[]) =>
  request<unknown>(`${runPath(run)}/ask`, { method: 'POST', body: pids.length ? { question, pids } : { question }, silent: true })
export const askSuggestionsApi = (run: string) => get<string[]>(`${runPath(run)}/ask/suggestions`, undefined, { silent: true })

interface ServerSyn { id?: string; text: string; custom?: boolean }
interface ServerEntry { id: string; collection?: CollectionId; canon: string; name: string; synonyms: ServerSyn[] }
interface ServerDict { collection: CollectionId; version?: string; params: Record<string, ServerSyn[]>; materials: ServerEntry[]; conditions: ServerEntry[] }

const syns = (l: ServerSyn[]): Synonym[] => l.map((x) => ({ text: x.text, ...(x.custom ? { custom: true } : {}) }))
const loaded = new Set<CollectionId>()
export async function loadDictionary(c: CollectionId, force = false): Promise<void> {
  if (loaded.has(c) && !force) return
  const d = await get<ServerDict>('/dictionary', { collection: c }, { silent: true })
  loaded.add(c)
  dictionary.params[c] = Object.fromEntries(Object.entries(d.params ?? {}).map(([k, l]) => [k, syns(l)]))
  const mats = (d.materials ?? []).map((m) => ({ id: m.id, collection: m.collection ?? c, canon: m.canon, name: m.name, synonyms: syns(m.synonyms) }))
  dictionary.materials = [...dictionary.materials.filter((m) => m.collection !== c), ...mats]
  if (c === 'solar') dictionary.conditions = (d.conditions ?? []).map((m) => ({ id: m.id, canon: m.canon, name: m.name, synonyms: syns(m.synonyms) }))
}

export const addParamSynonymApi = (c: CollectionId, param: string, text: string) =>
  request(`/dictionary/params/${c}/${enc(param)}/synonyms`, { method: 'POST', body: { text }, silent: true })
export const addEntrySynonymApi = (entry: string, text: string) =>
  request(`/dictionary/entries/${enc(entry)}/synonyms`, { method: 'POST', body: { text }, silent: true })
export const removeParamSynonymApi = (c: CollectionId, param: string, text: string) =>
  request(`/dictionary/params/${c}/${enc(param)}/synonyms/${enc(text)}`, { method: 'DELETE', silent: true })
export const removeEntrySynonymApi = (entry: string, text: string) =>
  request(`/dictionary/entries/${enc(entry)}/synonyms/${enc(text)}`, { method: 'DELETE', silent: true })

export const errText = (e: unknown, fallback: string) => (e instanceof ApiError && e.code !== 'network' ? e.message : fallback)
