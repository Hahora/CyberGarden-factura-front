<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataPage from '../components/DataPage.vue'
import RagCompare from '../components/RagCompare.vue'
import UiEmpty from '../components/UiEmpty.vue'
import UiSelect, { type Option } from '../components/UiSelect.vue'
import {
  AGG_RU, CLASS_RU, SCAN_RU, TYPE_RU, bestIndex, bestOf, bestRowOf, fmtValue, inScope, markClass, material, measurement, metricLabel, num, placeOf, publication, resultsOf, reviewMark, valueOf,
  type BestRow, type DeviceRow, type MaterialRow, type MeasurementRow, type ResultRow,
} from '../case'
import { dataDomain, dataPids, useDataReady } from '../dataTabs'
import { plural } from '../search'
import { state } from '../store'

const route = useRoute()
const router = useRouter()
const MAX = 4
const METRICS_SHOWN = ['PCE', 'Voc', 'Jsc', 'FF', 'Rs', 'Rsh'] as const

interface Col {
  pid: string
  title: string
  row: BestRow
  dev?: DeviceRow
  mea?: MeasurementRow
  mat?: MaterialRow
  pce?: ResultRow
}
function colOf(pid: string): Col {
  const row = bestRowOf(pid, METRICS_SHOWN)
  const pce = row.pce
  const dev = row.device
  return {
    pid, row, dev, pce, title: publication(pid)?.title ?? '',
    mea: pce ? measurement(pid, pce.measurement_id) : undefined,
    mat: dev ? material(pid, dev.absorber_material_id) : undefined,
  }
}

const isRag = computed(() => dataDomain.value === 'rag')
const ready = useDataReady(dataPids)
const pool = computed(() => (isRag.value ? [] : dataPids.value.filter((p) => inScope(p) && resultsOf(p).length)))
const ranked = computed(() => {
  const top = (p: string) => {
    const r = bestOf(p, 'PCE')
    return r ? (valueOf(r) ?? -1) : -1
  }
  return [...pool.value].sort((a, b) => top(b) - top(a))
})
const pids = computed<string[]>(() => {
  const q = route.query.pids ?? route.query.ids
  const raw = typeof q === 'string' ? q.split(',') : []
  const valid = new Set([...new Set(raw)].filter((p) => pool.value.includes(p)).slice(0, MAX))
  const pick = valid.size >= 2 ? valid : new Set(ranked.value.slice(0, 2))
  return pool.value.filter((p) => pick.has(p))
})
function setPids(v: string | string[]) {
  const list = (Array.isArray(v) ? v : [v]).slice(0, MAX)
  void router.replace({ query: { ...route.query, pids: list.join(',') } })
}
const options = computed<Option[]>(() =>
  pool.value.map((p) => ({ value: p, label: `${p} · ${publication(p)?.title ?? ''}`, disabled: pids.value.length >= MAX && !pids.value.includes(p) })),
)
const cols = computed(() => pids.value.map(colOf))
const papersN = (n: number) => `${n} ${plural(n, ['статья', 'статьи', 'статей'])}`

const bestIdx = computed(() => {
  const out: Record<string, number> = {}
  for (const m of METRICS_SHOWN) out[m] = bestIndex(cols.value.map((c) => (c.row.cells[m] ? valueOf(c.row.cells[m]!) : null)), m)
  return out
})

const toMw = (m?: MeasurementRow) => {
  if (!m || !m.light_intensity) return null
  const v = parseFloat(m.light_intensity)
  if (!Number.isFinite(v)) return null
  return /W\/m2/i.test(m.intensity_unit) && !/mW/i.test(m.intensity_unit) ? v / 10 : v
}
const isStandard = (m?: MeasurementRow) => !!m && /AM\s?1\.5G/i.test(m.spectrum) && !/non-standard|LED/i.test(m.spectrum) && (toMw(m) === null || toMw(m) === 100)
const areaCm2 = (d?: DeviceRow) => {
  if (!d || !d.active_area) return null
  const v = parseFloat(d.active_area)
  if (!Number.isFinite(v)) return null
  return d.area_unit === 'mm2' ? v / 100 : d.area_unit === 'm2' ? v * 1e4 : v
}
const UNIT_I: Record<string, string> = { 'W/m2': 'Вт/м²', 'mW/cm2': 'мВт/см²' }
const lightText = (m?: MeasurementRow) => {
  if (!m) return '—'
  const i = m.light_intensity ? `${num(m.light_intensity)} ${UNIT_I[m.intensity_unit] ?? m.intensity_unit}` : ''
  return [m.spectrum, i].filter(Boolean).join(', ') || 'не указано'
}
const areaText = (d?: DeviceRow) => (d?.active_area ? `${num(d.active_area, 4)} ${d.area_unit === 'cm2' ? 'см²' : d.area_unit}` : '—')

const reasons = computed(() => {
  const out: string[] = []
  const cs = cols.value
  if (cs.length < 2) return out
  const distinct = (get: (c: Col) => string | undefined) => new Set(cs.map(get).filter((v): v is string => !!v))
  if (distinct((c) => c.mat?.material_class).size > 1) out.push('Разный класс материала: ' + cs.map((c) => `${c.pid} — ${CLASS_RU[c.mat?.material_class ?? ''] ?? '—'}`).join(', '))
  if (distinct((c) => c.dev?.device_type).size > 1) out.push('Разный тип прибора: ' + cs.map((c) => `${c.pid} — ${TYPE_RU[c.dev?.device_type ?? ''] ?? '—'}`).join(', '))
  for (const c of cs) if (c.mea && !isStandard(c.mea)) out.push(`${c.pid}: свет не AM1.5G 100 мВт/см² (${lightText(c.mea)})`)
  const areas = cs.map((c) => areaCm2(c.dev)).filter((a): a is number => a != null && a > 0)
  if (areas.length > 1 && Math.max(...areas) / Math.min(...areas) > 5) out.push('Площадь прибора отличается более чем в 5 раз: ' + cs.map((c) => `${c.pid} — ${areaText(c.dev)}`).join(', '))
  if (distinct((c) => c.pce?.aggregation || 'none').size > 1) out.push('КПД разного типа (лучший или средний): ' + cs.map((c) => `${c.pid} — ${AGG_RU[c.pce?.aggregation ?? ''] ?? 'не указано'}`).join(', '))
  if (distinct((c) => c.mea?.scan_direction).size > 1) out.push('Разное направление измерения ВАХ: ' + cs.map((c) => `${c.pid} — ${SCAN_RU[c.mea?.scan_direction ?? ''] ?? 'не указано'}`).join(', '))
  return out
})

const COND_ROWS: { label: string; get: (c: Col) => string }[] = [
  { label: 'Материал', get: (c) => [CLASS_RU[c.mat?.material_class ?? ''], c.mat?.formula_normalized].filter(Boolean).join(' · ') || '—' },
  { label: 'Тип прибора', get: (c) => TYPE_RU[c.dev?.device_type ?? ''] ?? '—' },
  { label: 'Площадь', get: (c) => areaText(c.dev) },
  { label: 'Свет', get: (c) => lightText(c.mea) },
  { label: 'Направление ВАХ', get: (c) => SCAN_RU[c.mea?.scan_direction ?? ''] ?? '—' },
  { label: 'Тип значения КПД', get: (c) => (c.pce ? (AGG_RU[c.pce.aggregation] ?? 'не указано') : '—') },
]
const place = (r?: ResultRow) => (r ? placeOf(r) : '')
const link = (r?: ResultRow) => (r ? { path: '/paper/' + r.publication_id, query: { r: r.result_id } } : undefined)
const short = (t: string) => (t.length > 70 ? t.slice(0, 68) + '…' : t)
const fixed = (c: Col, m: string) => {
  const r = c.row.cells[m]
  const mk = r ? reviewMark(c.pid, r.result_id) : null
  return mk?.kind === 'fixed' ? mk : null
}
</script>

<template>
  <RagCompare v-if="isRag" />
  <DataPage v-else title="Сравнение" :loading="!ready" :flow="state.mobile">
    <template #toolbar>
      <UiSelect :model-value="pids" :options="options" label="Статьи для сравнения" placeholder="Выберите статьи" multiple searchable variant="chip" :size="state.mobile ? 'md' : 'sm'" :min-width="380" :summary="papersN" @update:model-value="setPids" />
    </template>

    <UiEmpty v-if="pool.length < 2" icon="columns" title="Нечего сравнивать" text="Нужны хотя бы две разобранные статьи." />
    <div v-else class="cmp">
      <section v-if="reasons.length" class="cmp__warn" aria-label="Сравнивать напрямую некорректно">
        <h2>Сравнивать напрямую некорректно</h2>
        <ul><li v-for="r in reasons" :key="r">{{ r }}</li></ul>
      </section>

      <div v-if="!state.mobile" class="cmp__w card">
        <table class="tbl tbl--sm cmp__t">
          <thead>
            <tr>
              <th />
              <th v-for="c in cols" :key="c.pid">
                <RouterLink :to="'/paper/' + c.pid" class="th"><b class="num">{{ c.pid }}</b><span>{{ short(c.title) }}</span><small v-if="c.row.deviceName">Прибор: {{ c.row.deviceName }}</small></RouterLink>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in METRICS_SHOWN" :key="m">
              <th scope="row">{{ metricLabel(m) }}</th>
              <td v-for="(c, i) in cols" :key="c.pid">
                <template v-if="c.row.cells[m]">
                  <RouterLink :to="link(c.row.cells[m])!" class="v num" :class="{ best: bestIdx[m] === i }">{{ fmtValue(c.row.cells[m]!) }}</RouterLink>
                  <span v-if="fixed(c, m)" class="mark" :class="markClass(fixed(c, m)!)" :data-tip="fixed(c, m)!.tip">{{ fixed(c, m)!.text }}</span>
                  <small v-if="place(c.row.cells[m])" class="pl num">{{ place(c.row.cells[m]) }}</small>
                </template>
                <span v-else class="muted">—</span>
              </td>
            </tr>
            <tr class="sep"><th :colspan="cols.length + 1">Условия</th></tr>
            <tr v-for="row in COND_ROWS" :key="row.label">
              <th scope="row">{{ row.label }}</th>
              <td v-for="c in cols" :key="c.pid" class="cond">{{ row.get(c) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="cmp__cards">
        <article v-for="(c, i) in cols" :key="c.pid" class="pc card">
          <RouterLink :to="'/paper/' + c.pid" class="th"><b class="num">{{ c.pid }}</b><span>{{ short(c.title) }}</span><small v-if="c.row.deviceName">Прибор: {{ c.row.deviceName }}</small></RouterLink>
          <dl class="pc__m">
            <template v-for="m in METRICS_SHOWN" :key="m">
              <dt>{{ metricLabel(m) }}</dt>
              <dd>
                <template v-if="c.row.cells[m]">
                  <RouterLink :to="link(c.row.cells[m])!" class="v num" :class="{ best: bestIdx[m] === i }">{{ fmtValue(c.row.cells[m]!) }}</RouterLink>
                  <span v-if="fixed(c, m)" class="mark" :class="markClass(fixed(c, m)!)">{{ fixed(c, m)!.text }}</span>
                  <small v-if="place(c.row.cells[m])" class="pl num">{{ place(c.row.cells[m]) }}</small>
                </template>
                <span v-else class="muted">—</span>
              </dd>
            </template>
          </dl>
          <dl class="pc__c">
            <template v-for="row in COND_ROWS" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.get(c) }}</dd></template>
          </dl>
        </article>
      </div>
    </div>
  </DataPage>
</template>

<style scoped>
.cmp { display: grid; gap: var(--s4); min-width: 0; }
.cmp__warn { padding: var(--s4); border-radius: var(--r-lg); background: var(--amber-soft, var(--bg-2)); display: grid; gap: var(--s2); }
.cmp__warn h2 { font-size: var(--fs-body); font-weight: 600; color: var(--amber); }
.cmp__warn ul { margin: 0; padding-left: var(--s5); display: grid; gap: var(--s1); font-size: var(--fs-sm); color: var(--ink-2); }
.cmp__w { overflow-x: auto; }
.cmp__t { table-layout: fixed; min-width: 640px; font-size: var(--fs-sm); }
.cmp__t th:first-child { width: 11rem; }
.cmp__t thead th { height: auto; padding-top: var(--s3); padding-bottom: var(--s3); vertical-align: top; white-space: normal; font-size: inherit; }
.cmp__t tbody th { font-size: var(--fs-sm); font-weight: 500; }
.cmp__t tbody tr:last-child th { border-bottom: 0; }
.cmp__t td { overflow-wrap: anywhere; }
.cmp__t .cond { color: var(--ink-2); }
.cmp__t .sep th { padding-top: var(--s4); color: var(--ink); font-weight: 600; font-size: var(--fs-sm); }
.th { display: grid; gap: 2px; color: inherit; }
.th b { font-weight: 600; font-size: var(--fs-body); color: var(--ink); }
.th span { color: var(--ink-2); font-weight: 400; line-height: 1.3; }
.th small { color: var(--muted); font-size: var(--fs-xs); font-weight: 400; }
.th:hover b { text-decoration: underline; }
.v { color: var(--ink); font-size: var(--fs-body); font-weight: 500; }
.v:hover { text-decoration: underline; }
.v { position: relative; display: inline-block; margin-right: 1.15em; }
.v.best::after { position: absolute; left: 100%; top: 50%; translate: 0 -50%; margin-left: 0.25em; }
.mark { margin-left: var(--s2); }
.pl { display: block; font-size: var(--fs-xs); color: var(--muted); line-height: 1.3; }
@media (hover: hover) { .cmp__t tbody tr:hover > th { background: color-mix(in srgb, var(--ink) 3%, transparent); } }

.cmp__cards { display: grid; gap: var(--s3); }
.pc { display: grid; gap: var(--s3); padding: var(--s4); }
.pc dl { margin: 0; display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--s2) var(--s3); font-size: var(--fs-sm); }
.pc dt { color: var(--muted); }
.pc dd { margin: 0; overflow-wrap: anywhere; }
.pc__c { padding-top: var(--s3); border-top: 1px solid var(--line); }
.pc .v { display: inline-flex; align-items: center; min-height: 44px; margin-block: -12px; }
</style>
