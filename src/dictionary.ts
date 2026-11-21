import { reactive, watch } from 'vue'
import { COLLECTIONS, type CollectionId } from './data'
import { state } from './store'

export interface Synonym {
  text: string
  custom?: boolean
}

export interface MaterialEntry {
  id: string
  collection: CollectionId
  canon: string
  name: string
  synonyms: Synonym[]
}

export interface ConditionEntry {
  id: string
  canon: string
  name: string
  synonyms: Synonym[]
}

const s = (...list: string[]): Synonym[] => list.map((text) => ({ text }))

export const dictionary = reactive({
  params: {
    solar: {
      pce: s('КПД', 'PCE', 'η', 'эффективность преобразования', 'power conversion efficiency'),
      voc: s('Voc', 'V_oc', 'Uхх', 'напряжение холостого хода', 'open-circuit voltage'),
      jsc: s('Jsc', 'J_sc', 'плотность тока короткого замыкания', 'short-circuit current density'),
      ff: s('FF', 'фактор заполнения', 'fill factor'),
      rs: s('Rs', 'R_s', 'последовательное сопротивление', 'series resistance'),
      rsh: s('Rsh', 'R_sh', 'шунтирующее сопротивление', 'shunt resistance'),
      hi: s('HI', 'индекс гистерезиса', 'hysteresis index'),
      jsc_eqe: s('Jsc по EQE', 'Jsc (EQE)', 'интегральный ток по EQE', 'integrated Jsc'),
      t80: s('T80', 'время потери 20 % КПД', 'время жизни T80'),
      retained_pce: s('сохранение КПД', 'retained PCE', 'остаточный КПД'),
      bandgap: s('Eg', 'ширина запрещённой зоны', 'bandgap', 'band gap'),
      thickness: s('толщина поглотителя', 'толщина активного слоя', 'absorber thickness'),
      conditions: s('условия измерения', 'AM1.5G', 'стандартные условия', 'STC'),
    },
    rag: {
      r5: s('Recall@5', 'R@5', 'полнота@5', 'recall at 5'),
      r10: s('Recall@10', 'R@10', 'полнота@10'),
      mrr: s('MRR', 'mean reciprocal rank', 'средний обратный ранг'),
      r20: s('Recall@20', 'R@20', 'полнота@20'),
      ndcg10: s('nDCG@10', 'NDCG@10', 'нормализованный дисконтированный выигрыш'),
      latency_ms: s('задержка', 'latency', 'время ответа'),
      chunk: s('размер чанка', 'chunk size', 'длина фрагмента', 'окно'),
      retriever: s('ретривер', 'retriever', 'поисковик', 'метод поиска'),
    },
  } as Record<CollectionId, Record<string, Synonym[]>>,

  materials: [
    { id: 'mapbi', collection: 'solar', canon: 'MAPbI₃', name: 'Метиламмоний-йодид свинца', synonyms: s('CH3NH3PbI3', 'CH₃NH₃PbI₃', 'MAPI', 'MAPbI3') },
    { id: 'fapbi', collection: 'solar', canon: 'FAPbI₃', name: 'Формамидиний-йодид свинца', synonyms: s('HC(NH2)2PbI3', 'FAPI', 'FAPbI3') },
    { id: 'cigs', collection: 'solar', canon: 'Cu(In,Ga)Se₂', name: 'CIGS', synonyms: s('CIGS', 'CuInGaSe2', 'CuIn1-xGaxSe2') },
    { id: 'czts', collection: 'solar', canon: 'Cu₂ZnSn(S,Se)₄', name: 'Кестерит (CZTS/CZTSSe)', synonyms: s('CZTSSe', 'CZTS', 'CZTSe', 'Cu2ZnSn(S,Se)4', 'Cu2ZnSnS4', 'кестерит') },
    { id: 'sbse', collection: 'solar', canon: 'Sb₂Se₃', name: 'Селенид сурьмы', synonyms: s('Sb2Se3', 'селенид сурьмы', 'антимонид селена') },
    { id: 'cdte', collection: 'solar', canon: 'CdTe', name: 'Теллурид кадмия', synonyms: s('CdTe', 'теллурид кадмия') },
    { id: 'fasni', collection: 'solar', canon: 'FASnI₃', name: 'Формамидиний-йодид олова', synonyms: s('FASnI3', 'HC(NH2)2SnI3', 'бессвинцовый перовскит') },
    { id: 'sno2', collection: 'solar', canon: 'SnO₂', name: 'Диоксид олова (транспортный слой)', synonyms: s('SnO2', 'tin oxide') },
    { id: 'spiro', collection: 'solar', canon: 'Spiro-OMeTAD', name: 'Дырочный транспортный слой', synonyms: s('spiro', 'Spiro-MeOTAD', 'спиро') },
    { id: 'bm25', collection: 'rag', canon: 'BM25', name: 'Лексический поиск Okapi BM25', synonyms: s('Okapi BM25', 'bm-25', 'sparse') },
    { id: 'dense', collection: 'rag', canon: 'Dense', name: 'Векторный поиск по эмбеддингам', synonyms: s('dense retrieval', 'векторный', 'DPR', 'эмбеддинги') },
    { id: 'hybrid', collection: 'rag', canon: 'Hybrid', name: 'Гибрид BM25 и векторного', synonyms: s('гибридный', 'hybrid search', 'BM25+dense') },
  ] as MaterialEntry[],

  conditions: [
    { id: 'am15', canon: 'AM1.5G, 100 мВт/см², 25 °C', name: 'Стандартные условия испытаний', synonyms: s('AM 1.5G', 'AM1,5G', '1 sun', '1000 Вт/м²', 'STC', 'одно солнце') },
    { id: 'mpp', canon: 'MPP-трекинг', name: 'Слежение за точкой максимальной мощности', synonyms: s('MPPT', 'maximum power point tracking') },
  ] as ConditionEntry[],
})

const DKEY = 'gs:v1:dict-custom'
interface Saved { params: Record<string, Record<string, string[]>>; entries: Record<string, string[]> }
const entries = () => [...dictionary.materials, ...dictionary.conditions]
function snapshot(): Saved {
  const params: Saved['params'] = {}
  for (const [c, map] of Object.entries(dictionary.params)) {
    for (const [k, list] of Object.entries(map)) {
      const own = list.filter((x) => x.custom).map((x) => x.text)
      if (own.length) (params[c] ??= {})[k] = own
    }
  }
  const ent: Saved['entries'] = {}
  for (const en of entries()) {
    const own = en.synonyms.filter((x) => x.custom).map((x) => x.text)
    if (own.length) ent[en.id] = own
  }
  return { params, entries: ent }
}
try {
  const saved = JSON.parse(localStorage.getItem(DKEY) ?? 'null') as Saved | null
  if (saved) {
    for (const [c, map] of Object.entries(saved.params ?? {})) {
      for (const [k, texts] of Object.entries(map)) {
        const list = ((dictionary.params as Record<string, Record<string, Synonym[]>>)[c] ??= {})[k] ??= []
        for (const t of texts) if (!list.some((x) => x.text === t)) list.push({ text: t, custom: true })
      }
    }
    for (const en of entries()) for (const t of saved.entries?.[en.id] ?? []) if (!en.synonyms.some((x) => x.text === t)) en.synonyms.push({ text: t, custom: true })
  }
} catch { }
watch(snapshot, (v) => {
  try { localStorage.setItem(DKEY, JSON.stringify(v)) } catch { }
}, { deep: true })

export function paramBySynonym(collection: CollectionId, text: string): string | null {
  const t = text.trim().toLowerCase()
  for (const [key, list] of Object.entries(dictionary.params[collection])) {
    if (list.some((x) => x.text.toLowerCase() === t)) return key
  }
  return null
}

export function materialBySynonym(text: string): MaterialEntry | null {
  const t = text.trim().toLowerCase()
  return dictionary.materials.find((m) => m.canon.toLowerCase() === t || m.synonyms.some((x) => x.text.toLowerCase() === t)) ?? null
}

function papersWith(collection: CollectionId, key: string) {
  const ids = new Set(state.facts.filter((f) => f.param === key).map((f) => f.paperId))
  return state.papers.filter((p) => p.collection === collection && ids.has(p.id))
}

export function paramUsage(collection: CollectionId, key: string) {
  const papers = papersWith(collection, key)
  const set = new Set(papers.map((p) => p.id))
  const facts = state.facts.filter((f) => f.param === key && set.has(f.paperId)).length
  return { facts, papers: papers.length, totalPapers: state.papers.filter((p) => p.collection === collection).length }
}

export function addParamSynonym(collection: CollectionId, key: string, text: string): number | null {
  const t = text.trim()
  if (!t) return null
  if (paramBySynonym(collection, t) || COLLECTIONS[collection].params.some((p) => p.label.toLowerCase() === t.toLowerCase())) return null
  const list = (dictionary.params[collection][key] ??= [])
  list.push({ text: t, custom: true })
  return state.papers.filter((p) => p.collection === collection).length
}
export function removeParamSynonym(collection: CollectionId, key: string, text: string) {
  const list = dictionary.params[collection][key]
  const i = list?.findIndex((x) => x.custom && x.text === text) ?? -1
  if (list && i >= 0) list.splice(i, 1)
}

export function addEntrySynonym(entry: MaterialEntry | ConditionEntry, text: string): boolean {
  const t = text.trim()
  if (!t || entry.canon.toLowerCase() === t.toLowerCase() || entry.synonyms.some((x) => x.text.toLowerCase() === t.toLowerCase())) return false
  entry.synonyms.push({ text: t, custom: true })
  return true
}
export function removeEntrySynonym(entry: MaterialEntry | ConditionEntry, text: string) {
  const i = entry.synonyms.findIndex((x) => x.custom && x.text === text)
  if (i >= 0) entry.synonyms.splice(i, 1)
}

export function entryPapers(entry: MaterialEntry | ConditionEntry, collection?: CollectionId): number {
  const words = [entry.canon, ...entry.synonyms.map((x) => x.text)].map((w) => w.toLowerCase())
  return state.papers.filter((p) => {
    if (collection && p.collection !== collection) return false
    const hay = (p.title + ' ' + p.tags + ' ' + p.paragraphs.join(' ')).toLowerCase()
    return words.some((w) => hay.includes(w))
  }).length
}

export function unitRows(collection: CollectionId) {
  const out: { key: string; label: string; unit: string; canon: string; k: number; count: number; isCanon: boolean; example: string }[] = []
  const ids = new Set(state.papers.filter((p) => p.collection === collection).map((p) => p.id))
  for (const p of COLLECTIONS[collection].params) {
    if (p.text) continue
    for (const [u, k] of Object.entries(p.units)) {
      const count = state.facts.filter((f) => f.param === p.key && ids.has(f.paperId) && f.raw.replace(/^-?\d+(?:[.,]\d+)?\s*/, '') === u).length
      const sample = k === 1 ? 10 : k < 1 ? 1000 : 1
      const val = sample * k
      const fmtN = (n: number) => String(+n.toFixed(4)).replace('.', ',')
      out.push({
        key: p.key + ':' + u, label: p.label, unit: u, canon: p.unit, k, count, isCanon: u === p.unit || k === 1,
        example: `${fmtN(sample)}${u ? ' ' + u : ''} → ${fmtN(val)}${p.unit ? ' ' + p.unit : ''}`,
      })
    }
  }
  return out
}
