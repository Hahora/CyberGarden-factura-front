<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isApi } from '../config'
import { login } from '../api/auth'
import { ApiError } from '../api/client'
import UiSpinner from '../components/UiSpinner.vue'

const route = useRoute()
const router = useRouter()

const mode = ref<'login' | 'signup'>(route.query.mode === 'signup' ? 'signup' : 'login')
watch(() => route.query.mode, (m) => { mode.value = m === 'signup' ? 'signup' : 'login' })
function setMode(m: 'login' | 'signup') {
  mode.value = m
  tried.value = false
  router.replace({ query: m === 'signup' ? { mode: 'signup' } : {} })
}

const name = ref('')
const email = ref('')
const password = ref('')
const password2 = ref('')
const show = ref(false)
const agree = ref(true)
const tried = ref(false)
const busy = ref<'' | 'form' | 'vk' | 'ya'>('')
const ready = ref(false)
const emailEl = ref<HTMLInputElement | null>(null)

const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))
const passOk = computed(() => (isApi && mode.value === 'login' ? password.value.length > 0 : password.value.length >= 8))
const serverErr = ref('')
watch([email, password], () => (serverErr.value = ''))
const sameOk = computed(() => mode.value === 'login' || (password2.value.length > 0 && password2.value === password.value))
const nameOk = computed(() => mode.value === 'login' || name.value.trim().length > 1)
const errors = computed(() => ({
  name: tried.value && !nameOk.value ? 'Как к вам обращаться' : '',
  email: tried.value && !emailOk.value ? (email.value ? 'Проверьте адрес почты' : 'Введите почту') : '',
  password: serverErr.value || (tried.value && !passOk.value ? (password.value ? 'Не меньше 8 символов' : 'Введите пароль') : ''),
  password2: tried.value && mode.value === 'signup' && !sameOk.value ? (password2.value ? 'Пароли не совпадают' : 'Повторите пароль') : '',
  agree: tried.value && mode.value === 'signup' && !agree.value ? 'Нужно согласие' : '',
}))
const strength = computed(() => {
  const p = password.value
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/\d/.test(p) && /[a-zа-я]/i.test(p)) s++
  if (/[^\w\s]/.test(p) || /[A-ZА-Я]/.test(p)) s++
  return p ? Math.max(1, s) : 0
})
const strengthLabel = computed(() => ['', 'Слабый', 'Средний', 'Хороший', 'Надёжный'][strength.value])

async function enter(kind: 'form' | 'vk' | 'ya') {
  if (busy.value) return
  if (kind === 'form') {
    tried.value = true
    if (!emailOk.value || !passOk.value || !sameOk.value || !nameOk.value || (mode.value === 'signup' && !agree.value)) return
  }
  if (isApi && kind === 'form' && mode.value === 'login') {
    busy.value = 'form'
    try {
      await login(email.value.trim(), password.value)
      const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') && !route.query.next.startsWith('//') ? route.query.next : '/app'
      void router.replace(next === '/login' ? '/app' : next)
    } catch (e) {
      serverErr.value = e instanceof ApiError ? (e.code === 'invalid_credentials' ? 'Неверная почта или пароль' : e.message) : 'Не удалось войти'
      tried.value = true
    } finally { busy.value = '' }
    return
  }
  demo(kind === 'vk' ? 'Вход через VK ID' : kind === 'ya' ? 'Вход через Яндекс ID' : mode.value === 'signup' ? 'Регистрация' : 'Вход')
}

const note = ref('')
let noteTimer = 0
function demo(what: string) {
  note.value = ''
  clearTimeout(noteTimer)
  requestAnimationFrame(() => { note.value = what + ' — только для демонстрации' })
  noteTimer = window.setTimeout(() => (note.value = ''), 6000)
}

onMounted(async () => {
  document.title = mode.value === 'signup' ? 'Регистрация — Фактура AI' : 'Вход — Фактура AI'
  requestAnimationFrame(() => (ready.value = true))
  await nextTick()
  if (window.innerWidth > 720) emailEl.value?.focus()
})
watch(mode, (m) => { document.title = m === 'signup' ? 'Регистрация — Фактура AI' : 'Вход — Фактура AI' })
</script>

<template>
  <div class="auth" :class="{ ready, signup: mode === 'signup' }">
    <section class="side">
      <header class="top">
        <RouterLink to="/" class="logo" aria-label="Фактура AI — на главную">
          <svg viewBox="0 0 100 100" aria-hidden="true"><g fill="currentColor"><circle cx="18" cy="18" r="9" /><circle cx="50" cy="18" r="9" /><circle cx="82" cy="18" r="9" /><circle cx="18" cy="50" r="9" /><circle cx="82" cy="50" r="9" /><circle cx="18" cy="82" r="9" /><circle cx="50" cy="82" r="9" /><circle cx="82" cy="82" r="9" /></g><circle cx="50" cy="50" r="15" fill="var(--brand, #2f6bff)" /></svg>
          фактура<span class="ai">AI</span>
        </RouterLink>
        <RouterLink to="/" class="back">На главную</RouterLink>
      </header>

      <div class="box">
        <div class="phone-art" aria-hidden="true"><img src="/landing/hero-grid.webp" alt=""></div>

        <h1 :key="mode" class="title">{{ mode === 'login' ? 'С возвращением' : 'Создайте аккаунт' }}</h1>
        <p class="sub">{{ mode === 'login' ? 'Войдите, чтобы продолжить работу со статьями' : 'Первые 50 статей — бесплатно, без карты' }}</p>

        <div class="seg seg--full mode" role="tablist" aria-label="Вход или регистрация">
          <button type="button" role="tab" :aria-selected="mode === 'login'" :class="{ on: mode === 'login' }" @click="setMode('login')">Вход</button>
          <button type="button" role="tab" :aria-selected="mode === 'signup'" :class="{ on: mode === 'signup' }" @click="setMode('signup')">Регистрация</button>
        </div>

        <div class="ids">
          <button type="button" class="id id--vk" :disabled="!!busy" @click="enter('vk')">
            <svg class="id__logo" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7.2" fill="#fff" /><path fill="#0077ff" d="M12.77 17.29C7.3 17.29 4.18 13.54 4.05 7.3h2.74c.09 4.58 2.11 6.52 3.71 6.92V7.3h2.58v3.95c1.58-.17 3.24-1.97 3.8-3.95h2.58c-.43 2.44-2.23 4.24-3.51 4.98 1.28.6 3.33 2.17 4.11 5.01h-2.84c-.61-1.9-2.13-3.37-4.14-3.57v3.57h-.31Z" /></svg>
            <span>{{ busy === 'vk' ? 'VK ID…' : 'VK ID' }}</span>
            <UiSpinner v-if="busy === 'vk'" :size="16" tone="current" class="spin-in" />
          </button>
          <button type="button" class="id id--ya" :disabled="!!busy" @click="enter('ya')">
            <svg class="id__logo" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#fc3f1d" /><path fill="#fff" d="M13.32 7.666h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.704-3.003 4.487H7.49l2.695-4.014c-1.55-1.111-2.42-2.19-2.42-4.015 0-2.288 1.595-3.85 4.62-3.85h3.003v11.868H13.32V7.666z" /></svg>
            <span>{{ busy === 'ya' ? 'Яндекс ID…' : 'Яндекс ID' }}</span>
            <UiSpinner v-if="busy === 'ya'" :size="16" tone="current" class="spin-in" />
          </button>
        </div>

        <div class="or"><span>или по почте</span></div>

        <form novalidate @submit.prevent="enter('form')">
          <Transition name="grow">
            <label v-if="mode === 'signup'" class="f" :class="{ bad: errors.name }">
              <span class="f__l">Имя</span>
              <input v-model="name" type="text" autocomplete="name" placeholder="Анна Иванова">
              <small v-if="tried" class="f__e">{{ errors.name }}</small>
            </label>
          </Transition>
          <label class="f" :class="{ bad: errors.email }">
            <span class="f__l">Почта</span>
            <input ref="emailEl" v-model="email" type="email" inputmode="email" autocomplete="email" placeholder="name@lab.ru">
            <small v-if="tried" class="f__e">{{ errors.email }}</small>
          </label>
          <label class="f" :class="{ bad: errors.password }">
            <span class="f__l">
              Пароль
              <a v-if="mode === 'login'" href="#" class="f__link" @click.prevent="demo('Восстановление пароля')">Забыли пароль?</a>
            </span>
            <span class="f__pw">
              <input v-model="password" :type="show ? 'text' : 'password'" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" placeholder="Не меньше 8 символов">
              <button type="button" class="eye" :aria-label="show ? 'Скрыть пароль' : 'Показать пароль'" :aria-pressed="show" @click="show = !show">
                <svg v-if="!show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.1 6.1A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.9-1.9M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
              </button>
            </span>
            <small v-if="errors.password" class="f__e">{{ errors.password }}</small>
            <span v-else-if="mode === 'signup' && strength" class="meter" :data-s="strength">
              <i v-for="n in 4" :key="n" :class="{ on: n <= strength }" /><em>{{ strengthLabel }}</em>
            </span>
            <small v-else-if="tried" class="f__e" />
          </label>

          <label v-if="mode === 'signup'" class="f" :class="{ bad: errors.password2, good: sameOk && passOk }">
            <span class="f__l">Повторите пароль</span>
            <span class="f__pw">
              <input v-model="password2" :type="show ? 'text' : 'password'" autocomplete="new-password" placeholder="Ещё раз тот же пароль">
              <svg v-if="sameOk && passOk" class="f__ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-label="Пароли совпадают"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </span>
            <small v-if="tried" class="f__e">{{ errors.password2 }}</small>
          </label>

          <label v-if="mode === 'signup'" class="check" :class="{ bad: errors.agree }">
            <input v-model="agree" type="checkbox">
            <span class="check__box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
            <span>Принимаю <a href="#" @click.prevent>условия</a> и <a href="#" @click.prevent>политику конфиденциальности</a></span>
          </label>

          <button class="submit" type="submit" :disabled="!!busy">
            <UiSpinner v-if="busy === 'form'" :size="16" tone="current" />
            <span>{{ busy === 'form' ? (mode === 'login' ? 'Входим…' : 'Создаём аккаунт…') : (mode === 'login' ? 'Войти' : 'Создать аккаунт') }}</span>
          </button>
        </form>

        <p class="swap">
          <template v-if="mode === 'login'">Нет аккаунта? <button type="button" @click="setMode('signup')">Зарегистрироваться</button></template>
          <template v-else>Уже есть аккаунт? <button type="button" @click="setMode('login')">Войти</button></template>
        </p>
      </div>

      <Transition name="note">
        <div v-if="note" class="note" role="status" aria-live="polite">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></svg>
          <span>{{ note }}</span>
          <RouterLink to="/app" class="note__go">Открыть приложение</RouterLink>
          <button type="button" aria-label="Закрыть" @click="note = ''">×</button>
        </div>
      </Transition>
    </section>

    <aside class="art" aria-hidden="true">
      <img class="art__bg" src="/landing/hero-bg.webp" alt="">
      <img class="art__rings" src="/landing/rings.webp" alt="">
      <img class="art__grid" src="/landing/hero-grid.webp" alt="">
      <img class="art__page" src="/landing/page-table.webp" alt="">
      <img class="art__disc" src="/landing/disc.webp" alt="">
      <img class="art__rhomb" src="/landing/rhomb.webp" alt="">
    </aside>
  </div>
</template>

<style scoped>
.auth {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: var(--s4);
  height: 100%; padding: var(--s4); overflow-y: auto;
  font-size: 16px; line-height: 1.45; color: var(--ink); background: var(--bg);
}
.auth a { color: inherit; }
.side { position: relative; display: flex; flex-direction: column; min-height: 100%; padding: var(--s3) clamp(8px, 3vw, 40px); }
.top { display: flex; align-items: center; justify-content: space-between; height: 56px; }
.logo { display: inline-flex; align-items: center; min-height: 44px; gap: var(--s3); font-size: 24px; font-weight: 600; line-height: 1; letter-spacing: -0.03em; text-decoration: none; }
.logo svg { width: 30px; height: 30px; }
.ai { position: relative; top: -10px; margin-left: -4px; padding: 0 var(--s1); border-radius: var(--r-xs); background: var(--brand, #2f6bff); color: var(--on-brand, #fff); font-size: var(--fs-xs); font-weight: 700; line-height: 1.4; letter-spacing: 0.02em; }
.back { display: inline-flex; align-items: center; min-height: 44px; padding: 0 var(--s1); font-weight: 500; font-size: 15px; color: var(--ink-2) !important; text-decoration: none; }
.back:hover { color: var(--ink) !important; }

.box { width: 100%; max-width: 420px; margin: auto; padding: var(--s10) 0; }
.box > * { animation: rise var(--t-enter) var(--ease) both; }
.box > :nth-child(2) { animation-delay: 40ms; } .box > :nth-child(3) { animation-delay: 80ms; }
.box > :nth-child(4) { animation-delay: 120ms; } .box > :nth-child(5) { animation-delay: 160ms; }
.box > :nth-child(6) { animation-delay: 200ms; } .box > :nth-child(7) { animation-delay: 240ms; }
.box > :nth-child(8) { animation-delay: 280ms; }
.phone-art { display: none; }
.title { margin: 0; font-size: 40px; font-weight: 600; line-height: 1.08; letter-spacing: -0.03em; }
.sub { margin: var(--s2) 0 var(--s6); color: var(--ink-2); font-size: 17px; }
.mode { margin-bottom: var(--s5); }
.mode > button { height: 40px; font-size: 15px; }
.ids { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s3); }
.id { position: relative; display: flex; align-items: center; justify-content: center; gap: var(--s3); height: 52px; border-radius: var(--r-pill); border: 0; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform var(--t) var(--ease), filter var(--t) ease; }
.id:hover:not(:disabled) { filter: brightness(1.06); }
.id:active:not(:disabled) { transform: scale(.985); }
.id:disabled { cursor: default; }
.id:disabled:not(:has(.spin)) { opacity: .55; }
.id__logo { width: 28px; height: 28px; flex: none; }
.id--vk { background: #0077ff; color: #fff; }
.id--ya { background: var(--solid); color: var(--on-solid); }
.id .spin-in { position: absolute; right: 14px; }
@media (min-width: 961px) {
  .signup .box { padding: var(--s3) 0; }
  .signup .title { font-size: 36px; }
  .signup .sub { margin: var(--s2) 0 var(--s5); }
  .signup .mode { margin-bottom: var(--s4); }
  .signup .or { margin: var(--s4) 0; }
  .signup form { gap: var(--s3); }
  .signup .f { gap: var(--s1); }
  .signup .f input { height: 48px; }
  .signup .submit { height: 52px; }
  .signup .swap { margin-top: var(--s3); }
}
@media (min-width: 961px) and (max-height: 820px) {
  .auth { padding: var(--s2); }
  .side { padding-top: 0; padding-bottom: 0; }
  .top { height: 48px; }
  .box, .signup .box { padding: var(--s1) 0; }
  .title, .signup .title { font-size: 30px; }
  .sub, .signup .sub { margin: var(--s1) 0 var(--s3); font-size: 15px; }
  .mode, .signup .mode { margin-bottom: var(--s3); }
  .id { height: 46px; }
  .or, .signup .or { margin: var(--s3) 0; }
  form, .signup form { gap: var(--s2); }
  .f, .signup .f { gap: var(--s1); }
  .f input, .signup .f input { height: 44px; }
  .eye { top: 0; }
  .submit, .signup .submit { height: 48px; }
  .swap, .signup .swap { margin-top: var(--s2); }
  .signup .sub { display: none; }
  .signup .title { margin-bottom: var(--s3); }
}

.or { display: flex; align-items: center; gap: var(--s3); margin: var(--s5) 0; color: var(--muted); font-size: 14px; }
.or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
form { display: grid; gap: var(--s4); }
.f { display: grid; gap: var(--s2); }
.f__l { display: flex; justify-content: space-between; align-items: baseline; font-weight: 600; font-size: 14px; }
.f__link { position: relative; font-weight: 500; color: var(--lk) !important; text-decoration: none; }
.f__link::after { content: ''; position: absolute; left: -8px; right: -8px; top: 50%; height: 44px; translate: 0 -50%; }
.f__link:hover { text-decoration: underline; }
.f input { width: 100%; height: 52px; padding: 0 var(--s4); border: 1.5px solid var(--line-2); border-radius: var(--r); background: var(--card); font-size: 16px; color: var(--ink); outline: 0; transition: border-color var(--t) ease, box-shadow var(--t) ease; }
.f input::placeholder { color: var(--faint); }
.f input:hover { border-color: color-mix(in srgb, var(--ink) 24%, transparent); }
.f input:focus { border-color: var(--blue); box-shadow: 0 0 0 4px color-mix(in srgb, var(--blue) 16%, transparent); }
.f.bad input { border-color: var(--red); }
.f.bad input:focus { box-shadow: 0 0 0 4px color-mix(in srgb, var(--red) 14%, transparent); }
.f__e { min-height: 1.4em; color: var(--red); font-size: var(--fs-sm); }
.f__pw { position: relative; display: block; }
.f__pw input { padding-right: 52px; }
.f__ok { position: absolute; right: var(--s4); top: 50%; width: 20px; height: 20px; margin-top: -10px; color: var(--green); }
.f.good input { border-color: color-mix(in srgb, var(--green) 50%, transparent); }
.eye { position: absolute; right: var(--s1); top: var(--s1); display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: var(--r-sm); background: none; color: var(--muted); cursor: pointer; }
.eye:hover { color: var(--ink); background: var(--bg-2); }
.eye svg { width: 20px; height: 20px; }
.meter { display: flex; align-items: center; gap: var(--s1); min-height: 1.4em; }
.meter i { flex: 1; height: 4px; border-radius: var(--r-pill); background: var(--bg-3); transition: background-color var(--t) ease; }
.meter em { margin-left: var(--s2); font-style: normal; font-size: var(--fs-sm); color: var(--muted); min-width: 64px; text-align: right; }
.meter[data-s='1'] i.on { background: var(--red); }
.meter[data-s='2'] i.on { background: var(--amber); }
.meter[data-s='3'] i.on, .meter[data-s='4'] i.on { background: var(--green); }

.check { display: flex; align-items: flex-start; gap: var(--s3); font-size: 14px; color: var(--ink-2); cursor: pointer; }
.check input { position: absolute; opacity: 0; pointer-events: none; }
.check__box { display: grid; place-items: center; width: 22px; height: 22px; flex: none; margin-top: 1px; border: 1.5px solid var(--line-2); border-radius: var(--r-xs); background: var(--card); color: var(--on-accent, #fff); transition: background-color var(--t) ease, border-color var(--t) ease; }
.check__box svg { width: 14px; height: 14px; opacity: 0; transform: scale(.6); transition: opacity var(--t) ease, transform var(--t) var(--ease); }
.check input:checked + .check__box { background: var(--blue); border-color: var(--blue); }
.check input:checked + .check__box svg { opacity: 1; transform: none; }
.check input:focus-visible + .check__box { box-shadow: 0 0 0 4px color-mix(in srgb, var(--blue) 20%, transparent); }
.check.bad .check__box { border-color: var(--red); }
.check a { color: var(--ink) !important; text-decoration: underline; text-underline-offset: 2px; }

.submit { display: flex; align-items: center; justify-content: center; gap: var(--s3); height: 56px; margin-top: var(--s1); border: 0; border-radius: var(--r-pill); background: var(--solid); color: var(--on-solid); font-size: 17px; font-weight: 600; cursor: pointer; transition: transform var(--t) var(--ease), background-color var(--t) ease; }
.submit:hover:not(:disabled) { background: var(--solid-hover); }
.submit:active:not(:disabled) { transform: scale(.985); }
.submit:disabled { cursor: default; }
.swap { margin: var(--s5) 0 0; text-align: center; color: var(--ink-2); font-size: 15px; }
.swap button { min-height: 44px; border: 0; background: none; padding: 0 var(--s1); font-size: 15px; font-weight: 600; color: var(--lk); cursor: pointer; }
.swap button:hover { text-decoration: underline; }

.spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid color-mix(in srgb, currentColor 35%, transparent); border-top-color: currentColor; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.grow-enter-active, .grow-leave-active { transition: opacity var(--t-slow) var(--ease), transform var(--t-slow) var(--ease); }
.grow-enter-from, .grow-leave-to { opacity: 0; transform: translateY(-8px); }
.note { position: absolute; left: 50%; bottom: calc(var(--s6) + var(--safe-b)); z-index: var(--z-toast); display: flex; align-items: center; gap: var(--s3); width: max-content; max-width: min(560px, calc(100% - 32px)); padding: var(--s3) var(--s2) var(--s3) var(--s4); border-radius: var(--r); background: var(--solid); color: var(--on-solid); font-size: 15px; line-height: 1.35; box-shadow: var(--shadow-pop); transform: translateX(-50%); }
.note svg { width: 20px; height: 20px; flex: none; color: color-mix(in srgb, var(--on-solid) 68%, transparent); }
.note span { flex: 1; }
.note__go { flex: none; display: inline-flex; align-items: center; min-height: 36px; padding: 0 var(--s3); border-radius: var(--r-sm); background: color-mix(in srgb, var(--on-solid) 16%, transparent); color: var(--on-solid) !important; font-weight: 600; font-size: 14px; text-decoration: none; white-space: nowrap; }
.note__go:hover { background: color-mix(in srgb, var(--on-solid) 26%, transparent); }
@media (max-width: 960px) { .note { position: fixed; } }
@media (max-width: 520px) { .note { flex-wrap: wrap; padding-right: 48px; } .note__go { margin-left: var(--s8); } .note button { position: absolute; right: 6px; top: 6px; } }
.note button { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border: 0; border-radius: var(--r-sm); background: none; color: color-mix(in srgb, var(--on-solid) 68%, transparent); font-size: 22px; cursor: pointer; }
.note button:hover { color: var(--on-solid); background: color-mix(in srgb, var(--on-solid) 10%, transparent); }
.note-enter-active, .note-leave-active { transition: opacity var(--t-slow) var(--ease), transform var(--t-slow) var(--ease); }
.note-enter-from, .note-leave-to { opacity: 0; transform: translate(-50%, 16px); }
.art { position: relative; overflow: hidden; border-radius: var(--r-lg); background: #060607; isolation: isolate; min-height: 640px; }
.art img { position: absolute; display: block; user-select: none; pointer-events: none; }
.art__bg { inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 100%; z-index: -1; opacity: 0; transition: opacity 1.4s ease; }
.ready .art__bg { opacity: 1; }
.art__rings { left: 14%; width: 72%; top: 64%; opacity: 0; transform: scale(.6); transition: opacity 1s var(--ease) .2s, transform 1.4s var(--ease) .2s; animation: pulse 5s ease-in-out infinite; }
.art__grid { left: 26%; width: 48%; top: 22%; opacity: 0; transform: translateY(-60px) scale(.92); filter: blur(6px); transition: opacity 1s var(--ease) .45s, transform 1.4s var(--ease) .45s, filter 1s ease .45s; }
.art__page { right: 4%; width: 30%; top: 6%; opacity: 0; transform: translate(-40%, 40%) scale(.5) rotate(8deg); transition: opacity 1s var(--ease) .9s, transform 1.4s var(--ease) .9s; }
.art__disc { left: 8%; width: 13%; top: 14%; opacity: 0; transition: opacity 1s ease 1.2s; }
.art__rhomb { left: 10%; width: 14%; top: 56%; opacity: 0; transition: opacity 1s ease 1.3s; }
.ready .art__rings { opacity: 1; transform: none; }
.ready .art__grid { opacity: 1; transform: none; filter: none; }
.ready .art__page, .ready .art__disc, .ready .art__rhomb { opacity: 1; transform: none; }
.ready .art__grid { animation: float 6s ease-in-out 1.8s infinite; }
.ready .art__page { animation: float 8s ease-in-out 2.2s infinite; }
.ready .art__disc { animation: float 9s ease-in-out 1.4s infinite; }
.ready .art__rhomb { animation: float 7s ease-in-out 1.6s infinite; }
@keyframes float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -12px; } }
@keyframes pulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
@media (max-width: 960px) {
  .auth { grid-template-columns: 1fr; padding: 0; }
  .art { display: none; }
  .side { padding: var(--s2) var(--s5) calc(var(--s4) + var(--safe-b)); }
  .box { padding: var(--s3) 0 var(--s6); }
  .phone-art { display: block; width: 120px; margin: 0 auto var(--s2); }
  .phone-art img { width: 100%; animation: float 6s ease-in-out infinite; }
  .title { font-size: 32px; text-align: center; }
  .sub { text-align: center; font-size: 16px; margin-bottom: 22px; }
}
@media (prefers-reduced-motion: reduce) {
  .auth *, .auth *::before, .auth *::after { animation: none !important; transition: none !important; }
  .art img { opacity: 1 !important; transform: none !important; filter: none !important; }
}
</style>
