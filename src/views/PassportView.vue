<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DataPage from '../components/DataPage.vue'
import Icon from '../components/Icon.vue'
import UiEmpty from '../components/UiEmpty.vue'
import PassportArea from './PassportArea.vue'
import { DOMAIN_RU } from '../case'
import { download } from '../exporters'
import { domainFromJSON, passportJSON, passportMD, passportMDOf, type PassportJSON } from '../passport'
import { dataDomain, dataRun, ensureDataRun } from '../dataTabs'
import { runOf } from '../case/runs'
import { toast } from '../store'
import { DEV_TEXT, isApi } from '../config'

if (isApi) ensureDataRun()
const areas = computed<('solar' | 'rag')[]>(() => (dataRun.value && runOf(dataRun.value) ? [dataDomain.value] : ['solar', 'rag']))

const server = ref<PassportJSON | null>(null)
const state = ref<'idle' | 'loading' | 'ready' | 'dev'>(isApi ? 'loading' : 'idle')
let seq = 0
watch(dataRun, async (run) => {
  if (!isApi) return
  const my = ++seq
  server.value = null
  if (!run) { state.value = 'dev'; return }
  state.value = 'loading'
  try {
    const { get } = await import('../api/client')
    const p = await get<PassportJSON>(`/runs/${encodeURIComponent(run)}/passport.json`, undefined, { silent: true })
    if (my !== seq) return
    server.value = p
    state.value = p?.domains?.length ? 'ready' : 'dev'
  } catch {
    if (my === seq) state.value = 'dev'
  }
}, { immediate: true })
const serverDomains = computed(() => (server.value?.domains ?? []).map(domainFromJSON))
const versions = computed(() => {
  const v = server.value?.versions
  if (!v) return ''
  const RU: Record<string, string> = { model: 'модель', rules: 'правила', dictionary: 'словарь' }
  return Object.entries(v).filter(([, x]) => x).map(([k, x]) => `${RU[k] ?? k} ${x}`).join(' · ')
})

function save(kind: 'json' | 'md') {
  if (isApi) {
    if (!server.value) return
    const tag = dataRun.value || 'run'
    if (kind === 'json') download(`passport-${tag}.json`, JSON.stringify(server.value, null, 2), 'application/json')
    else download(`PASSPORT-${tag}.md`, passportMDOf(serverDomains.value), 'text/markdown')
  } else {
    const ids = areas.value
    const tag = ids.length > 1 ? 'all' : ids[0]
    if (kind === 'json') download(`faktura-passport-${tag}.json`, JSON.stringify(passportJSON(ids), null, 2), 'application/json')
    else download(`faktura-passport-${tag}.md`, passportMD(ids), 'text/markdown')
  }
  toast(`Скачан паспорт (${kind === 'json' ? 'JSON' : 'Markdown'})`)
}
</script>

<template>
  <DataPage :no-run="!isApi" :loading="state === 'loading'" title="Паспорт набора данных" sub="Поля, типы, единицы, правила проверки и критерии — сдаётся вместе с 7 таблицами">
    <template v-if="!isApi || state === 'ready'" #actions>
      <button type="button" class="btn btn--soft" aria-label="Скачать паспорт в JSON" data-tip="Скачать паспорт в JSON" @click="save('json')"><Icon name="code" :size="16" />JSON</button>
      <button type="button" class="btn btn--dark" @click="save('md')"><Icon name="export" :size="16" />Скачать<span class="md"> · Markdown</span></button>
    </template>

    <template v-if="isApi">
      <UiEmpty v-if="state === 'dev'" icon="info" :title="DEV_TEXT" text="Паспорт набора придёт с сервера — тот же, что лежит в архиве для сдачи" />
      <template v-else-if="state === 'ready'">
        <p v-if="versions" class="ver">Собран с версиями: {{ versions }}</p>
        <section v-for="d in serverDomains" :key="d.id" class="area">
          <h2 v-if="serverDomains.length > 1" class="area__h">{{ d.name }}</h2>
          <PassportArea :area="d.id" :data="d" />
        </section>
      </template>
    </template>
    <template v-else>
      <section v-for="a in areas" :key="a" class="area">
        <h2 v-if="areas.length > 1" class="area__h">{{ DOMAIN_RU[a] }}</h2>
        <PassportArea :area="a" />
      </section>
    </template>
  </DataPage>
</template>

<style scoped>
.area + .area { margin-top: var(--s8); }
.ver { margin-bottom: var(--s4); font-size: var(--fs-sm); color: var(--muted); }
.area__h { margin-bottom: var(--s3); font-size: var(--fs-h2); font-weight: 600; }
@media (max-width: 768px) { .md { display: none; } }
</style>
