<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { state } from '../store'

const props = defineProps<{ mode: 'email' | 'password' }>()
const emit = defineEmits<{ close: []; done: [value: string] }>()

const f = reactive({ email: '', cur: '', next: '', again: '' })
const tried = ref(false)
const show = ref(false)
const first = ref<HTMLInputElement | null>(null)

const cur = computed(() => state.profile.email.trim().toLowerCase())
const errs = computed(() => {
  const e = { email: '', cur: '', next: '', again: '' }
  if (props.mode === 'email') {
    const v = f.email.trim().toLowerCase()
    if (!v) e.email = 'Введите новую почту'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) e.email = 'Проверьте адрес почты'
    else if (v === cur.value) e.email = 'Это ваша текущая почта'
    if (!f.cur) e.cur = 'Введите текущий пароль'
  } else {
    if (!f.cur) e.cur = 'Введите текущий пароль'
    if (!f.next) e.next = 'Введите новый пароль'
    else if (f.next.length < 8) e.next = 'Не меньше 8 символов'
    else if (f.next === f.cur) e.next = 'Новый пароль совпадает с текущим'
    if (!f.again) e.again = 'Повторите пароль'
    else if (f.again !== f.next) e.again = 'Пароли не совпадают'
  }
  return e
})
const bad = (k: keyof typeof errs.value) => (tried.value ? errs.value[k] : '')
function submit() {
  tried.value = true
  if (Object.values(errs.value).some(Boolean)) return
  emit('done', f.email.trim())
}
onMounted(async () => { await nextTick(); first.value?.focus() })
</script>

<template>
  <Teleport to="body">
    <div class="am" @pointerdown.self="emit('close')">
      <form class="am__box" role="dialog" aria-modal="true" :aria-label="mode === 'email' ? 'Сменить почту' : 'Сменить пароль'" novalidate @submit.prevent="submit" @keydown.esc.stop.prevent="emit('close')">
        <h2 class="am__t">{{ mode === 'email' ? 'Сменить почту' : 'Сменить пароль' }}</h2>
        <p v-if="mode === 'email'" class="am__p">Отправим письмо со ссылкой на новый адрес. Почта сменится после подтверждения.</p>

        <template v-if="mode === 'email'">
          <label class="f" :class="{ bad: bad('email') }">
            <span>Новая почта</span>
            <input ref="first" v-model="f.email" type="email" inputmode="email" autocomplete="email" placeholder="name@lab.ru" />
            <small>{{ bad('email') }}</small>
          </label>
          <label class="f" :class="{ bad: bad('cur') }">
            <span>Текущий пароль</span>
            <input v-model="f.cur" type="password" autocomplete="current-password" />
            <small>{{ bad('cur') }}</small>
          </label>
        </template>
        <template v-else>
          <label class="f" :class="{ bad: bad('cur') }">
            <span>Текущий пароль</span>
            <input ref="first" v-model="f.cur" :type="show ? 'text' : 'password'" autocomplete="current-password" />
            <small>{{ bad('cur') }}</small>
          </label>
          <label class="f" :class="{ bad: bad('next') }">
            <span>Новый пароль</span>
            <input v-model="f.next" :type="show ? 'text' : 'password'" autocomplete="new-password" placeholder="Не меньше 8 символов" />
            <small>{{ bad('next') }}</small>
          </label>
          <label class="f" :class="{ bad: bad('again') }">
            <span>Повторите пароль</span>
            <input v-model="f.again" :type="show ? 'text' : 'password'" autocomplete="new-password" placeholder="Ещё раз тот же пароль" />
            <small>{{ bad('again') }}</small>
          </label>
          <label class="am__show"><input v-model="show" type="checkbox" /> Показать пароли</label>
        </template>

        <div class="am__acts">
          <button type="button" class="btn btn--ghost" @click="emit('close')">Отмена</button>
          <button type="submit" class="btn btn--dark">{{ mode === 'email' ? 'Отправить' : 'Сменить пароль' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.am { position: fixed; inset: 0; z-index: var(--z-prompt); display: grid; place-items: center; padding: var(--s4); background: var(--scrim); }
.am__box { width: min(440px, 100%); max-height: 100%; overflow-y: auto; display: grid; gap: var(--s3); padding: var(--s6); border-radius: var(--r-lg); background: var(--card); box-shadow: var(--shadow-pop), 0 0 0 1px var(--line); }
.am__t { font-size: var(--fs-h2); font-weight: 600; }
.am__p { color: var(--muted); font-size: var(--fs-body); line-height: 1.45; }
.f { display: grid; gap: var(--s1); }
.f > span { font-size: var(--fs-sm); color: var(--muted); }
.f input { width: 100%; height: 44px; padding: 0 var(--s3); border: 0; border-radius: var(--r); outline: none; font: inherit; font-size: var(--fs-body); color: var(--ink); background: var(--bg-2); box-shadow: inset 0 0 0 1px var(--line); }
.f input:focus { box-shadow: inset 0 0 0 2px var(--blue); }
.f.bad input { box-shadow: inset 0 0 0 1.5px var(--red); }
.f small { min-height: 1.3em; font-size: var(--fs-xs); color: var(--red); }
.am__show { display: flex; align-items: center; gap: var(--s2); font-size: var(--fs-sm); color: var(--muted); cursor: pointer; }
.am__acts { display: flex; justify-content: flex-end; gap: var(--s2); margin-top: var(--s1); }
.btn--dark { background: var(--solid); color: var(--on-solid); }
@media (max-width: 768px) {
  .f input { font-size: 16px; height: 48px; }
  .am__acts .btn { min-height: 44px; flex: 1; }
  .am__show { min-height: 44px; }
}
</style>
