<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import DictionaryPanel from '../components/DictionaryPanel.vue'
import KeysEditor from '../components/KeysEditor.vue'
import SetGroup from '../components/SetGroup.vue'
import SetRow from '../components/SetRow.vue'
import SettingsProfile from '../components/SettingsProfile.vue'
import { useScrollMemory } from '../viewState'
import { SECTIONS, sectionOf, type SectionId } from '../settingsSections'
import { ACCENTS, state, toast, type Appearance } from '../store'
import { runs, runPapers } from '../case/runs'
import { API_URL, isApi } from '../config'
import { checkHealth, server } from '../api/client'
import { useBusy } from '../useBusy'
import { downloadSubmission, submissionToast } from '../case/export'

const scroller = ref<HTMLElement | null>(null)
useScrollMemory(scroller, 'settings')
const a = state.appearance
const route = useRoute()
const router = useRouter()

const sections = computed(() => SECTIONS.filter((s) => !(state.mobile && s.id === 'keys')))
const section = computed<SectionId | null>(() => {
  const s = sectionOf(route.query.section)
  return s && !(state.mobile && s === 'keys') ? s : state.mobile ? null : s === 'keys' ? null : 'profile'
})
const current = computed(() => SECTIONS.find((s) => s.id === section.value))
const open = (id: SectionId) => void (state.mobile ? router.push({ path: '/settings', query: { section: id } }) : router.replace({ path: '/settings', query: { section: id } }))
watch(section, () => scroller.value && (scroller.value.scrollTop = 0))
watch(() => route.query.section, (q) => { if (q != null && !sectionOf(q)) void router.replace({ path: '/settings' }) }, { immediate: true })

const DEFAULTS: Appearance = { mode: 'system', accent: 'sapphire', font: 14, motion: 'system', contrast: 50, density: 'comfortable' }
const MODES = [
  { id: 'light', name: 'Светлая' },
  { id: 'dark', name: 'Тёмная' },
  { id: 'system', name: 'Как в системе' },
] as const
const SIZES = [13, 14, 15, 16]
const MOTION = [
  { id: 'system', name: 'Как в системе' },
  { id: 'off', name: 'Есть' },
  { id: 'on', name: 'Нет' },
] as const
const CONTRAST = [
  { v: 0, name: 'Мягче' },
  { v: 50, name: 'Обычно' },
  { v: 100, name: 'Чётче' },
]
const nearContrast = computed(() => CONTRAST.reduce((b, c) => (Math.abs(c.v - a.contrast) < Math.abs(b.v - a.contrast) ? c : b)).v)
const DENSITY = [
  { id: 'comfortable', name: 'Просторно' },
  { id: 'compact', name: 'Компактно' },
] as const
onMounted(() => { a.font = SIZES.reduce((best, s) => (Math.abs(s - a.font) < Math.abs(best - a.font) ? s : best), 14) })

const isDefault = computed(() => (Object.keys(DEFAULTS) as (keyof Appearance)[]).every((k) => a[k] === DEFAULTS[k]))
function reset() {
  const prev = { ...a }
  Object.assign(a, DEFAULTS)
  toast('Внешний вид сброшен', { label: 'Вернуть', run: () => Object.assign(a, prev) })
}

const allPids = computed(() => [...new Set(runs.flatMap((r) => runPapers(r.id)))])
function exportAll() {
  toast(submissionToast(downloadSubmission(allPids.value, 'Набор для сдачи — все разборы.zip')))
}
const sure = ref(false)
let sureT = 0
function resetLocal() {
  if (!sure.value) {
    sure.value = true
    window.clearTimeout(sureT)
    sureT = window.setTimeout(() => (sure.value = false), 5000)
    return
  }
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('gs:')).forEach((k) => localStorage.removeItem(k))
    Object.keys(sessionStorage).filter((k) => k.startsWith('gs:')).forEach((k) => sessionStorage.removeItem(k))
  } catch { }
  location.reload()
}
const { busy: pingBusy, run: pingRun } = useBusy()
const ping = () => void pingRun(async () => { await checkHealth() })
</script>

<template>
  <div ref="scroller" class="set">
    <div class="set__inner">
      <h1 v-if="!state.mobile" class="set__h1">Настройки</h1>

      <div class="set__grid">
        <nav v-if="!state.mobile || !section" class="nav" aria-label="Разделы настроек">
          <button
            v-for="s in sections"
            :key="s.id"
            type="button"
            class="nav__i"
            :class="{ 'is-on': section === s.id }"
            :aria-current="section === s.id ? 'page' : undefined"
            @click="open(s.id)"
          >
            <Icon :name="s.icon" :size="18" />
            <span class="nav__t"><b>{{ s.name }}</b><small v-if="state.mobile">{{ s.hint }}</small></span>
            <Icon v-if="state.mobile" name="chevron-right" :size="16" class="nav__go" />
          </button>
        </nav>

        <div v-if="section" class="pane">
          <h2 v-if="!state.mobile" class="pane__h">{{ current?.name }}</h2>

          <SettingsProfile v-if="section === 'profile'" />

          <template v-else-if="section === 'appearance'">
            <div class="demo" aria-label="Предпросмотр">
              <div class="demo__row"><span class="demo__t">КПД · образец B</span><span class="demo__v num">18,6 %</span></div>
              <p class="demo__p">Так выглядит текст на сайте. <span class="demo__a">Ссылка на источник</span> · <span class="demo__chip">Табл. 2</span></p>
              <div class="demo__act"><button type="button" class="btn btn--dark btn--sm">Принять</button><button type="button" class="btn btn--soft btn--sm">Править</button></div>
            </div>

            <SetGroup>
              <SetRow title="Тема" hint="Светлая, тёмная или как в системе" stack>
                <div class="seg set__seg" role="radiogroup" aria-label="Тема">
                  <button v-for="m in MODES" :key="m.id" type="button" role="radio" :aria-checked="a.mode === m.id" :class="{ 'is-on': a.mode === m.id }" @click="a.mode = m.id">{{ m.name }}</button>
                </div>
              </SetRow>
              <SetRow title="Акцент" hint="Ссылки, выделение, активные вкладки" stack>
                <div class="accents" role="radiogroup" aria-label="Акцентный цвет">
                  <button
                    v-for="(acc, id) in ACCENTS"
                    :key="id"
                    type="button"
                    role="radio"
                    class="swatch"
                    :class="{ 'is-on': a.accent === id }"
                    :style="{ '--c': acc.c[0] }"
                    :aria-checked="a.accent === id"
                    :aria-label="acc.name"
                    :data-tip="acc.name"
                    @click="a.accent = String(id)"
                  >
                    <Icon v-if="a.accent === id" name="check" :size="14" />
                  </button>
                </div>
              </SetRow>
              <SetRow title="Размер текста" hint="Меняет весь интерфейс, px" stack>
                <div class="seg set__seg" role="radiogroup" aria-label="Размер текста">
                  <button v-for="s in SIZES" :key="s" type="button" role="radio" :aria-checked="a.font === s" :class="{ 'is-on': a.font === s }" @click="a.font = s">{{ s }}</button>
                </div>
              </SetRow>
              <SetRow title="Плотность" hint="Высота строк в списках и таблицах" stack>
                <div class="seg set__seg" role="radiogroup" aria-label="Плотность">
                  <button v-for="d in DENSITY" :key="d.id" type="button" role="radio" :aria-checked="a.density === d.id" :class="{ 'is-on': a.density === d.id }" @click="a.density = d.id">{{ d.name }}</button>
                </div>
              </SetRow>
              <SetRow title="Контраст" hint="Подписи и линии на фоне" stack>
                <div class="seg set__seg" role="radiogroup" aria-label="Контраст">
                  <button v-for="c in CONTRAST" :key="c.v" type="button" role="radio" :aria-checked="nearContrast === c.v" :class="{ 'is-on': nearContrast === c.v }" @click="a.contrast = c.v">{{ c.name }}</button>
                </div>
              </SetRow>
              <SetRow title="Анимации" hint="Плавные переходы и появление блоков" stack>
                <div class="seg set__seg" role="radiogroup" aria-label="Анимации">
                  <button v-for="m in MOTION" :key="m.id" type="button" role="radio" :aria-checked="a.motion === m.id" :class="{ 'is-on': a.motion === m.id }" @click="a.motion = m.id">{{ m.name }}</button>
                </div>
              </SetRow>
            </SetGroup>
            <SetGroup>
              <SetRow action icon="undo" title="Сбросить внешний вид" :class="{ 'is-off': isDefault }" @click="!isDefault && reset()" />
            </SetGroup>
          </template>

          <KeysEditor v-else-if="section === 'keys'" />

          <DictionaryPanel v-else-if="section === 'normalize'" />

          <SetGroup v-else-if="section === 'export'">
            <SetRow title="Источник данных" :hint="isApi ? `Сервер (${API_URL})` : 'Локальные данные'" />
            <SetRow v-if="isApi" action icon="check" :title="pingBusy ? 'Проверяем…' : 'Проверить соединение'" :hint="server.state === 'up' ? 'Сервер отвечает' : server.state === 'down' ? 'Сервер недоступен' : 'Ещё не проверялось'" :busy="pingBusy" @click="ping" />
            <SetRow v-if="!isApi" to="/export" title="Открыть экспорт" hint="Набор для сдачи (7 таблиц), JSON и Excel" />
            <SetRow v-if="!isApi" action title="Скачать набор по всем разборам" :hint="`ZIP: 7 таблиц и паспорт · статей: ${allPids.length}`" @click="exportAll" />
            <SetRow v-if="!isApi" action tone="danger" :title="sure ? 'Нажмите ещё раз, чтобы сбросить' : 'Сбросить локальные данные'" :hint="sure ? 'Настройки, профиль и ваши правки будут удалены' : 'Убрать разборы, ваши правки и профиль из этого браузера'" @click="resetLocal" />
          </SetGroup>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.set { height: 100%; overflow: auto; }
.set__inner { width: min(1400px, 100%); margin: 0 auto; padding: calc(56px + var(--s6)) var(--page-x) var(--s10); }
.set__h1 { font-size: var(--fs-h1); font-weight: 600; letter-spacing: var(--h1-ls, -0.015em); line-height: 1.2; }
.set__grid { max-width: 1000px; display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: var(--s10); margin-top: var(--s6); align-items: start; }

.nav { position: sticky; top: 0; display: grid; gap: 2px; }
.nav__i { display: flex; align-items: center; gap: var(--s3); height: var(--row-h); padding: 0 var(--s3); border-radius: var(--r-sm); font-size: var(--fs-body); color: var(--ink-2); transition: background-color var(--t) ease; }
.nav__i:hover { background: var(--bg-2); }
.nav__i.is-on { background: var(--card); box-shadow: 0 0 0 1px var(--line); color: var(--ink); font-weight: 500; }
.nav__i > .ico:first-child { color: var(--muted); }
.nav__i.is-on > .ico:first-child { color: var(--ink-2); }
.nav__t { flex: 1; min-width: 0; display: grid; }
.nav__t b { font-weight: inherit; }
.nav__t small { font-size: var(--fs-sm); color: var(--muted); }
.nav__go { color: var(--muted); }

.pane { min-width: 0; max-width: 680px; }
.pane__h { margin: 0 0 var(--s5); font-size: var(--fs-h2); font-weight: 600; }
.demo { margin-bottom: var(--s6); padding: var(--s4) var(--s5); background: var(--card); border-radius: var(--r-lg); box-shadow: 0 0 0 1px var(--line); }
.demo__row { display: flex; align-items: center; justify-content: space-between; gap: var(--s3); min-height: var(--row-fact); padding: 0 var(--s3); border-radius: var(--r-sm); background: var(--blue-wash); font-size: var(--fs-body); }
.demo__t { color: var(--muted); }
.demo__v { font-weight: 600; }
.demo__p { margin: var(--s3) 0 0; font-size: var(--fs-body); color: var(--ink-2); }
.demo__a { color: var(--lk); font-weight: 500; }
.demo__chip { display: inline-block; padding: 0 var(--s2); border-radius: var(--r-pill); background: var(--blue-soft); font-size: var(--fs-xs); line-height: 1.8; }
.demo__act { display: flex; gap: var(--s2); margin-top: var(--s3); }

.accents { display: flex; gap: var(--s3); }
.swatch {
  width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; color: var(--on-accent, #fff);
  background: var(--c); box-shadow: 0 0 0 2px var(--card), 0 0 0 3px transparent;
  transition: box-shadow var(--t) ease, transform var(--t) var(--ease);
}
.swatch:hover { transform: scale(1.08); }
.swatch.is-on { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--c); }

.range { display: flex; align-items: center; gap: var(--s3); }
.range input {
  width: 200px; height: 4px; border-radius: var(--r-pill); appearance: none; cursor: pointer;
  background: linear-gradient(90deg, var(--blue) var(--p), var(--bg-3) var(--p));
}
.range input::-webkit-slider-thumb { appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--card); box-shadow: 0 1px 4px rgb(0 0 0 / 0.3); }
.range input::-moz-range-thumb { width: 18px; height: 18px; border: 0; border-radius: 50%; background: var(--card); box-shadow: 0 1px 4px rgb(0 0 0 / 0.3); }
.range__v { width: 28px; text-align: right; color: var(--muted); }
.is-off { opacity: 0.45; cursor: default; }
.is-off:hover { background: none; }

@media (max-width: 1100px) and (min-width: 769px) {
  .set__grid { gap: var(--s6); grid-template-columns: 180px minmax(0, 1fr); }
}
@media (max-width: 768px) {
  .set__inner { padding: var(--s2) var(--page-x) calc(var(--s10) + var(--safe-b)); }
  .set__grid { grid-template-columns: minmax(0, 1fr); margin-top: 0; }
  .nav { position: static; gap: 0; background: var(--card); border-radius: var(--r-lg); box-shadow: 0 0 0 1px var(--line); overflow: hidden; margin-top: var(--s2); }
  .nav__i { height: auto; min-height: 56px; padding: var(--s2) var(--s4); border-radius: 0; }
  .nav__i + .nav__i { border-top: 1px solid var(--line); }
  .nav__i.is-on { background: none; }
  .nav__t b { font-weight: 500; }
  .set__seg { display: flex; width: 100%; }
  .set__seg > button { flex: 1 1 0; justify-content: center; padding: 0 var(--s2); }
  .accents { flex-wrap: wrap; gap: var(--s3); }
  .swatch { width: 40px; height: 40px; }
  .range { width: 100%; }
  .range input { flex: 1; width: auto; height: 6px; touch-action: pan-y; }
  .range input::-webkit-slider-thumb { width: 24px; height: 24px; }
  .range input::-moz-range-thumb { width: 24px; height: 24px; }
  .range__v { width: 32px; }
  .demo { padding: var(--s4); }
}
</style>
