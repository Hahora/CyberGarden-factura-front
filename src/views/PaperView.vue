<script setup lang="ts">
import { FEATURES } from '../features'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import UiSplit from '../components/UiSplit.vue'
import UiEmpty from '../components/UiEmpty.vue'
import UiLoad from '../components/UiLoad.vue'
import UiSkeleton from '../components/UiSkeleton.vue'
import { dropPaper, isRemoteScope, paperFailed, paperLoaded } from '../api/papers'
import BackChip from '../components/BackChip.vue'
import { runForPaper } from '../dataTabs'
import { REJECT_CSV_NOTE, editCsvNote } from '../case/csvNote'
import PdfViewer from '../components/PdfViewer.vue'
import RagPaper from '../components/RagPaper.vue'
import { ragHasData, ragInScope, ragIsScan, ragPublication } from '../case/rag'
import { ruText } from '../case/ask'
import { state, toast } from '../store'
import { isApi, DEV_TEXT } from '../config'
import {
  AGG_RU, CLASS_RU, INHERITED_TEXT, ISSUE_STATE_RU, LAYER_RU, NODATA_TEXT, ROLE_RU, SCAN_RU, STATUS_RU, TYPE_RU,
  checkLabel, correctedText, deviceName, devicesOf, dupLabel, fmtRaw, fmtValue, hasData, inScope, isScored, issueRecords, issueState, issueTodo,
  issuesForResult, issuesOf, resultMeta, labelOfField, metricLabel, layersOf, markClass, materialsOf, measurementsOf, num, pdfUrl, placeOf, publication,
  reopenIssue, resetReview, resolveIssue, resultName, resultsOf, reviewInherited, reviewMark, reviewOf, ruTerm, setReview, unitRu, valueClass, valueOf,
  reviewScope, type DeviceRow, type IssueRow, type LayerRow, type ResultRow, type Review,
} from '../case'

const props = defineProps<{ pid: string; domain?: 'solar' | 'rag' }>()
const route = useRoute()
const router = useRouter()
const mobile = computed(() => state.mobile)

const pid = computed(() => props.pid)
const isRag = computed(() => props.domain === 'rag')
const backTo = computed(() => { const id = runForPaper(props.pid, props.domain ?? 'solar'); return id ? '/run/' + encodeURIComponent(id) : '/app' })
const paperRun = computed(() => runForPaper(props.pid, props.domain ?? 'solar'))
const pub = computed(() => (isRag.value ? ragPublication(pid.value) : publication(pid.value)))
const known = computed(() => (isRag.value ? ragHasData(pid.value) : hasData(pid.value)))
const outOfScope = computed(() => known.value && !(isRag.value ? ragInScope(pid.value) : inScope(pid.value)))
const src = computed(() => pdfUrl(pid.value, props.domain ?? 'solar'))
const paperLoading = computed(() => isApi && !isRag.value && isRemoteScope(reviewScope.value) && !paperLoaded(reviewScope.value, pid.value))
const paperError = computed(() => isApi && !isRag.value && isRemoteScope(reviewScope.value) && paperFailed(reviewScope.value, pid.value))
const retryPaper = () => dropPaper(reviewScope.value, pid.value)
const scan = computed(() => isRag.value && ragIsScan(pid.value))

const results = computed(() => (isRag.value ? [] : resultsOf(pid.value)))
const devices = computed(() => (isRag.value ? [] : devicesOf(pid.value)))
const issues = computed(() => (isRag.value ? [] : issuesOf(pid.value)))
const materials = computed(() => (isRag.value ? [] : materialsOf(pid.value)))
const measurements = computed(() => (isRag.value ? [] : measurementsOf(pid.value)))
const devName = (id: string) => deviceName(pid.value, id)

const authors = computed(() => {
  const list = (pub.value?.authors ?? '').split(';').map((s) => s.trim()).filter(Boolean)
  return list.length > 3 ? list.slice(0, 3).join(', ') + ' и др.' : list.join(', ')
})
const longTitle = computed(() => ((pub.value?.title?.length ?? 0) > 110 ? pub.value!.title : undefined))
const titleOpen = ref(false)
const compact = ref(false)
function onBodyScroll(e: Event) {
  if (!mobile.value) return
  const t = e.target as HTMLElement | null
  const y = t?.scrollTop ?? 0
  if (y > 24 && !compact.value) { compact.value = true; titleOpen.value = false }
  else if (y < 4 && compact.value) compact.value = false
}

const stOf = (i: IssueRow) => issueState(pid.value, i.issue_id)
const issueList = computed(() => {
  const open = issues.value.filter((i) => stOf(i) === 'open')
  return [...open, ...issues.value.filter((i) => stOf(i) !== 'open')]
})
const issueText = (i: IssueRow) => ruText(i.description)
const openCount = computed(() => issues.value.filter((i) => stOf(i) === 'open').length)

type Tab = 'val' | 'dev' | 'iss' | 'links'
const tab = ref<Tab>('val')
const tabs = computed(() => [
  { id: 'val' as Tab, label: 'Значения', n: results.value.length, tip: '' },
  { id: 'dev' as Tab, label: 'Прибор', n: 0, tip: '' },
  { id: 'iss' as Tab, label: 'Замечания', n: openCount.value, tip: openCount.value ? 'Нужно проверить' : '' },
  ...(FEATURES.graph ? [{ id: 'links' as Tab, label: 'Связи', n: 0, tip: '' }] : []),
])
const linkMods = import.meta.glob<{ default: Component }>('../components/CaseLinks.vue')
const linkLoader = Object.values(linkMods)[0]
const CaseLinks = linkLoader ? defineAsyncComponent(linkLoader) : null
const scrollBox = ref<HTMLElement>()
const view = ref<'pdf' | 'data'>(route.query.r || route.query.i || route.query.page ? 'pdf' : 'data')
watch(
  () => [tab.value, view.value] as const,
  ([t], old) => {
    if (!old || old[0] !== t) scrollBox.value?.scrollTo({ top: 0 })
  },
)

interface Group { key: string; title: string; dev?: DeviceRow; rows: ResultRow[] }
const groups = computed<Group[]>(() => {
  const scored = results.value.filter(isScored)
  const other = results.value.filter((r) => !isScored(r))
  const ids = new Set(devices.value.map((d) => d.device_id))
  const out: Group[] = devices.value
    .map((d) => ({ key: d.device_id, title: devName(d.device_id), dev: d, rows: scored.filter((r) => r.device_id === d.device_id) }))
    .filter((g) => g.rows.length)
  const orphan = scored.filter((r) => !ids.has(r.device_id))
  const cited = orphan.filter((r) => r.result_origin === 'cited')
  const rest = orphan.filter((r) => r.result_origin !== 'cited')
  if (rest.length) out.push({ key: '_none', title: 'Без прибора', rows: rest })
  if (cited.length) out.push({ key: '_cited', title: 'Из других работ', rows: cited })
  if (other.length) out.push({ key: '_other', title: 'Прочие показатели', rows: other })
  return out
})
const folded = ref(new Set<string>(['_other']))
function toggleGroup(k: string) {
  const s = new Set(folded.value)
  if (s.has(k)) s.delete(k)
  else s.add(k)
  folded.value = s
}
const flat = computed(() => groups.value.flatMap((g) => (folded.value.has(g.key) ? [] : g.rows)))

const devMeta = (d: DeviceRow) =>
  [
    ROLE_RU[d.device_role],
    TYPE_RU[d.device_type],
    d.architecture && ruTerm(d.architecture),
    d.active_area && `${num(d.active_area, 4)} ${unitRu(d.area_unit || 'cm2')}`,
  ].filter(Boolean).join(' · ')

const rawDiffers = (r: ResultRow) => {
  if (!r.raw_value) return false
  const raw = parseFloat(r.raw_value)
  const v = valueOf(r)
  if (r.raw_unit === r.normalized_unit && v != null && Math.abs(raw - v) < 1e-9) return false
  return fmtRaw(r) !== fmtValue(r)
}
const reviewed = (r: ResultRow) => reviewOf(r.publication_id, r.result_id)
const markOf = (r: ResultRow) => reviewMark(r.publication_id, r.result_id)
const inherited = (r: ResultRow) => reviewInherited(r.publication_id, r.result_id)
const openIssuesFor = (r: ResultRow) => issuesForResult(pid.value, r.result_id).filter((i) => stOf(i) === 'open')
const issueTip = (r: ResultRow) => {
  const l = openIssuesFor(r)
  return l.length ? 'Есть замечание: ' + l.map((i) => checkLabel(i.check_name)).join(', ') : ''
}

const sel = ref<string | null>(null)
const selIssue = ref<string | null>(null)
const pdfPage = ref<number | null>(route.query.page ? Number(route.query.page) || null : null)
const pdfFrag = ref<string | null>(null)
const pdfVal = ref('')
const pdfTab = ref('')
const nonce = ref(0)
const ragLabel = ref<string | null>(null)
const ragSel = ref(false)
function onRagShow(p: { page: number | null; fragment: string; label: string | null; toPdf: boolean; kind: 'result' | 'issue'; value?: string; table?: string }) {
  ragSel.value = true
  ragLabel.value = p.label
  pdfPage.value = p.page ?? pdfPage.value
  pdfFrag.value = p.fragment
  pdfVal.value = p.value ?? ''
  pdfTab.value = p.table ?? ''
  nonce.value++
  if (mobile.value && p.toPdf) view.value = 'pdf'
}
watch(pid, () => { ragSel.value = false; ragLabel.value = null; pdfFrag.value = null })
const pdfLabel = computed(() => {
  if (isRag.value) return ragLabel.value
  if (sel.value) {
    const r = results.value.find((x) => x.result_id === sel.value)
    return r ? resultName(r) : null
  }
  if (selIssue.value) {
    const i = issues.value.find((x) => x.issue_id === selIssue.value)
    return i ? checkLabel(i.check_name) : null
  }
  return null
})

const editing = ref<string | null>(null)
const editVal = ref('')
let editInput: HTMLInputElement | null = null
const setEditInput = (el: unknown) => (editInput = el instanceof HTMLInputElement ? el : null)

function setQuery(q: Record<string, string | undefined>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...q })) if (typeof v === 'string' && v) next[k] = v
  void router.replace({ query: next })
}

function pickResult(r: ResultRow, o: { toPdf?: boolean; reveal?: boolean } = {}) {
  sel.value = r.result_id
  selIssue.value = null
  tab.value = 'val'
  editing.value = null
  if (!isScored(r) && folded.value.has('_other')) toggleGroup('_other')
  pdfPage.value = Number(r.source_page) || pdfPage.value
  pdfFrag.value = r.source_fragment || r.source_table || ''
  pdfVal.value = r.raw_value || r.normalized_value || ''
  pdfTab.value = r.source_table || ''
  nonce.value++
  setQuery({ r: r.result_id, i: undefined, page: undefined })
  if (mobile.value && o.toPdf !== false) view.value = 'pdf'
  if (o.reveal) void reveal()
}
function pickIssue(i: IssueRow, o: { toPdf?: boolean; reveal?: boolean } = {}) {
  selIssue.value = i.issue_id
  sel.value = null
  tab.value = 'iss'
  if (i.source_page || i.source_fragment) {
    pdfPage.value = Number(i.source_page) || pdfPage.value
    pdfFrag.value = i.source_fragment
    pdfVal.value = ''
    pdfTab.value = ''
    nonce.value++
    if (mobile.value && o.toPdf) view.value = 'pdf'
  }
  setQuery({ i: i.issue_id, r: undefined, page: undefined })
  if (o.reveal) void reveal()
}
const hasPlace = (i: IssueRow) => !!(i.source_page || i.source_fragment)
function openRecord(rid: string) {
  const r = results.value.find((x) => x.result_id === rid)
  if (r) pickResult(r, { reveal: true, toPdf: false })
}
async function reveal() {
  await nextTick()
  if (mobile.value && view.value !== 'data') return
  scrollBox.value?.querySelector<HTMLElement>('.is-sel')?.scrollIntoView({ block: mobile.value ? 'start' : 'nearest' })
}
watch(view, (v) => { if (v === 'data') void reveal() })

watch(
  () => [route.query.r, route.query.i] as const,
  ([r, i]) => {
    if (isRag.value) return
    if (typeof r === 'string' && r !== sel.value) {
      const row = results.value.find((x) => x.result_id === r)
      if (row) pickResult(row, { reveal: true })
    } else if (typeof i === 'string' && i !== selIssue.value) {
      const row = issues.value.find((x) => x.issue_id === i)
      if (row) pickIssue(row, { reveal: true, toPdf: true })
    }
  },
  { immediate: true },
)

function restore(r: ResultRow, prev: Review) {
  resetReview(r.publication_id, r.result_id)
  if (prev.status !== 'new' || prev.corrected != null) setReview(r.publication_id, r.result_id, prev)
}
function say(what: string, r: ResultRow, prev: Review) {
  toast(`${what}: ${resultName(r)}`, { label: 'Вернуть', run: () => restore(r, prev) })
}
function accept(r: ResultRow, next = false) {
  if (isApi) return
  const prev = setReview(r.publication_id, r.result_id, { status: 'accepted' })
  say('Принято', r, prev)
  if (next) move(1)
}
function reject(r: ResultRow) {
  if (isApi) return
  const prev = setReview(r.publication_id, r.result_id, { status: 'rejected' })
  say('Отклонено', r, prev)
}
async function startEdit(r: ResultRow) {
  if (isApi) return
  editing.value = r.result_id
  editVal.value = correctedText(r)
  await nextTick()
  scrollBox.value?.querySelector<HTMLElement>('.is-sel')?.scrollIntoView({ block: 'nearest' })
  editInput?.focus({ preventScroll: true })
  editInput?.select()
}
function saveEdit(r: ResultRow) {
  const raw = editVal.value.replace(',', '.').replace('−', '-').trim()
  const v = parseFloat(raw)
  const digits = (/^-?\d*\.(\d+)$/.exec(raw)?.[1] ?? '').length
  if (!Number.isFinite(v)) {
    toast('Введите число')
    return
  }
  const prev = setReview(r.publication_id, r.result_id, { status: 'accepted', corrected: v, digits })
  editing.value = null
  nonce.value++
  say('Исправлено', r, prev)
}

function resolve(i: IssueRow, how: 'fixed' | 'ok') {
  if (isApi) return
  resolveIssue(pid.value, i.issue_id, how)
  toast(`${ISSUE_STATE_RU[how]}: ${checkLabel(i.check_name)}`, { label: 'Вернуть', run: () => reopenIssue(pid.value, i.issue_id) })
}
function reopen(i: IssueRow) {
  if (isApi) return
  reopenIssue(pid.value, i.issue_id)
  if (stOf(i) !== 'open') toast('Замечание закрыто само: все его значения исправлены или отклонены')
}

function move(d: number) {
  const list = flat.value
  if (!list.length) return
  const i = list.findIndex((r) => r.result_id === sel.value)
  const next = list[i < 0 ? 0 : Math.min(list.length - 1, Math.max(0, i + d))]
  if (next && next.result_id !== sel.value) pickResult(next, { reveal: true, toPdf: false })
}
function onKey(e: KeyboardEvent) {
  if (isRag.value || tab.value !== 'val' || e.altKey || e.ctrlKey || e.metaKey || mobile.value) return
  const t = e.target as HTMLElement | null
  if (t?.closest('input, textarea, select, [contenteditable="true"], [role="separator"], .pv')) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    move(e.key === 'ArrowDown' ? 1 : -1)
  } else if (e.key === 'Enter' && sel.value && !t?.closest('button, a')) {
    const r = flat.value.find((x) => x.result_id === sel.value)
    if (r) {
      e.preventDefault()
      accept(r, true)
    }
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

interface Stack { key: string; devs: DeviceRow[]; layers: LayerRow[] }
const stacks = computed<Stack[]>(() => {
  const m = new Map<string, Stack>()
  for (const d of devices.value) {
    const layers = layersOf(pid.value, d.device_id)
    const sig =
      layers.map((l) => [l.layer_function, l.layer_material, l.layer_thickness, l.thickness_unit, l.deposition_method, l.annealing_temperature, l.annealing_time, l.atmosphere].join('|')).join('§') +
      '#' + [d.device_type, d.architecture, d.substrate_type, d.active_area, d.area_definition, d.encapsulation].join('|')
    const s = m.get(sig)
    if (s) s.devs.push(d)
    else m.set(sig, { key: d.device_id, devs: [d], layers })
  }
  return [...m.values()]
})
const SUBSTRATE_RU: Record<string, string> = { rigid: 'жёсткая подложка', flexible: 'гибкая подложка' }
const AREA_RU: Record<string, string> = { 'designated illumination': 'освещаемая', aperture: 'по апертуре', total: 'полная' }
const stackMeta = (d: DeviceRow) =>
  [
    TYPE_RU[d.device_type],
    d.architecture && ruTerm(d.architecture),
    SUBSTRATE_RU[d.substrate_type],
    d.active_area && `площадь ${num(d.active_area, 4)} ${unitRu(d.area_unit || 'cm2')}${AREA_RU[d.area_definition] ? ' (' + AREA_RU[d.area_definition] + ')' : ''}`,
    d.encapsulation && 'герметизация: ' + d.encapsulation,
  ].filter(Boolean).join(' · ')
const layerSub = (l: LayerRow) =>
  [
    l.deposition_method,
    (l.annealing_temperature || l.annealing_time) && 'отжиг ' + [l.annealing_temperature, l.annealing_time].filter(Boolean).join(', '),
    l.atmosphere,
  ].filter(Boolean).join(' · ')
const thick = (l: LayerRow) => (l.layer_thickness ? `${l.layer_thickness.replace('.', ',')} ${unitRu(l.thickness_unit || 'nm')}` : '')
const resultsOfDevice = (id: string) => results.value.filter((r) => r.device_id === id).length
function toDevice(id: string) {
  tab.value = 'val'
  if (folded.value.has(id)) toggleGroup(id)
  void nextTick(() => scrollBox.value?.querySelector<HTMLElement>(`[data-g="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' }))
}

const MEAS_RU: Record<string, string> = { 'J-V': 'ВАХ', 'MPP tracking': 'Слежение за точкой максимальной мощности', EQE: 'Внешний квантовый выход (EQE)', stability: 'Стабильность' }
const yesNo = (v: string) => (v === 'true' ? 'да' : v === 'false' ? 'нет' : v)
const measRows = computed(() =>
  measurements.value.map((m) => ({
    id: m.measurement_id,
    title: MEAS_RU[m.measurement_type] ?? m.measurement_type ?? m.measurement_id,
    devs: m.device_id.split(';').map((s) => s.trim()).filter(Boolean).map(devName).join(', '),
    kv: [
      [labelOfField('spectrum'), m.spectrum],
      [labelOfField('light_intensity'), m.light_intensity && `${num(m.light_intensity)} ${unitRu(m.intensity_unit)}`.trim()],
      [labelOfField('scan_direction'), SCAN_RU[m.scan_direction] ?? m.scan_direction],
      [labelOfField('scan_rate'), m.scan_rate],
      [labelOfField('mask_used'), m.mask_used && yesNo(m.mask_used)],
      [labelOfField('certified'), m.certified && [yesNo(m.certified), m.certification_lab].filter(Boolean).join(', ')],
      [labelOfField('temperature'), m.temperature],
      ['Стабильность', [m.stability_protocol, m.stress_conditions].filter(Boolean).join(' · ')],
    ].filter((x): x is [string, string] => !!x[1]),
    note: m.note,
  })),
)

const BG_RU: Record<string, string> = { Tauc: 'по Тауцу', EQE: 'по EQE', PL: 'по ФЛ', cited: 'из литературы' }
const DIM_RU: Record<string, string> = { '3D': '3D', '2D': '2D', '2D-3D': '2D/3D' }
const matRows = computed(() =>
  materials.value.map((m) => ({
    id: m.material_id,
    title: m.formula_normalized || m.material_name_raw || m.material_id,
    kv: [
      [labelOfField('material_name_raw'), m.material_name_raw !== m.formula_normalized ? m.material_name_raw : ''],
      [labelOfField('material_class'), CLASS_RU[m.material_class] ?? m.material_class],
      [labelOfField('dimensionality'), DIM_RU[m.dimensionality] ?? m.dimensionality],
      [labelOfField('additives'), m.additives],
      [labelOfField('bandgap_value'), m.bandgap_value && `${num(m.bandgap_value)} ${unitRu(m.bandgap_unit || 'eV')}${BG_RU[m.bandgap_method] ? ' · ' + BG_RU[m.bandgap_method] : ''}`],
      ['Приборы', devices.value.filter((d) => d.absorber_material_id === m.material_id).map((d) => devName(d.device_id)).join(', ')],
    ].filter((x): x is [string, string] => !!x[1]),
    note: m.note,
  })),
)
const devEmpty = computed(() => !stacks.value.length && !measRows.value.length && !matRows.value.length)

const tone = (f: string) => (f === 'absorber' ? 'abs' : f.includes('contact') ? 'ct' : f === 'ETL' || f === 'HTL' ? 'tr' : 'etc')
</script>

<template>
  <div class="pp" :class="{ 'pp--m': mobile, 'is-compact': mobile && compact }">
    <header class="pp__head">
      <BackChip v-if="!mobile" :fallback="backTo" class="pp__back" />
      <div class="pp__ttl">
        <h1 v-if="paperLoading" class="pp__h1" aria-busy="true"><UiSkeleton width="70%" height="1em" /></h1>
        <h1 v-else-if="!mobile" class="pp__h1" :data-tip="longTitle">{{ pub?.title || pid }}</h1>
        <h1 v-else class="pp__h1" :class="{ 'is-open': titleOpen }">
          <button type="button" class="pp__h1b" :aria-expanded="titleOpen" @click="titleOpen = !titleOpen"><span class="pp__h1t">{{ pub?.title || pid }}</span></button>
        </h1>
        <p v-if="pub" class="pp__meta">
          <span class="pp__code num">{{ pid }}</span>
          <span v-if="authors" class="pp__au">{{ authors }}</span>
          <span v-if="pub?.year" class="num">{{ pub.year }}</span>
          <a v-if="pub?.DOI" class="link link--muted pp__doi" :href="'https://doi.org/' + pub.DOI" target="_blank" rel="noopener noreferrer">
            DOI {{ pub.DOI }}<Icon name="arrow-up-right" :size="14" />
          </a>
          <RouterLink v-if="paperRun" class="link pp__rows" :to="{ path: '/facts', query: { run: paperRun, tab: 'results', paper: pid } }" data-tip="Откроется набор для сдачи, отфильтрованный по этой статье">Строки этой статьи в наборе</RouterLink>
        </p>
      </div>
    </header>

    <div v-if="mobile" class="pp__sw">
      <div class="seg seg--full" role="tablist" aria-label="Что показать">
        <button type="button" role="tab" :aria-selected="view === 'pdf'" :class="{ on: view === 'pdf' }" @click="view = 'pdf'">PDF</button>
        <button type="button" role="tab" :aria-selected="view === 'data'" :class="{ on: view === 'data' }" @click="view = 'data'">Данные</button>
      </div>
    </div>

    <div class="pp__body" @scroll.capture.passive="onBodyScroll">
      <UiSplit id="paper-v2" dir="row" sized="end" :initial="540" :min="400" :max="820" :disabled="mobile" label="Данные">
        <template #start>
          <div class="pp__pdf" :class="{ 'is-hidden': mobile && view !== 'pdf' }">
            <PdfViewer :src="src" :page="pdfPage" :fragment="pdfFrag" :value="pdfVal" :table="pdfTab" :label="pdfLabel" :nonce="nonce" :scan="scan" />
            <button v-if="mobile && (sel || selIssue || ragSel)" type="button" class="btn btn--dark pp__toData" @click="view = 'data'">
              <Icon name="arrow-right" :size="16" />К данным
            </button>
          </div>
        </template>

        <template #end>
          <section class="pp__panel" :class="{ 'is-hidden': mobile && view !== 'data' }" aria-label="Данные статьи" data-toast-zone>
          <UiLoad :loading="paperLoading" class="pp__ld">
            <template #skeleton><div class="pp__pad pp__sk"><UiSkeleton variant="block" height="32px" /><UiSkeleton variant="row" :lines="6" /></div></template>
            <div v-if="paperError" class="pp__pad">
              <UiEmpty icon="info" title="Не удалось загрузить статью" text="Проверьте соединение и повторите." action="Повторить" compact @action="retryPaper" />
            </div>
            <div v-else-if="outOfScope" class="pp__pad">
              <UiEmpty icon="info" title="Статья не по теме" :text="pub?.exclusion_reason || 'Значения из неё не собираются.'" compact />
            </div>
            <div v-else-if="!known" class="pp__pad">
              <UiEmpty icon="table" :title="NODATA_TEXT" text="PDF можно читать и сейчас." compact />
            </div>

            <template v-else-if="isRag">
              <p v-if="scan" class="pp__scan" role="note"><Icon name="info" :size="16" />Скан без текстового слоя — значения распознаны OCR, место в тексте не подсвечивается: открывается нужная страница</p>
              <RagPaper :pid="pid" :mobile="mobile" @show="onRagShow" />
            </template>

            <template v-else>
              <div class="pp__tabs">
                <div class="seg" :class="{ 'seg--full': mobile }" role="tablist" aria-label="Данные статьи">
                  <button
                    v-for="t in tabs" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" :class="{ on: tab === t.id }"
                    :data-tip="t.tip || undefined" @click="tab = t.id"
                  >
                    {{ t.label }}<span v-if="t.n" class="seg__n num">{{ t.n }}</span>
                  </button>
                </div>
              </div>

              <div ref="scrollBox" class="pp__scroll">
                <div v-if="tab === 'val'" class="res">
                  <section v-for="g in groups" :key="g.key" class="grp" :data-g="g.key">
                    <button type="button" class="grp__h" :aria-expanded="!folded.has(g.key)" @click="toggleGroup(g.key)">
                      <Icon name="chevron-down" :size="14" class="grp__chev" :class="{ 'is-folded': folded.has(g.key) }" />
                      <span class="grp__t">{{ g.title }}</span>
                      <span v-if="g.dev" class="grp__m" :data-tip="devMeta(g.dev)">{{ devMeta(g.dev) }}</span>
                      <span class="grp__n num">{{ g.rows.length }}</span>
                    </button>
                    <div v-if="!folded.has(g.key)" class="grp__rows">
                      <div
                        v-for="r in g.rows" :key="r.result_id" class="rr" :aria-current="sel === r.result_id || undefined"
                        :class="{ 'is-sel': sel === r.result_id, 'is-rejected': reviewed(r).status === 'rejected' }"
                        @click="pickResult(r, { toPdf: false })"
                      >
                        <div class="rr__top">
                          <span class="rr__m">{{ metricLabel(r.metric_name) }}</span>
                          <span v-if="issueTip(r)" class="dot dot--warn" :data-tip="issueTip(r)" role="img" aria-label="Есть замечание" />
                          <span v-if="g.key === '_other' && r.device_id" class="rr__dev">{{ devName(r.device_id) }}</span>
                          <span class="rr__v num">
                            <span v-if="markOf(r)" class="mark" :class="markClass(markOf(r)!)" :data-tip="inherited(r) ? 'Правка основного значения перенесена на повтор' : markOf(r)!.tip">{{ markOf(r)!.text }}</span>
                            <span :class="valueClass(r)">{{ fmtValue(r) }}</span>
                          </span>
                        </div>
                        <div class="rr__sub">
                          <span v-if="r.aggregation" class="chip chip--sm chip--soft">{{ AGG_RU[r.aggregation] ?? r.aggregation }}</span>
                          <span v-if="r.spread_value" class="chip chip--sm chip--soft num" data-tip="Разброс">±{{ num(r.spread_value) }}</span>
                          <span v-if="r.n_devices" class="chip chip--sm chip--soft num" data-tip="Число приборов">n = {{ r.n_devices }}</span>
                          <span v-if="r.time_point" class="chip chip--sm chip--soft num" data-tip="Момент времени">{{ num(r.time_point) }} {{ unitRu(r.time_unit) }}</span>
                          <span v-if="r.result_origin === 'cited'" class="chip chip--sm chip--soft" :data-tip="r.cited_publication_id ? 'Ссылка в статье: ' + r.cited_publication_id : undefined">из другой работы</span>
                          <button v-if="r.duplicate_of" type="button" class="chip chip--sm chip--link" data-tip="Открыть основное значение" @click.stop="openRecord(r.duplicate_of)">{{ dupLabel(r) }}</button>
                          <span v-if="inherited(r)" class="rr__inh">{{ INHERITED_TEXT }}</span>
                          <span v-if="r.extraction_status && r.extraction_status !== 'extracted'" class="chip chip--sm chip--soft">{{ STATUS_RU[r.extraction_status] ?? r.extraction_status }}</span>
                          <span v-if="resultMeta(pid, r.result_id)?.quote_found === false" class="chip chip--sm chip--soft" data-tip="Цитата не нашлась на странице PDF — проверьте значение по месту в статье">цитата не найдена</span>
                          <span v-if="rawDiffers(r)" class="rr__raw">в статье: <span class="num">{{ fmtRaw(r) }}</span></span>
                          <span class="rr__place">{{ placeOf(r) }}</span>
                          <span class="rowid rr__ids">results · {{ r.result_id }}<template v-if="r.device_id"> · {{ r.device_id }}</template><template v-if="r.measurement_id"> · {{ r.measurement_id }}</template></span>
                        </div>

                        <div v-if="sel === r.result_id" class="rr__act" @click.stop>
                          <form v-if="editing === r.result_id" class="rr__edit" @submit.prevent="saveEdit(r)">
                            <input :ref="setEditInput" v-model="editVal" class="rr__in num" inputmode="decimal" aria-label="Новое значение" @keydown.esc.prevent="editing = null" />
                            <span class="rr__unit">{{ unitRu(r.normalized_unit) }}</span>
                            <button type="submit" class="btn btn--dark btn--sm">Сохранить</button>
                            <button type="button" class="btn btn--ghost btn--sm" @click="editing = null">Отмена</button>
                            <p v-if="editCsvNote(editVal, r.normalized_value)" class="csvnote">{{ editCsvNote(editVal, r.normalized_value) }}</p>
                          </form>
                          <template v-else>
                            <button v-if="mobile && (r.source_page || r.source_fragment)" type="button" class="btn btn--soft btn--sm rr__pdf" @click="view = 'pdf'">
                              <Icon name="eye" :size="16" />Показать в PDF
                            </button>
                            <button type="button" class="btn btn--sm" :class="reviewed(r).status === 'accepted' && reviewed(r).corrected == null ? 'btn--dark' : 'btn--soft'" :disabled="isApi" :data-tip="isApi ? DEV_TEXT : undefined" @click="accept(r)">
                              <Icon name="check" :size="16" />Принять<kbd v-if="!mobile">Enter</kbd>
                            </button>
                            <button type="button" class="btn btn--soft btn--sm" :disabled="isApi" :data-tip="isApi ? DEV_TEXT : undefined" @click="startEdit(r)"><Icon name="edit" :size="16" />Исправить</button>
                            <button type="button" class="btn btn--sm" :class="reviewed(r).status === 'rejected' ? 'btn--dark' : 'btn--ghost'" :disabled="isApi" :data-tip="isApi ? DEV_TEXT : undefined" @click="reject(r)"><Icon name="x" :size="16" />Отклонить</button>
                            <p v-if="reviewed(r).status === 'rejected'" class="csvnote">{{ REJECT_CSV_NOTE }}</p>
                            <p v-if="r.duplicate_of" class="rr__note">Правка меняет основное значение и все его повторы</p>
                          </template>
                        </div>
                      </div>
                    </div>
                  </section>
                  <UiEmpty v-if="!groups.length" icon="table" title="Значений нет" text="Показателей солнечного элемента в статье не нашлось." compact plain />
                </div>

                <div v-else-if="tab === 'dev'" class="secs">
                  <section v-if="stacks.length" class="sec">
                    <h2 class="sec__h">Устройство и слои<span class="srcnote">из devices.csv и layers.csv</span></h2>
                    <article v-for="s in stacks" :key="s.key" class="card dc">
                      <header class="dc__h">
                        <div class="dc__ttl">
                          <span v-for="d in s.devs" :key="d.device_id" class="dc__dev">
                            <b>{{ devName(d.device_id) }}</b><span class="rowid">devices · {{ d.device_id }}</span><span v-if="ROLE_RU[d.device_role]" class="chip chip--sm chip--soft">{{ ROLE_RU[d.device_role] }}</span>
                          </span>
                        </div>
                        <p class="dc__m">{{ stackMeta(s.devs[0]!) }}</p>
                      </header>
                      <ol v-if="s.layers.length" class="stk" role="list" aria-label="Слои сверху вниз">
                        <li v-for="l in [...s.layers].reverse()" :key="l.layer_id" class="ly" :class="'ly--' + tone(l.layer_function)">
                          <span class="ly__bar" />
                          <div class="ly__body">
                            <div class="ly__top">
                              <span class="ly__f">{{ LAYER_RU[l.layer_function] ?? l.layer_function }}</span>
                              <span v-if="thick(l)" class="ly__t num">{{ thick(l) }}</span>
                            </div>
                            <p class="ly__mat">{{ l.layer_material }}</p>
                            <p v-if="layerSub(l)" class="ly__sub">{{ layerSub(l) }}</p>
                          </div>
                        </li>
                        <li class="ly ly--sub"><span class="ly__bar" /><span class="ly__f">{{ SUBSTRATE_RU[s.devs[0]!.substrate_type] ?? 'Подложка' }}</span></li>
                      </ol>
                      <p v-else class="dc__none">Слои в статье не описаны</p>
                      <div class="dc__links">
                        <template v-for="d in s.devs" :key="d.device_id">
                          <button v-if="resultsOfDevice(d.device_id)" type="button" class="chip chip--sm chip--link" @click="toDevice(d.device_id)">
                            {{ s.devs.length > 1 ? devName(d.device_id) + ': ' : '' }}значения<span class="chip__n">{{ resultsOfDevice(d.device_id) }}</span>
                          </button>
                        </template>
                      </div>
                    </article>
                  </section>

                  <section v-if="measRows.length" class="sec">
                    <h2 class="sec__h">Условия измерения<span class="srcnote">из measurements.csv</span></h2>
                    <article v-for="m in measRows" :key="m.id" class="card dc">
                      <header class="dc__h">
                        <div class="dc__ttl"><b>{{ m.title }}</b><span class="rowid">measurements · {{ m.id }}</span></div>
                        <p v-if="m.devs" class="dc__m">{{ m.devs }}</p>
                      </header>
                      <dl v-if="m.kv.length" class="kv">
                        <template v-for="[k, v] in m.kv" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
                      </dl>
                      <p v-if="m.note" class="dc__note">{{ m.note }}</p>
                    </article>
                  </section>

                  <section v-if="matRows.length" class="sec">
                    <h2 class="sec__h">Материал<span class="srcnote">из materials.csv</span></h2>
                    <article v-for="m in matRows" :key="m.id" class="card dc">
                      <header class="dc__h"><div class="dc__ttl"><b>{{ m.title }}</b><span class="rowid">materials · {{ m.id }}</span></div></header>
                      <dl v-if="m.kv.length" class="kv">
                        <template v-for="[k, v] in m.kv" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
                      </dl>
                      <p v-if="m.note" class="dc__note">{{ m.note }}</p>
                    </article>
                  </section>

                  <UiEmpty v-if="devEmpty" icon="layers" title="Прибор не описан" text="В статье не нашлось слоёв, условий измерения и материала." compact plain />
                </div>

                <div v-else-if="tab === 'iss'" class="iss">
                  <ul v-if="issueList.length" class="iss__ul" role="list">
                    <li
                      v-for="i in issueList" :key="i.issue_id" class="card isc" :data-i="i.issue_id"
                      :class="{ 'is-sel': selIssue === i.issue_id, 'is-done': stOf(i) !== 'open' }"
                      @click="pickIssue(i)"
                    >
                      <div class="isc__top">
                        <span v-if="stOf(i) === 'open'" class="dot dot--warn" role="img" aria-label="Нужно проверить" />
                        <b class="isc__t">{{ checkLabel(i.check_name) }}</b>
                        <span v-if="stOf(i) !== 'open'" class="mark mark--ok"><Icon name="check" :size="14" />{{ ISSUE_STATE_RU[stOf(i)] }}</span>
                        <span v-if="i.source_page" class="isc__p num">стр. {{ i.source_page }}</span>
                      </div>
                      <p class="rowid isc__ids">issues · {{ i.issue_id }} · {{ i.check_name }}<template v-if="i.source_page"> · стр. {{ i.source_page }}</template></p>
                      <p class="isc__d">{{ issueText(i) }}</p>
                      <p v-if="stOf(i) === 'open'" class="isc__todo"><b>Что сделать.</b> {{ issueTodo(i) }}</p>
                      <div v-if="issueRecords(pid, i.issue_id).length" class="isc__recs">
                        <span class="isc__lbl">{{ issueRecords(pid, i.issue_id).length > 1 ? 'Значения' : 'Значение' }}</span>
                        <button
                          v-for="rec in issueRecords(pid, i.issue_id)" :key="rec.rid" type="button" class="chip chip--sm chip--link"
                          :class="{ 'is-rejected': rec.rejected }" :data-tip="rec.mark ? rec.text + ' · ' + rec.mark.text : rec.text"
                          @click.stop="openRecord(rec.rid)"
                        >
                          <span class="chip__t" :class="rec.row ? valueClass(rec.row) : 'val'">{{ rec.name }}</span><span class="rowid">{{ rec.rid }}</span>
                        </button>
                      </div>
                      <div class="isc__act" @click.stop>
                        <button v-if="hasPlace(i)" type="button" class="btn btn--soft btn--sm" @click="pickIssue(i, { toPdf: true })">
                          <Icon name="eye" :size="16" />Показать в PDF
                        </button>
                        <template v-if="stOf(i) === 'open'">
                          <button type="button" class="btn btn--ghost btn--sm" :disabled="isApi" :data-tip="isApi ? DEV_TEXT : 'Вы поправили число в статье или в данных — пометить замечание исправленным'" @click="resolve(i, 'fixed')">
                            <Icon name="check" :size="16" />Отметить исправленным
                          </button>
                          <button type="button" class="btn btn--ghost btn--sm" :disabled="isApi" :data-tip="isApi ? DEV_TEXT : 'Проверили: в статье всё верно, программа ошиблась — закрыть замечание'" @click="resolve(i, 'ok')">Это не ошибка</button>
                        </template>
                        <button v-else type="button" class="btn btn--ghost btn--sm" :disabled="isApi" :data-tip="isApi ? DEV_TEXT : undefined" @click="reopen(i)"><Icon name="undo" :size="16" />Открыть снова</button>
                      </div>
                    </li>
                  </ul>
                  <UiEmpty v-else icon="check" title="Замечаний нет" text="Проверки не нашли в статье ничего подозрительного." compact plain />
                </div>

                <div v-else class="links">
                  <UiEmpty v-if="isApi" icon="info" :title="DEV_TEXT" compact plain />
                  <component :is="CaseLinks" v-else-if="CaseLinks" :pid="pid" />
                </div>
              </div>
            </template>
          </UiLoad>
          </section>
        </template>
      </UiSplit>
    </div>
  </div>
</template>

<style scoped>
.pp { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg); }
.pp__head { flex: none; display: flex; align-items: flex-start; gap: var(--s3); padding: var(--s3) var(--s5) var(--s3) var(--s4); border-bottom: 1px solid var(--line); }
.pp__back { margin-top: var(--s1); }
.pp__ttl { min-width: 0; flex: 1; display: grid; gap: var(--s1); }
.pp__h1 {
  font-size: var(--fs-h1); font-weight: 600; line-height: 1.25; letter-spacing: var(--h1-ls);
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.pp__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--s3); font-size: var(--fs-sm); color: var(--muted); min-width: 0; }
.pp__code { font-weight: 600; color: var(--ink-2); }
.pp__au { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.pp__rows { font-size: var(--fs-sm); }
.rr__ids { flex-basis: 100%; }
.pp__doi { font-weight: 400; min-width: 0; overflow: hidden; text-overflow: ellipsis; }

.pp__body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.pp__pdf { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.pp__ld { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.pp__sk { display: grid; gap: var(--s3); }
.pp__panel { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--bg); }
.pp__pad { padding: var(--s4); }
.pp__scan { flex: none; display: flex; align-items: flex-start; gap: var(--s2); margin: var(--s3) var(--s4) 0; padding: var(--s2) var(--s3); border-radius: var(--r); background: var(--bg-2); color: var(--ink-2); font-size: var(--fs-sm); line-height: 1.4; }
.pp__scan :deep(.ico) { flex: none; margin-top: 2px; color: var(--amber); }
.is-hidden { display: none !important; }
.pp__body :deep(.spl__pane:has(> .is-hidden)) { display: none; }
.pp__tabs { flex: none; padding: var(--s3) var(--s4) var(--s2); }
.pp__scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 0 var(--s4) var(--s8); }
.grp { margin-top: var(--s2); }
.grp__h {
  position: sticky; top: 0; z-index: var(--z-sticky); width: 100%; display: flex; align-items: baseline; gap: var(--s2);
  min-height: 40px; padding: var(--s2) 0; background: var(--bg); font-size: var(--fs-sm); min-width: 0; text-align: left;
}
.grp__chev { align-self: center; color: var(--faint); transition: rotate var(--t) var(--ease); }
.grp__chev.is-folded { rotate: -90deg; }
.grp__t { font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }
.grp__m { flex: 1; min-width: 0; color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grp__n { margin-left: auto; font-size: var(--fs-xs); color: var(--faint); }
.grp__rows { display: grid; gap: 2px; }

.rr {
  display: grid; gap: var(--s1); padding: var(--s2) var(--s3); border-radius: var(--r); cursor: pointer;
  transition: background-color var(--t-fast) ease, box-shadow var(--t-fast) ease;
  scroll-margin-top: calc(40px + var(--s2)); scroll-margin-bottom: var(--s4);
}
@media (hover: hover) { .rr:hover { background: var(--bg-2); } }
.rr.is-sel { background: var(--card); box-shadow: 0 0 0 1px var(--line-2), var(--shadow); }
.rr__top { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
.rr__m { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.rr__dev { font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.rr__v { margin-left: auto; display: inline-flex; align-items: center; gap: var(--s2); font-weight: 600; white-space: nowrap; }
.rr.is-rejected .rr__m { color: var(--faint); }
.rr__sub { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1); font-size: var(--fs-xs); color: var(--muted); min-width: 0; }
.rr__raw { margin-left: var(--s1); }
.rr__inh { color: var(--ink-2); }
.rr__note { flex-basis: 100%; font-size: var(--fs-xs); color: var(--muted); }
.rr__place { margin-left: auto; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.rr__act { display: flex; flex-wrap: wrap; gap: var(--s1); padding-top: var(--s2); margin-top: var(--s1); border-top: 1px solid var(--line); cursor: default; }
.rr__act kbd { margin-left: var(--s1); background: transparent; }
.rr__act .btn--dark kbd { color: var(--on-solid); border-color: color-mix(in srgb, var(--on-solid) 30%, transparent); }
.rr__edit { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1); width: 100%; }
.rr__in { width: 120px; height: 32px; padding: 0 var(--s2); border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--card); }
.rr__in:focus-visible { outline: 2px solid var(--blue); border-color: transparent; }
.rr__unit { color: var(--muted); font-size: var(--fs-sm); margin-right: var(--s1); }
.secs { display: grid; gap: var(--s6); padding-top: var(--s2); }
.sec { display: grid; gap: var(--s3); min-width: 0; }
.sec__h { font-size: var(--fs-sm); font-weight: 600; color: var(--muted); }
.dc { padding: var(--s4); display: grid; gap: var(--s3); min-width: 0; }
.dc__h { display: grid; gap: 2px; min-width: 0; }
.dc__ttl { display: flex; flex-wrap: wrap; gap: var(--s1) var(--s3); align-items: center; min-width: 0; overflow-wrap: anywhere; font-size: var(--fs-body); }
.dc__ttl b { font-weight: 600; }
.dc__dev { display: inline-flex; align-items: center; gap: var(--s2); min-width: 0; }
.dc__m { font-size: var(--fs-sm); color: var(--muted); }
.dc__note { font-size: var(--fs-xs); color: var(--muted); line-height: 1.45; }
.dc__none { font-size: var(--fs-sm); color: var(--muted); }
.dc__links { display: flex; flex-wrap: wrap; gap: var(--s1); }
.dc__links:empty { display: none; }
.kv { display: grid; grid-template-columns: minmax(96px, auto) 1fr; gap: var(--s2) var(--s4); font-size: var(--fs-sm); }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.stk { list-style: none; padding: 0; display: grid; gap: 2px; }
.ly { display: flex; gap: var(--s3); min-width: 0; }
.ly__bar { flex: none; width: 6px; border-radius: var(--r-pill); background: color-mix(in srgb, var(--ink) 16%, transparent); }
.ly--ct .ly__bar { background: color-mix(in srgb, var(--ink) 55%, transparent); }
.ly--tr .ly__bar { background: color-mix(in srgb, var(--ink) 32%, transparent); }
.ly--abs .ly__bar { background: var(--blue); }
.ly--sub .ly__bar { height: 18px; background: repeating-linear-gradient(135deg, var(--line-2) 0 3px, transparent 3px 6px); }
.ly--sub .ly__f { font-size: var(--fs-xs); color: var(--faint); }
.ly__body { flex: 1; min-width: 0; padding: var(--s2) 0; border-bottom: 1px solid var(--line); }
.ly:nth-last-child(2) .ly__body { border-bottom: 0; }
.ly__top { display: flex; align-items: baseline; gap: var(--s2); }
.ly__f { font-size: var(--fs-xs); color: var(--muted); }
.ly__t { margin-left: auto; font-size: var(--fs-sm); font-weight: 500; white-space: nowrap; }
.ly__mat { font-weight: 500; overflow-wrap: anywhere; }
.ly__sub { font-size: var(--fs-xs); color: var(--muted); overflow-wrap: anywhere; }
.links { padding-top: var(--s2); min-width: 0; }
.iss { padding-top: var(--s2); }
.iss__ul { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s3); }
.isc {
  display: grid; gap: var(--s2); padding: var(--s4); min-width: 0; cursor: pointer; scroll-margin-top: var(--s3);
  transition: background-color var(--t-fast) ease, box-shadow var(--t-fast) ease;
}
.isc.is-sel { box-shadow: inset 0 0 0 1px var(--line-2), var(--shadow); }
.isc.is-done .isc__d, .isc.is-done .isc__t { color: var(--muted); }
.isc__top { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
.isc__t { font-weight: 600; min-width: 0; }
.isc__p { margin-left: auto; font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; }
.isc__d { font-size: var(--fs-sm); line-height: 1.5; color: var(--ink-2); overflow-wrap: anywhere; }
.isc__todo { font-size: var(--fs-sm); line-height: 1.5; color: var(--muted); }
.isc__todo b { font-weight: 600; color: var(--ink-2); }
.isc__recs { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1); min-width: 0; }
.isc__lbl { font-size: var(--fs-xs); color: var(--muted); margin-right: var(--s1); }
.isc__act { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--s1); padding-top: var(--s1); cursor: default; }
.isc__act .btn { width: 100%; justify-content: center; }
.isc__act .btn:first-child { grid-column: 1 / -1; }
.pp__sw { flex: none; padding: 0 var(--s4) var(--s2); border-bottom: 1px solid var(--line); }
.pp__toData {
  flex: none; align-self: stretch; height: 40px; margin: var(--s1) var(--s4) calc(var(--s1) + var(--safe-b)); border-radius: var(--r-pill);
}
.pp__toData :deep(.ico) { rotate: 180deg; }
.pp--m .pp__head { padding: 0 var(--s4) var(--s1); border-bottom: 0; }
.pp--m .pp__ttl { gap: 2px; }
.pp--m .pp__h1 { display: block; overflow: visible; -webkit-line-clamp: unset; line-clamp: none; }
.pp__h1b { display: flex; align-items: center; width: 100%; min-height: 44px; text-align: left; font: inherit; letter-spacing: inherit; color: inherit; }
.pp__h1t { display: -webkit-box; -webkit-line-clamp: 1; line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.pp__h1.is-open .pp__h1t { -webkit-line-clamp: 3; line-clamp: 3; }
.pp--m .pp__meta { flex-wrap: nowrap; overflow: hidden; white-space: nowrap; font-size: var(--fs-xs); }
.pp--m.is-compact .pp__meta { display: none; }
.pp--m.is-compact .pp__h1 { font-size: var(--fs-h2); }
.pp--m.is-compact .pp__h1b { min-height: 40px; }
.pp--m .pp__sw { padding-bottom: var(--s1); }
.pp--m .rr__pdf { flex-basis: 100%; }
.pp--m .pp__au { display: none; }
.pp--m .pp__tabs { padding: var(--s2) var(--s4); }
.pp--m .pp__tabs .seg > button { flex: 1 1 auto; padding: 0 var(--s2); }
.pp--m .pp__body :deep(.spl__pane) { flex: 1 1 0; }
.pp--m .rr { padding: var(--s3); }
.pp--m .rr__act .btn { flex: 1 1 auto; }
.pp--m .isc__act { display: grid; grid-template-columns: 1fr 1fr; }
.pp--m .isc__act > .btn:only-child, .pp--m .isc__act > .btn:first-child:nth-last-child(odd) { grid-column: 1 / -1; }
</style>
