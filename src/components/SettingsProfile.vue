<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useBusy } from '../useBusy'
import { isApi } from '../config'
import { logout as apiLogout } from '../api/auth'
import SetGroup from './SetGroup.vue'
import SetRow from './SetRow.vue'
import Icon from './Icon.vue'
import UiStat from './UiStat.vue'
import AccountModal from './AccountModal.vue'
import DemoNote from './DemoNote.vue'
import { demoNote } from '../demoNote'
import { plural } from '../search'
import { ACCENTS, initials, state, toast } from '../store'
import { issueState, issuesOf } from '../case'
import { runPapers, runs } from '../case/runs'
import { J_VERB, jLink, journal } from '../journal'

const router = useRouter()
const p = computed(() => state.profile)
const avatarBg = (c: string) => (ACCENTS[c] ?? ACCENTS.graphite!).c[0]

const editing = ref(false)
const draft = reactive({ name: '', role: '', team: '', color: 'graphite', focus: '' })
const nameErr = ref(false)
const nameEl = ref<HTMLInputElement | null>(null)

function startEdit() {
  Object.assign(draft, { name: p.value.name, role: p.value.role, team: p.value.team, color: p.value.color, focus: p.value.focus })
  nameErr.value = false
  editing.value = true
  nextTick(() => nameEl.value?.focus())
}
function save() {
  if (!draft.name.trim()) {
    nameErr.value = true
    nameEl.value?.focus()
    return
  }
  Object.assign(state.profile, {
    name: draft.name.trim(), role: draft.role.trim(), team: draft.team.trim(),
    color: draft.color, focus: draft.focus.trim(),
  })
  editing.value = false
  toast('Профиль сохранён')
}
const cancel = () => (editing.value = false)

const modal = ref<'email' | 'password' | null>(null)
function done(v: string) {
  if (modal.value === 'email') {
    state.profile.pendingEmail = v
    demoNote('Смена почты')
  } else demoNote('Смена пароля')
  modal.value = null
}
function resend() { demoNote('Повторная отправка письма') }
function cancelPending() {
  state.profile.pendingEmail = ''
  demoNote('Отмена смены почты')
}

const pids = computed(() => [...new Set(runs.flatMap((r) => runPapers(r.id)))])
const log = computed(() => journal(pids.value))
const closedN = computed(() => pids.value.reduce((n, pid) => n + issuesOf(pid).filter((i) => issueState(pid, i.issue_id) !== 'open').length, 0))
const numbers = computed(() => {
  const fixed = log.value.filter((e) => e.kind === 'fixed').length
  const rejected = log.value.filter((e) => e.kind === 'rejected').length
  return [
    { v: runs.length, l: plural(runs.length, ['разбор', 'разбора', 'разборов']) },
    { v: pids.value.length, l: plural(pids.value.length, ['статья', 'статьи', 'статей']) },
    { v: log.value.length, l: plural(log.value.length, ['значение проверено', 'значения проверено', 'значений проверено']) },
    { v: fixed + rejected, l: plural(fixed + rejected, ['исправлено или отклонено', 'исправлено или отклонено', 'исправлено или отклонено']) },
    { v: closedN.value, l: plural(closedN.value, ['замечание закрыто', 'замечания закрыто', 'замечаний закрыто']) },
  ]
})

const recent = computed(() => log.value.slice(0, 5))
const when = (t: number) => {
  if (!t) return ''
  const d = new Date(t)
  const day = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 864e5)
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return day <= 0 ? time : day === 1 ? 'вчера' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
const linkOf = (e: (typeof recent.value)[number]) => {
  const l = jLink(e)
  return l.path + '?r=' + encodeURIComponent(e.rid)
}
const { busy: outBusy, run: outRun } = useBusy()
async function logout() {
  if (!isApi) return toast('Это демо — выходить некуда')
  await outRun(async () => { await apiLogout(); void router.push('/login') })
}
</script>

<template>
  <div class="pf">
    <header class="head">
        <div class="avatar" :style="{ background: avatarBg(editing ? draft.color : p.color) }" aria-hidden="true">
          {{ initials(editing ? draft.name : p.name) }}
        </div>

        <div v-if="!editing" class="head__main">
          <h2>{{ p.name }}</h2>
          <p v-if="p.role || p.team" class="head__line">{{ [p.role, p.team].filter(Boolean).join(" · ") }}</p>
          <p class="head__mail">{{ p.email }}</p>
          <p v-if="p.focus" class="head__focus">{{ p.focus }}</p>
        </div>
        <button v-if="!editing" class="btn btn--soft btn--sm head__edit" type="button" @click="startEdit">
          <Icon name="edit" :size="15" /> Изменить
        </button>

        <form v-else class="form" @submit.prevent="save" @keydown.esc.prevent="cancel">
          <label class="f">
            <span>Имя</span>
            <input ref="nameEl" v-model="draft.name" class="in" :class="{ 'in--err': nameErr }" autocomplete="name" @input="nameErr = false" />
            <em v-if="nameErr" class="err">Укажите имя</em>
          </label>
          <div class="form__2">
            <label class="f"><span>Должность</span><input v-model="draft.role" class="in" placeholder="Например, научный сотрудник" /></label>
            <label class="f"><span>Команда</span><input v-model="draft.team" class="in" placeholder="Например, лаборатория фотовольтаики" /></label>
          </div>
          <div class="f">
            <span>Почта</span>
            <div class="mail">
              <div class="in in--ro" data-tip="Почта меняется через подтверждение" tabindex="0" role="textbox" aria-readonly="true" aria-label="Почта, только чтение">
                <Icon name="lock" :size="15" /><span>{{ p.email }}</span>
              </div>
              <button class="btn btn--soft btn--sm" type="button" @click="modal = 'email'">Сменить почту</button>
            </div>
          </div>
          <label class="f"><span>Чем занимаетесь</span><textarea v-model="draft.focus" class="in in--area" rows="2" /></label>
          <div class="f">
            <span>Цвет аватара</span>
            <div class="sw" role="radiogroup" aria-label="Цвет аватара">
              <button
                v-for="(a, id) in ACCENTS"
                :key="id"
                type="button"
                role="radio"
                class="sw__dot"
                :class="{ 'is-on': draft.color === id }"
                :style="{ background: a.c[0] }"
                :aria-checked="draft.color === id"
                :aria-label="a.name"
                :data-tip="a.name"
                @click="draft.color = String(id)"
              />
            </div>
          </div>
          <div class="form__act">
            <button class="btn btn--dark btn--sm" type="submit"><Icon name="check" :size="15" /> Сохранить</button>
            <button class="btn btn--ghost btn--sm" type="button" @click="cancel">Отмена</button>
          </div>
        </form>
      </header>

    <div v-if="p.pendingEmail" class="pend" role="status">
      <Icon name="lock" :size="16" class="pend__ico" />
      <span class="pend__t">Ожидает подтверждения: <b>{{ p.pendingEmail }}</b></span>
      <button type="button" class="link" @click="resend">Отправить письмо ещё раз</button>
      <button type="button" class="link link--muted" @click="cancelPending">Отменить</button>
    </div>

    <h3 class="pf__grp">Ваша работа</h3>
    <div class="nums">
      <UiStat v-for="n in numbers" :key="n.l" :value="n.v" :label="n.l" />
    </div>

    <SetGroup title="Последние правки" class="pf__rec">
      <SetRow v-for="e in recent" :key="e.key" :to="linkOf(e)" :title="J_VERB[e.kind] + ' · ' + e.subject" :hint="e.from ? `${e.pid} · ${e.from} → ${e.to}` : e.pid"><span class="when num">{{ when(e.at) }}</span></SetRow>
      <SetRow v-if="!recent.length" title="Правок пока нет" />
      <SetRow v-if="recent.length" to="/history" title="Весь журнал" tone="blue" />
    </SetGroup>

    <SetGroup title="Безопасность" class="pf__rec">
      <SetRow action icon="lock" title="Сменить пароль" hint="Понадобится текущий пароль" @click="modal = 'password'" />
      <SetRow action icon="edit" title="Сменить почту" hint="Письмо со ссылкой на новый адрес" @click="modal = 'email'" />
      <SetRow action title="Забыли пароль?" hint="Пришлём ссылку для сброса на вашу почту" tone="blue" @click="demoNote('Восстановление пароля')" />
    </SetGroup>

    <SetGroup class="pf__out">
      <SetRow action icon="logout" :title="outBusy ? 'Выходим…' : 'Выйти'" :busy="outBusy" @click="logout" />
    </SetGroup>

    <AccountModal v-if="modal" :mode="modal" @close="modal = null" @done="done" />
    <DemoNote />
  </div>
</template>

<style scoped>
.head { display: flex; align-items: flex-start; gap: var(--s5); }
.avatar {
  flex: none; width: 72px; height: 72px; border-radius: 50%;
  display: grid; place-items: center;
  color: var(--on-accent, #fff); font-size: var(--fs-num); font-weight: 500; letter-spacing: 0.02em;
}
.head__main { flex: 1; min-width: 0; }
.head__main h2 { font-size: var(--fs-h1); font-weight: 600; letter-spacing: -0.015em; line-height: 1.2; overflow-wrap: anywhere; }
.head__line { margin-top: var(--s1); color: var(--muted); font-size: var(--fs-body); }
.head__mail { margin-top: var(--s1); color: var(--muted); font-size: var(--fs-sm); }
.head__focus { margin-top: var(--s3); font-size: var(--fs-body); line-height: 1.5; }
.head__edit { flex: none; }

.form { flex: 1; min-width: 0; display: grid; gap: var(--s4); }
.form__2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s4); }
.f { display: grid; gap: var(--s2); min-width: 0; }
.f > span { font-size: var(--fs-sm); color: var(--muted); }
.in {
  width: 100%; min-height: 36px; padding: var(--s2) var(--s3);
  background: var(--card); color: var(--ink);
  border: 1px solid var(--line); border-radius: var(--r-sm); font-size: var(--fs-body); outline: none;
}
.in:focus { border-color: var(--blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 18%, transparent); }
.in--area { resize: vertical; line-height: 1.5; }
.in--err { border-color: var(--blue); }
.err { font-style: normal; font-size: var(--fs-xs); color: var(--muted); }
.sw { display: flex; gap: var(--s3); flex-wrap: wrap; }
.sw__dot {
  width: 26px; height: 26px; border-radius: 50%; border: 0; cursor: pointer;
  box-shadow: 0 0 0 2px var(--bg), 0 0 0 3px transparent;
}
.sw__dot.is-on { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--ink); }
.sw__dot:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.form__act { display: flex; gap: var(--s2); }
.mail { display: flex; gap: var(--s2); align-items: center; flex-wrap: wrap; }
.in--ro { box-sizing: border-box; flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: var(--s2); background: var(--bg-2); color: var(--muted); cursor: default; }
.in--ro span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pend { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2) var(--s4); margin-top: var(--s5); padding: var(--s3) var(--s4); border-radius: var(--r); background: var(--bg-2); box-shadow: inset 0 0 0 1px var(--line); font-size: var(--fs-sm); }
.pend__ico { color: var(--muted); }
.pend__t { flex: 1 1 220px; min-width: 0; overflow-wrap: anywhere; }
.pend .link { border: 0; background: none; padding: 0; font-size: var(--fs-sm); cursor: pointer; }

.pf__grp { margin: var(--s8) 0 0; font-size: var(--fs-sm); font-weight: 500; color: var(--muted); }
.nums { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--s3); padding-top: var(--s3); }
.pf__rec { margin-top: var(--s8); }
.pf__out { margin-top: var(--s8); }
.when { font-size: var(--fs-sm); color: var(--muted); }

@media (max-width: 1100px) and (min-width: 769px) {
  .nums { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
  .head { flex-wrap: wrap; align-items: center; gap: var(--s4); }
  .avatar { width: 56px; height: 56px; font-size: var(--fs-h1); }
  .head__main { flex: 1; min-width: 0; }
  .head__focus { margin-top: var(--s2); }
  .head__edit { flex: 1 1 100%; width: 100%; height: 44px; margin: 0; justify-content: center; }
  .form { flex: 1 1 100%; gap: var(--s4); }
  .form__2 { grid-template-columns: 1fr; gap: var(--s4); }
  .in { min-height: 48px; padding: var(--s2) var(--s4); border-radius: var(--r); font-size: 16px; }
  .sw { gap: var(--s3); }
  .sw__dot { width: 36px; height: 36px; }
  .form__act { display: grid; grid-template-columns: 1fr 1fr; }
  .in--ro { flex: 1 1 100%; }
  .mail .btn { flex: 1 1 100%; height: 44px; justify-content: center; }
  .form__act .btn { height: 48px; justify-content: center; }
  .nums { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s3); }
}
</style>
