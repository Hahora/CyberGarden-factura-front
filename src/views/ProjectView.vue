<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import Composer from '../components/Composer.vue'
import UiSpinner from '../components/UiSpinner.vue'
import { useScrollMemory } from '../viewState'
import { askText } from '../prompt'
import { projectOf, chatsOf, paperOf, factsOf, openIssues, COLLECTIONS, state, picker, renameProject, renameChat, deleteChat, deleteProject, togglePin, pinChat, type Chat } from '../store'
import { askNew, projectSuggestions, sevDot } from '../query'

const props = defineProps<{ id: string }>()
const router = useRouter()

const scroller = ref<HTMLElement | null>(null)
useScrollMemory(scroller, 'project')

const project = computed(() => projectOf(props.id))
const collection = computed(() => (project.value ? COLLECTIONS[project.value.collection] : null))
const chats = computed(() => (project.value ? chatsOf(project.value.id) : []))

const stats = computed(() => {
  let papers = 0
  let facts = 0
  for (const c of chats.value) {
    const p = c.kind === 'paper' ? paperOf(c.paperId) : undefined
    if (!p) continue
    papers++
    facts += factsOf(p.id).length
  }
  return { papers, facts }
})

function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

const suggestions = computed(() => (project.value ? projectSuggestions(project.value.id) : []))

function submit(text: string) {
  const q = text.trim()
  const p = project.value
  if (!q || !p) return
  router.push('/c/' + askNew(p.id, undefined, q))
}

function when(t: number) {
  const d = new Date()
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.max(0, Math.ceil((start - t) / 864e5))
  if (t >= start) return 'сегодня'
  if (days === 1) return 'вчера'
  if (days < 30) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`
  const m = Math.floor(days / 30)
  return m < 12 ? `${m} ${plural(m, 'месяц', 'месяца', 'месяцев')} назад` : 'больше года назад'
}
function status(c: Chat) {
  if (c.kind !== 'paper') return null
  const p = paperOf(c.paperId)
  if (!p) return null
  if (p.processing < 100) return { pct: Math.floor(p.processing), n: 0, dot: '' }
  const open = openIssues(p)
  const worst = open.find((i) => i.level === 'conflict') ?? open[0]
  return open.length ? { pct: -1, n: open.length, dot: sevDot(worst!.level) } : null
}

const menu = ref<{ type: 'project' | 'chat'; id: string; x: number; y: number } | null>(null)
const menuEl = ref<HTMLElement | null>(null)
function openMenu(e: MouseEvent, type: 'project' | 'chat', id: string) {
  e.preventDefault()
  e.stopPropagation()
  if (menu.value?.type === type && menu.value.id === id) return (menu.value = null)
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const w = 260
  menu.value = { type, id, x: Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)), y: Math.max(8, Math.min(window.innerHeight - 260, r.bottom + 6)) }
}
const closeMenu = () => (menu.value = null)
function onDoc(e: MouseEvent) {
  if (menu.value && !menuEl.value?.contains(e.target as Node)) closeMenu()
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && menu.value) {
    closeMenu()
    e.stopPropagation()
  }
}
onMounted(() => {
  document.addEventListener('click', onDoc)
  document.addEventListener('keydown', onEsc, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDoc)
  document.removeEventListener('keydown', onEsc, true)
})
const menuChat = computed(() => (menu.value?.type === 'chat' ? chatsOf(project.value?.id ?? '').find((c) => c.id === menu.value!.id) : undefined))
async function rename(type: 'project' | 'chat', id: string, text: string) {
  closeMenu()
  const name = await askText({ title: type === 'project' ? 'Переименовать проект' : 'Переименовать чат', value: text, placeholder: 'Название' })
  if (name == null) return
  if (type === 'project') renameProject(id, name)
  else renameChat(id, name)
}
function removeProject() {
  const p = project.value
  closeMenu()
  if (!p) return
  void router.push('/app')
  deleteProject(p.id)
}
</script>

<template>
  <div ref="scroller" class="pv">
    <div v-if="!project" class="pv__col pv__missing">
      <h1 class="pv__title">Проект не найден</h1>
      <p class="pv__note">Возможно, он был удалён.</p>
      <RouterLink to="/app" class="btn btn--soft">На главную</RouterLink>
    </div>

    <div v-else class="pv__col">
      <header class="pv__head">
        <Icon name="folder-open" :size="30" class="pv__ico" />
        <h1 class="pv__title">{{ project.name }}</h1>
        <p class="pv__note num">{{ collection?.name }} · {{ stats.papers }} {{ plural(stats.papers, 'статья', 'статьи', 'статей') }} · {{ stats.facts }} {{ plural(stats.facts, 'факт', 'факта', 'фактов') }}</p>
        <button type="button" class="icon-btn pv__more" :class="{ 'is-on': menu?.type === 'project' }" aria-label="Действия с проектом" aria-haspopup="true" data-tip="Действия с проектом" @click="openMenu($event, 'project', project.id)"><Icon name="dots" :size="20" /></button>
      </header>

      <Composer
        class="pv__composer"
        :collection="project.collection"
        :project-id="project.id"
        lock-collection
        :scope-label="'Проект «' + project.name + '»'"
        scope-icon="folder"
        placeholder="Спросите о статьях проекта…"
        @send="submit"
      />

      <ul class="sugg" role="list">
        <li v-for="q in suggestions" :key="q"><button type="button" class="sugg__chip" @click="submit(q)">{{ q }}</button></li>
      </ul>

      <section class="list" aria-labelledby="pv-chats">
        <h2 id="pv-chats" class="list__h">Статьи и чаты</h2>
        <p v-if="!chats.length" class="list__empty">В проекте пока нет статей — загрузите PDF или задайте вопрос</p>
        <ul v-else class="list__ul">
          <li v-for="c in chats" :key="c.id">
            <div class="item" :class="{ 'is-menu': menu?.type === 'chat' && menu.id === c.id }">
              <RouterLink :to="'/c/' + c.id" class="item__link">
                <Icon class="item__kind" :name="c.kind === 'paper' ? 'doc' : 'chat'" :size="16" />
                <span class="item__t">{{ c.title }}</span>
                <span v-if="status(c)" class="item__st">
                  <template v-if="status(c)!.pct >= 0"><UiSpinner :size="14" tone="blue" label="Идёт разбор" />{{ status(c)!.pct }}%</template>
                  <template v-else><span class="dot" :class="status(c)!.dot" :data-tip="'Есть замечания: ' + status(c)!.n" :aria-label="'Есть замечания: ' + status(c)!.n" /></template>
                </span>
                <span class="item__when">{{ when(c.updatedAt) }}</span>
              </RouterLink>
              <button type="button" class="icon-btn icon-btn--sm item__dots" aria-label="Действия с чатом" aria-haspopup="true" @click="openMenu($event, 'chat', c.id)"><Icon name="dots" :size="16" /></button>
            </div>
          </li>
        </ul>
      </section>
      <Teleport to="body">
        <div v-if="menu" ref="menuEl" class="menu pv__menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" role="menu" @click.stop>
          <template v-if="menu.type === 'project'">
            <button class="menu__item" role="menuitem" @click="picker.open(project.id); closeMenu()"><Icon name="upload" :size="16" />Загрузить PDF в проект</button>
            <button class="menu__item" role="menuitem" @click="rename('project', project.id, project.name)"><Icon name="edit" :size="16" />Переименовать</button>
            <button class="menu__item" role="menuitem" @click="state.projectModal = project.id; closeMenu()"><Icon name="gear" :size="16" />Настройки проекта</button>
            <button class="menu__item" role="menuitem" @click="togglePin(project.id); closeMenu()"><Icon name="pin" :size="16" />{{ project.pinned ? 'Открепить' : 'Закрепить' }}</button>
            <div class="menu__sep" />
            <button class="menu__item menu__item--danger" role="menuitem" @click="removeProject"><Icon name="trash" :size="16" />Удалить проект</button>
          </template>
          <template v-else-if="menuChat">
            <button class="menu__item" role="menuitem" @click="rename('chat', menuChat.id, menuChat.title)"><Icon name="edit" :size="16" />Переименовать</button>
            <button class="menu__item" role="menuitem" @click="pinChat(menuChat.id); closeMenu()"><Icon name="pin" :size="16" />{{ menuChat.pinned ? 'Открепить' : 'Закрепить' }}</button>
            <div class="menu__sep" />
            <button class="menu__item menu__item--danger" role="menuitem" @click="deleteChat(menuChat.id); closeMenu()"><Icon name="trash" :size="16" />{{ menuChat.kind === 'paper' ? 'Удалить статью' : 'Удалить чат' }}</button>
          </template>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.pv { height: 100%; overflow-y: auto; padding: 12vh var(--s6) 64px; }
.pv__col { width: min(760px, 100%); margin: 0 auto; }
.pv__head { position: relative; display: flex; flex-direction: column; align-items: flex-start; margin-bottom: var(--s6); }
.pv__more { position: absolute; top: 0; right: 0; }
.pv__menu { position: fixed; z-index: 100; }
.pv__more.is-on { background: var(--bg-2); }
.pv__ico { color: var(--ink-2); margin-bottom: var(--s3); }
.pv__title { margin: 0; font-size: 34px; font-weight: 300; line-height: 1.15; color: var(--ink); }
.pv__note { margin: var(--s3) 0 0; font-size: var(--fs-sm); color: var(--faint); }
.pv__missing { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s1); }
.pv__missing .btn { margin-top: var(--s4); }
.sugg { list-style: none; padding: 0; margin: var(--s3) 0 0; display: flex; flex-wrap: wrap; gap: var(--s2); }
.sugg li { flex: none; }
.sugg__chip { display: inline-flex; align-items: center; min-height: 32px; padding: 0 var(--s3); white-space: nowrap; border-radius: var(--r-pill); font-size: var(--fs-sm); box-shadow: inset 0 0 0 1px var(--line-2); transition: background-color var(--t) ease; }
.sugg__chip:hover { background: var(--bg-2); }

.list { margin-top: var(--s8); }
.list__h { margin: 0 0 var(--s2); font-size: var(--fs-xs); font-weight: 500; color: var(--faint); }
.list__empty { margin: 0; padding: var(--s5) 0; font-size: var(--fs-body); color: var(--muted); }
.list__ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.item { position: relative; display: flex; align-items: center; margin: 0 calc(var(--s3) * -1); border-radius: var(--r); transition: background-color var(--t) ease; }
.item:hover, .item.is-menu { background: var(--bg-2); }
.item__link { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--s3); min-height: 46px; padding: 0 var(--s2) 0 var(--s3); border-radius: var(--r); color: var(--ink); }
.item__kind { flex: none; color: var(--faint); }
.item__t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-body); }
.item__dots { flex: none; margin-right: var(--s1); opacity: 0; transition: opacity var(--t) ease; }
.item:hover .item__dots, .item__dots:focus-visible, .item.is-menu .item__dots { opacity: 1; }
@media (hover: none) { .item__dots { opacity: 1; } }
.item__st { display: flex; align-items: center; gap: var(--s2); flex: none; font-size: var(--fs-xs); color: var(--muted); font-variant-numeric: tabular-nums; }
.item__when { flex: none; width: 110px; text-align: right; font-size: var(--fs-sm); color: var(--faint); }

@media (max-width: 1100px) and (min-width: 769px) {
  .pv { padding-top: 8vh; }
}
@media (max-width: 768px) {
  .pv { padding: var(--s6) var(--s4) calc(var(--s10) + var(--safe-b)); }
  .pv__head { align-items: center; text-align: center; margin-bottom: var(--s5); }
  .pv__title { font-size: 26px; }
  .sugg {
    flex-wrap: nowrap; overflow-x: auto; margin-inline: calc(var(--s4) * -1); padding: 0 var(--s4); scrollbar-width: none; scroll-snap-type: x proximity;
    -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 32px), transparent);
  }
  .sugg li { scroll-snap-align: start; }
  .pv__more { width: 44px; height: 44px; }
  .sugg::-webkit-scrollbar { display: none; }
  .sugg__chip { flex: none; min-height: 44px; }
  .list { margin-top: var(--s6); }
  .list__h { margin-left: var(--s1); }
  .item { margin: 0 calc(var(--s2) * -1); }
  .item__link { min-height: 56px; padding: var(--s2) var(--s1) var(--s2) var(--s2); }
  .item:active { background: var(--bg-2); }
  .item__dots { width: 44px; height: 44px; margin-right: 0; }
  .item__when { display: none; }
}
</style>
