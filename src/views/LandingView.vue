<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isApi } from '../config'
import { authed } from '../api/auth'
import { ACCENTS, initials, state } from '../store'
import { useRouter } from 'vue-router'

const router = useRouter()
const root = ref<HTMLElement | null>(null)
const ready = ref(false)
const scrolled = ref(false)
const light = ref(false)
const current = ref('')
const sheet = ref(false)

const NAV = [
  { id: 'product', label: 'Продукт' },
  { id: 'how', label: 'Как это работает' },
  { id: 'checks', label: 'Проверки' },
  { id: 'results', label: 'Результаты' },
]

const FACTS = [
  { name: 'Voc', value: '1,08 В', label: 'Voc · оптимизированный' },
  { name: 'Jsc', value: '22,9 мА/см²', label: 'Jsc · оптимизированный' },
  { name: 'FF', value: '0,77', label: 'FF · оптимизированный' },
  { name: 'КПД', value: '19,0 %', label: 'КПД · оптимизированный' },
]
const active = ref(3)
const done = ref(4)
const flip = ref(0)
const linkD = ref('')
const dotA = ref({ x: 0, y: 0 })
const dotB = ref({ x: 0, y: 0 })
const app = ref<HTMLElement | null>(null)
let hover = false

const STATS = [
  { to: 11, suf: '', label: 'показателей' },
  { to: 7, suf: '', label: 'таблиц в наборе' },
  { to: 100, suf: '%', label: 'значений со страницей и цитатой' },
  { to: 0, suf: '', label: 'изменений в PDF' },
]
const shown = ref(STATS.map((s) => (s.to ? 0 : s.to)))

const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function go(id: string) {
  sheet.value = false
  root.value?.querySelector('#' + id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })
}
const signed = computed(() => isApi && authed.value)
const avaBg = computed(() => (ACCENTS[state.profile.color] ?? ACCENTS.graphite!).c[0])
function toApp() { router.push(signed.value ? '/app' : '/login') }
function signup() { router.push('/login?mode=signup') }
function upload() { router.push('/app') }

function offsetIn(el: HTMLElement, box: HTMLElement) {
  let x = 0, y = 0, n: HTMLElement | null = el
  while (n && n !== box) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null }
  return { x, y }
}
function drawLink() {
  const box = app.value
  if (!box) return
  const c = box.querySelector<HTMLElement>(`.cell[data-k="${active.value}"]`)
  const r = box.querySelector<HTMLElement>(`.frow[data-k="${active.value}"]`)
  if (!c || !r) return
  const a = offsetIn(c, box), b = offsetIn(r, box)
  const phone = window.innerWidth <= 720
  const bx = b.x + 6, by = b.y + r.offsetHeight / 2
  if (phone) {
    const ax = a.x + c.offsetWidth / 2, ay = a.y + c.offsetHeight
    linkD.value = `M${ax} ${ay} C ${ax} ${by - 60}, ${bx - 40} ${by}, ${bx} ${by}`
    dotA.value = { x: ax, y: ay }
  } else {
    const ax = a.x + c.offsetWidth - 6, ay = a.y + c.offsetHeight / 2
    linkD.value = `M${ax} ${ay} C ${ax + 70} ${ay}, ${bx - 80} ${by}, ${bx} ${by}`
    dotA.value = { x: ax, y: ay }
  }
  dotB.value = { x: bx, y: by }
}
function select(i: number) {
  active.value = i
  flip.value++
  requestAnimationFrame(drawLink)
}
function enter(i: number) { hover = true; select(i) }
function leave() { hover = false }

const stage = ref<HTMLElement | null>(null)
let mx = 0, my = 0
function parallax() {
  const s = stage.value, el = root.value
  if (!s || !el) return
  const sy = Math.min(el.scrollTop, el.clientHeight)
  for (const l of s.querySelectorAll<HTMLElement>('.L')) {
    const d = Number(l.dataset.depth)
    l.style.transform = `translate3d(${mx * d}px, ${my * d - (sy * d) / 90}px, 0)`
  }
}
function onPointer(e: PointerEvent) {
  if (e.pointerType !== 'mouse' || reduce) return
  mx = -(e.clientX / window.innerWidth - 0.5)
  my = -(e.clientY / window.innerHeight - 0.5)
  parallax()
}

function onScroll() {
  const el = root.value
  if (!el) return
  scrolled.value = el.scrollTop > 10
  const y = 40
  let tone = 'dark'
  for (const s of el.querySelectorAll<HTMLElement>('[data-tone]')) {
    const r = s.getBoundingClientRect()
    if (r.top <= y && r.bottom > y) tone = s.dataset.tone!
  }
  light.value = tone === 'light'
  let cur = ''
  for (const n of NAV) {
    const t = el.querySelector('#' + n.id)
    if (t && t.getBoundingClientRect().top < window.innerHeight * 0.4) cur = n.id
  }
  current.value = cur
  if (!reduce) parallax()
}

function countUp(i: number) {
  const to = STATS[i]!.to, t0 = performance.now(), dur = reduce ? 0 : 1600
  const step = (t: number) => {
    const p = dur ? Math.min(1, (t - t0) / dur) : 1
    shown.value[i] = Math.round(to * (1 - Math.pow(1 - p, 3)))
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

let io: IntersectionObserver | null = null
let timer = 0
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') sheet.value = false }

onMounted(() => {
  const el = root.value!
  document.title = 'Фактура AI — каждое число с доказательством'
  const bg = el.querySelector<HTMLImageElement>('.hero__bg img')
  const start = () => requestAnimationFrame(() => (ready.value = true))
  if (!bg || bg.complete) start()
  else { bg.addEventListener('load', start, { once: true }); setTimeout(start, 1200) }

  io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue
      const t = e.target as HTMLElement
      t.classList.add('in')
      io!.unobserve(t)
      if (t.dataset.stat != null) countUp(Number(t.dataset.stat))
    }
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' })
  el.querySelectorAll('[data-reveal], .app-wrap, .vt').forEach((n) => io!.observe(n))

  onScroll()
  select(3)
  document.fonts?.ready.then(drawLink)
  window.addEventListener('resize', drawLink)
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('keydown', onKey)

  if (!reduce) timer = window.setInterval(() => {
    if (hover || !el.querySelector('.app-wrap.in')) return
    select((active.value + 1) % 4)
    done.value = done.value >= 17 ? 4 : done.value + 1
  }, 2600)
})
onBeforeUnmount(() => {
  io?.disconnect()
  clearInterval(timer)
  window.removeEventListener('resize', drawLink)
  window.removeEventListener('pointermove', onPointer)
  window.removeEventListener('keydown', onKey)
  document.title = 'Фактура AI — факты из научных статей'
})
</script>

<template>
  <div ref="root" class="lp" :class="{ ready }" @scroll.passive="onScroll">
    <svg width="0" height="0" style="position: absolute" aria-hidden="true">
      <symbol id="lp-logo" viewBox="0 0 100 100">
        <g fill="currentColor"><circle cx="18" cy="18" r="9" /><circle cx="50" cy="18" r="9" /><circle cx="82" cy="18" r="9" /><circle cx="18" cy="50" r="9" /><circle cx="82" cy="50" r="9" /><circle cx="18" cy="82" r="9" /><circle cx="50" cy="82" r="9" /><circle cx="82" cy="82" r="9" /></g>
        <circle cx="50" cy="50" r="15" fill="#2f6bff" />
      </symbol>
    </svg>

    <header class="nav" :class="{ 'is-scrolled': scrolled, 'is-light': light }">
      <div class="wrap nav__in">
        <a class="logo" href="#top" aria-label="Фактура AI — наверх" @click.prevent="go('top')"><svg><use href="#lp-logo" /></svg>фактура<span class="logo__ai">AI</span></a>
        <nav class="nav__links" aria-label="Разделы">
          <a v-for="n in NAV" :key="n.id" :href="'#' + n.id" :class="{ 'is-on': current === n.id }" @click.prevent="go(n.id)">{{ n.label }}</a>
        </nav>
        <div class="nav__right">
          <template v-if="signed">
            <a class="nav__prof" href="/app" :title="state.profile.email" @click.prevent="toApp"><span class="nav__ava" :style="{ background: avaBg }">{{ initials(state.profile.name) }}</span><span class="nav__name">{{ state.profile.name }}</span></a>
            <a class="btn nav__cta" href="/app" @click.prevent="toApp">Открыть приложение</a>
          </template>
          <template v-else>
            <a class="nav__login" href="/login" @click.prevent="toApp">Войти</a>
            <a class="btn nav__cta" href="/login?mode=signup" @click.prevent="signup">Попробовать бесплатно</a>
          </template>
        </div>
        <button class="nav__burger" type="button" aria-label="Меню" :aria-expanded="sheet" @click="sheet = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h16M4 16h16" /></svg>
        </button>
      </div>
    </header>
    <div v-if="sheet" class="sheet" role="dialog" aria-modal="true" aria-label="Меню" @click.self="sheet = false">
      <div class="sheet__card">
        <button class="sheet__x" type="button" aria-label="Закрыть" @click="sheet = false">×</button>
        <a v-for="n in NAV" :key="n.id" :href="'#' + n.id" @click.prevent="go(n.id)">{{ n.label }}</a>
        <a v-if="signed" class="btn" href="/app" @click.prevent="toApp">Открыть приложение · {{ state.profile.name }}</a>
        <template v-else>
          <a href="/login" @click.prevent="toApp">Войти</a>
          <a class="btn" href="/login?mode=signup" @click.prevent="signup">Попробовать бесплатно</a>
        </template>
      </div>
    </div>

    <main>
      <section id="top" class="hero" data-tone="dark">
        <div class="hero__bg"><img src="/landing/hero-bg.webp" alt="" fetchpriority="high"></div>
        <div class="wrap hero__in">
          <div class="hero__text">
            <h1><span class="ln"><span>Каждое число —</span></span><span class="ln"><span>с доказательством</span></span></h1>
            <p class="hero__lead">Загрузите научные PDF — получите таблицы значений со ссылкой на место в статье. Солнечные элементы и RAG</p>
            <div class="hero__btns">
              <a class="btn btn--white" href="/app" @click.prevent="upload">Загрузить PDF</a>
            </div>
          </div>

          <div ref="stage" class="stage" aria-hidden="true">
            <div class="L L--rings" data-depth="6"><div class="E" style="--d: .25s"><img src="/landing/rings.webp" alt=""></div></div>
            <div class="L L--d1" data-depth="34"><div class="E" style="--d: 1.5s"><img src="/landing/disc.webp" alt=""></div></div>
            <div class="L L--c1" data-depth="26"><div class="E" style="--d: 1.7s"><img src="/landing/rhomb.webp" alt=""></div></div>
            <div class="L L--c2" data-depth="40"><div class="E" style="--d: 1.9s"><img src="/landing/cube.webp" alt=""></div></div>
            <div class="L L--p1" data-depth="22"><div class="E" style="--d: 1.1s"><img src="/landing/page-chart.webp" alt=""></div></div>
            <div class="L L--p2" data-depth="18"><div class="E" style="--d: 1.2s"><img src="/landing/page-table.webp" alt=""></div></div>
            <div class="L L--grid" data-depth="12"><div class="E" style="--d: .55s"><img src="/landing/hero-grid.webp" alt=""><i class="core" /></div></div>
            <div class="L L--p3" data-depth="28"><div class="E" style="--d: 1.3s"><img src="/landing/page-line.webp" alt=""></div></div>
            <div class="L L--d2" data-depth="46"><div class="E" style="--d: 1.6s"><img src="/landing/disc-2.webp" alt=""></div></div>
            <div class="L L--bust" data-depth="30"><div class="E" style="--d: 1.8s"><img src="/landing/bust-small.webp" alt=""></div></div>
          </div>
        </div>
        <div class="hero__chips"><span>PDF, папка или ZIP</span><span>Каждое число — со страницей и цитатой</span><span>Проверка противоречий</span><span>Скачать таблицы для сдачи</span></div>
      </section>

      <section id="product" class="sec product" data-tone="light">
        <div class="wrap">
          <div class="head">
            <p class="eyebrow" data-reveal>Продукт</p>
            <h2 class="h2" data-reveal style="--d: .08s">Каждое число — со ссылкой на источник</h2>
          </div>
          <div class="app-wrap">
            <div ref="app" class="app">
              <div class="app__rail">
                <svg class="lg"><use href="#lp-logo" /></svg>
                <i class="on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z" /></svg></i>
                <i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg></i>
                <i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M4 15h16M10 4v16" /></svg></i>
                <i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></svg></i>
                <span class="sp" />
                <i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg></i>
              </div>
              <div class="pdf">
                <div class="pdf__bar">
                  <span class="pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>Статья.pdf</span>
                  <span class="sp" />
                  <span class="pill">3 из 12</span>
                  <span class="pill">−&nbsp;&nbsp;100 %&nbsp;&nbsp;+</span>
                </div>
                <div class="serif">
                  <p class="x">Для изготовленных солнечных элементов измерены фотовольтаические параметры при стандартных условиях освещения. Результаты приведены в Таблице 2.</p>
                  <p class="cap"><b>Таблица 2.</b> Основные параметры солнечных элементов</p>
                  <table class="t">
                    <thead><tr><th>Образец</th><th><i>V</i><sub>oc</sub>, В</th><th><i>J</i><sub>sc</sub>, мА/см²</th><th>FF</th><th>КПД, %</th></tr></thead>
                    <tbody>
                      <tr><td>Контрольный</td><td>1,05</td><td>21,8</td><td>0,75</td><td>16,2</td></tr>
                      <tr>
                        <td>Оптимизир.</td>
                        <td v-for="(f, i) in FACTS" :key="f.name" class="cell" :class="{ on: active === i }" :data-k="i" @mouseenter="enter(i)" @mouseleave="leave" @click="select(i)">{{ f.value.split(' ')[0] }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p class="after">Как видно из Таблицы 2, оптимизированный элемент демонстрирует КПД 19,0 %, что на 2,8 п.п. выше, чем у контрольного образца.</p>
                </div>
                <span class="pg">3</span>
              </div>
              <div class="facts">
                <h3>Факты</h3>
                <div class="prog"><span>Проверено <b>{{ done }}</b> из 17</span><span class="prog__bar"><i :style="{ width: (done / 17) * 100 + '%' }" /></span></div>
                <div v-for="(f, i) in FACTS" :key="f.name" class="frow" :class="{ on: active === i }" :data-k="i" @mouseenter="enter(i)" @mouseleave="leave" @click="select(i)">
                  <span>{{ f.name }}</span><b>{{ f.value }}</b><span class="ok">✓</span>
                </div>
                <div class="big"><small>{{ FACTS[active]!.label }}</small><strong :key="flip" class="flip">{{ FACTS[active]!.value }}</strong></div>
                <div class="acts"><span>Принять</span><span>Исправить</span><span>Отклонить</span></div>
              </div>
              <svg class="link"><path :d="linkD" /><circle :cx="dotA.x" :cy="dotA.y" r="6" /><circle :cx="dotB.x" :cy="dotB.y" r="6" /></svg>
            </div>
            <div class="tile" data-reveal="scale" style="--d: .5s"><img src="/landing/check-tile.webp" alt=""></div>
            <div class="remark" data-reveal="left" style="--d: .7s"><span class="dot" />Текст противоречит <br>таблице</div>
          </div>
        </div>
      </section>

      <section id="how" class="sec how" data-tone="light">
        <div class="wrap">
          <h2 class="h2" data-reveal>Три шага от PDF<br>до проверенных данных</h2>
          <div class="steps">
            <article class="step" data-reveal>
              <div class="step__img"><img src="/landing/step-1.webp" alt="" loading="lazy"></div>
              <div class="step__n">01</div><h3>Загрузите статьи</h3><p>PDF по одному, папкой или ZIP</p>
            </article>
            <article class="step" data-reveal style="--d: .12s">
              <div class="step__img"><img src="/landing/step-2.webp" alt="" loading="lazy"></div>
              <div class="step__n">02</div><h3>Проверьте значения</h3><p>У каждого числа страница и цитата — принять, исправить, отклонить</p>
            </article>
            <article class="step" data-reveal style="--d: .24s">
              <div class="step__img"><img src="/landing/step-3.webp" alt="" loading="lazy"></div>
              <div class="step__n">03</div><h3>Скачайте набор данных</h3><p>7 таблиц для сдачи, Excel, JSON</p>
            </article>
          </div>
        </div>
      </section>

      <section id="checks" class="sec checks" data-tone="dark">
        <div class="wrap checks__in">
          <div class="bust" data-reveal="bust"><img src="/landing/bust-big.webp" alt="" loading="lazy"><i class="halo" /></div>
          <div>
            <h2 class="h2" data-reveal>Находит то, что люди пропускают</h2>
            <ul class="clist">
              <li data-reveal style="--d: .1s"><img src="/landing/icon-text-table.webp" alt="" loading="lazy">Текст противоречит таблице</li>
              <li data-reveal style="--d: .2s"><img src="/landing/icon-calc.webp" alt="" loading="lazy">КПД не сходится с Voc × Jsc × FF</li>
              <li data-reveal style="--d: .3s"><img src="/landing/icon-record.webp" alt="" loading="lazy">Voc выше ширины запрещённой зоны</li>
              <li data-reveal style="--d: .4s"><img src="/landing/icon-flask.webp" alt="" loading="lazy">Условия измерения не указаны</li>
            </ul>
            <div class="vt" role="img" aria-label="Таблица результатов: у каждого значения страница, одна строка подсвечена замечанием проверки">
              <div class="vt__h"><span>Показатель</span><span>Значение</span><span>Стр.</span></div>
              <div class="vt__r" style="--d: .15s"><span>Voc</span><b>1,08 В</b><i>стр. 3</i></div>
              <div class="vt__r" style="--d: .3s"><span>Jsc</span><b>22,9 мА/см²</b><i>стр. 3</i></div>
              <div class="vt__r" style="--d: .45s"><span>FF</span><b>0,77</b><i>стр. 3</i></div>
              <div class="vt__r vt__r--bad" style="--d: .6s"><span>КПД</span><b>21,4 %</b><i>стр. 4</i></div>
              <div class="vt__rule" style="--d: .9s"><span class="dot" />КПД не сходится с Voc·Jsc·FF</div>
            </div>
          </div>
        </div>
      </section>

      <section id="results" class="sec results" data-tone="light">
        <div class="wrap">
          <div class="stats">
            <div v-for="(s, i) in STATS" :key="s.label" class="stat" data-reveal :data-stat="i" :style="{ '--d': i * 0.1 + 's' }">
              <b>{{ shown[i] }}<small v-if="s.suf">{{ s.suf }}</small></b><span>{{ s.label }}</span>
            </div>
          </div>
          <div class="cta" data-reveal="scale" data-tone="dark">
            <div>
              <h2 class="h2">Попробуйте<br>на своих статьях</h2>
              <p>Загрузите PDF — получите таблицу<br>значений с источниками</p>
              <a class="btn btn--white" href="/app" @click.prevent="upload">Загрузить PDF</a>
            </div>
            <div class="cta__img"><img src="/landing/cta-grid.webp" alt="" loading="lazy"></div>
          </div>
        </div>
      </section>
    </main>

    <footer class="foot" data-tone="light">
      <div class="wrap foot__in">
        <a class="logo" href="#top" @click.prevent="go('top')"><svg><use href="#lp-logo" /></svg>фактура<span class="logo__ai">AI</span></a>
        <div><h4>Продукт</h4><a href="#how" @click.prevent="go('how')">Как это работает</a></div>
        <div><h4>Возможности</h4><a href="#checks" @click.prevent="go('checks')">Проверки</a><a href="#results" @click.prevent="go('results')">Результаты</a></div>
        <div><h4>Приложение</h4><a v-if="signed" href="/app" @click.prevent="toApp">Открыть приложение</a><template v-else><a href="/login" @click.prevent="toApp">Войти</a><a href="/login?mode=signup" @click.prevent="signup">Попробовать бесплатно</a></template></div>
        <small>© 2026 Фактура AI</small>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.lp {
  --blue: #2f6bff;
  --dark: #060607;
  --light: #f1f2f4;
  --ink: #0b0b0c; --ink-2: #55575e; --ink-3: #8a8d95;
  --on-dark: #f4f4f5; --on-dark-2: #a3a5ad;
  --line: rgba(11, 11, 12, .08); --line-d: rgba(255, 255, 255, .1);
  --r: 28px; --gut: clamp(20px, 4vw, 56px);
  --ease: cubic-bezier(.2, .8, .2, 1);
  --font: 'Inter Tight', system-ui, -apple-system, 'Segoe UI', sans-serif;
  height: 100%; overflow-y: auto; overflow-x: hidden; scroll-padding-top: 80px;
  font: 400 17px/1.5 var(--font); color: var(--ink); background: var(--light);
  -webkit-font-smoothing: antialiased; overscroll-behavior-y: none;
}
.lp * { box-sizing: border-box; }
.lp img { display: block; max-width: 100%; user-select: none; -webkit-user-drag: none; }
.lp a { color: inherit; text-decoration: none; }
.wrap { max-width: 1320px; margin: 0 auto; padding: 0 var(--gut); }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; height: 60px; padding: 0 34px; border-radius: 999px; font: 600 18px var(--font); cursor: pointer; border: 1.5px solid transparent; background: none; color: inherit; transition: transform .25s var(--ease), background .25s, border-color .25s, box-shadow .25s; white-space: nowrap; }
.btn:hover { transform: translateY(-2px); }
.btn:active { transform: translateY(0) scale(.98); }
.btn--white { background: #fff; color: var(--ink) !important; box-shadow: 0 10px 30px -12px rgba(255, 255, 255, .45); }
.btn--white:hover { box-shadow: 0 16px 40px -12px rgba(255, 255, 255, .6); }
.btn--ghost { color: var(--on-dark); border-color: rgba(255, 255, 255, .55); }
.btn--ghost:hover { border-color: #fff; background: rgba(255, 255, 255, .06); }
.btn svg { width: 18px; height: 18px; }
.lp :focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.nav { position: fixed; inset: 0 0 auto; z-index: 50; color: var(--on-dark); transition: background .35s, color .35s, box-shadow .35s; }
.nav__in { display: flex; align-items: center; gap: 32px; height: 84px; transition: height .35s var(--ease); }
.nav.is-scrolled .nav__in { height: 68px; }
.nav.is-scrolled { background: rgba(6, 6, 7, .62); backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4); box-shadow: 0 1px 0 var(--line-d); }
.nav.is-light { color: var(--ink); }
.nav.is-light.is-scrolled { background: rgba(241, 242, 244, .74); box-shadow: 0 1px 0 var(--line); }
.logo { display: inline-flex; align-items: center; gap: 12px; font: 700 26px/1 var(--font); letter-spacing: -.03em; }
.logo svg { width: 34px; height: 34px; flex: none; }
.logo__ai { position: relative; top: -12px; margin-left: -6px; padding: 2px 6px; border-radius: 6px; background: var(--blue); color: #fff; font: 700 12px/1.2 var(--font); letter-spacing: 0; }
.nav__links { display: flex; gap: 6px; margin: 0 auto; }
.nav__links a { white-space: nowrap; position: relative; padding: 10px 16px; font-weight: 500; font-size: 16px; opacity: .72; transition: opacity .2s; }
.nav__links a:hover, .nav__links a.is-on { opacity: 1; }
.nav__links a.is-on::after { content: ''; position: absolute; left: 50%; bottom: 2px; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: var(--blue); }
.nav__right { display: flex; align-items: center; gap: 12px; }
.nav__login { padding: 10px 14px; font-weight: 600; font-size: 16px; }
.nav__prof { display: inline-flex; align-items: center; gap: 10px; padding: 6px 12px 6px 6px; border-radius: 999px; font-weight: 600; font-size: 15px; max-width: 220px; }
.nav__ava { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; color: #fff; font-size: 12px; font-weight: 600; }
.nav__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav__cta { height: 46px; padding: 0 22px; font-size: 16px; background: #fff; color: var(--ink) !important; box-shadow: 0 6px 20px -8px rgba(0, 0, 0, .25); }
.nav.is-light .nav__cta { box-shadow: 0 0 0 1px var(--line), 0 6px 20px -10px rgba(0, 0, 0, .2); }
.nav__burger { display: none; width: 46px; height: 46px; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
.nav__burger svg { width: 24px; height: 24px; }
[data-reveal] { opacity: 0; transform: translateY(36px); transition: opacity .9s var(--ease), transform 1.1s var(--ease); transition-delay: var(--d, 0s); }
[data-reveal].in { opacity: 1; transform: none; }
[data-reveal='scale'] { transform: translateY(40px) scale(.94); }
[data-reveal='left'] { transform: translateX(-48px); }
.h2[data-reveal] { transform: translateY(44px); filter: blur(10px); letter-spacing: 0; transition: opacity 1s var(--ease), transform 1.2s var(--ease), filter 1.1s ease, letter-spacing 1.4s var(--ease); transition-delay: var(--d, 0s); }
.h2[data-reveal].in { opacity: 1; transform: none; filter: none; letter-spacing: -.03em; }
.step .step__img { opacity: 0; transform: translateY(40px) scale(.7) rotate(-8deg); transition: opacity .9s var(--ease), transform 1.3s cubic-bezier(.34, 1.56, .64, 1); transition-delay: calc(var(--d, 0s) + .25s); }
.step.in .step__img { opacity: 1; transform: none; }
.step .step__n { opacity: 0; transform: translateX(-16px); transition: opacity .8s var(--ease), transform .8s var(--ease); transition-delay: calc(var(--d, 0s) + .45s); }
.step.in .step__n { opacity: 1; transform: none; }
.clist li img { opacity: 0; transform: scale(.4) rotate(-20deg); transition: opacity .7s var(--ease), transform 1s cubic-bezier(.34, 1.56, .64, 1); transition-delay: calc(var(--d, 0s) + .15s); }
.clist li.in img { opacity: 1; transform: none; }
.clist li.in:hover img { transform: scale(1.08) rotate(-4deg); filter: drop-shadow(0 0 18px rgba(47, 107, 255, .6)); }
.cta .cta__img { opacity: 0; transform: translateY(80px) scale(.85); filter: blur(12px) brightness(1.6); transition: opacity 1.2s var(--ease) .3s, transform 1.6s var(--ease) .3s, filter 1.4s ease .3s; }
.cta.in .cta__img { opacity: 1; transform: none; filter: none; }
.stat b { transition: color .6s; }

@keyframes float { 0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--r0, 0deg)); } 50% { transform: translate3d(0, var(--fy, -14px), 0) rotate(calc(var(--r0, 0deg) + var(--fr, 2deg))); } }
.hero { position: relative; min-height: max(100svh, 760px); background: var(--dark); color: var(--on-dark); overflow: hidden; isolation: isolate; }
.hero__bg { position: absolute; inset: 0; z-index: -2; }
.hero__bg img { width: 100%; height: 100%; max-width: none; object-fit: cover; object-position: 50% 100%; opacity: 0; transform: scale(1.08); transition: opacity 1.6s ease, transform 2.4s var(--ease); }
.ready .hero__bg img { opacity: 1; transform: scale(1); }
.hero__bg::after { content: ''; position: absolute; inset: 0; background: radial-gradient(60% 50% at 70% 50%, rgba(47, 107, 255, .16), transparent 70%), linear-gradient(180deg, rgba(6, 6, 7, .7) 0%, transparent 30%, transparent 75%, var(--dark) 100%); }
.hero__in { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 24px; min-height: max(100svh, 760px); padding-top: 96px; padding-bottom: 120px; }
.hero__text { container-type: inline-size; min-width: 0; }
.hero h1 { margin: 0; font: 700 min(clamp(40px, 4.7vw, 76px), 10cqw)/1.04 var(--font); letter-spacing: -.035em; }
.hero h1 .ln { display: block; overflow: visible clip; padding-bottom: .08em; }
.hero h1 .ln > span { display: inline-block; white-space: nowrap; transform: translateY(105%); transition: transform 1.1s var(--ease); }
.ready .hero h1 .ln > span { transform: none; }
.ready .hero h1 .ln:nth-child(2) > span { transition-delay: .12s; }
.hero__chips { position: absolute; left: 0; right: 0; bottom: 36px; display: flex; justify-content: center; flex-wrap: wrap; gap: 6px 4px; font-size: 18px; color: var(--on-dark-2); opacity: 0; transition: opacity 1.2s ease 1.6s; }
.ready .hero__chips { opacity: 1; }
.hero__chips span + span::before { content: '·'; margin: 0 14px; opacity: .5; }
.hero__lead { max-width: 560px; margin: 28px 0 44px; font-size: clamp(18px, 1.5vw, 22px); line-height: 1.45; color: var(--on-dark-2); }
.hero__btns { display: flex; flex-wrap: wrap; gap: 16px; }
.hero__lead, .hero__btns { opacity: 0; transform: translateY(18px); transition: opacity 1s var(--ease) .45s, transform 1s var(--ease) .45s; }
.hero__btns { transition-delay: .6s; }
.ready .hero__lead, .ready .hero__btns { opacity: 1; transform: none; }

.stage { position: relative; width: 100%; aspect-ratio: 1 / .94; max-width: 760px; justify-self: end; }
.L { position: absolute; will-change: transform; transition: transform .9s cubic-bezier(.2, .7, .2, 1); }
.L .E { width: 100%; height: 100%; opacity: 0; transform: var(--from, translateY(30px)); filter: blur(8px); transition: opacity 1s var(--ease), transform 1.4s var(--ease), filter 1.2s ease; transition-delay: var(--d, 0s); }
.ready .L .E { opacity: 1; transform: none; filter: none; }
.L img { width: 100%; animation: float var(--t, 7s) ease-in-out infinite; }
.L--rings { left: 10%; top: 68%; width: 80%; z-index: 1; }
.L--rings .E { --from: scale(.5); }
.L--rings img { animation: rings-pulse 5s ease-in-out infinite; }
@keyframes rings-pulse { 0%, 100% { filter: brightness(1); transform: scale(1); } 50% { filter: brightness(1.35); transform: scale(1.03); } }
.L--grid { left: 28%; top: 24%; width: 44%; z-index: 4; }
.L--grid .E { --from: translateY(-90px) scale(.9); }
.L--grid img { --fy: -10px; --fr: 0deg; --t: 6s; }
.core { position: absolute; left: 50%; top: 50%; width: 30%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, rgba(47, 107, 255, .75), rgba(47, 107, 255, 0) 70%); mix-blend-mode: screen; pointer-events: none; transform: translate(-50%, -50%); animation: core 3.2s ease-in-out 2.2s infinite; opacity: .25; }
@keyframes core { 0%, 100% { opacity: .25; transform: translate(-50%, -50%) scale(.9); } 50% { opacity: .9; transform: translate(-50%, -50%) scale(1.25); } }
.L--p1 { left: 0; top: 2%; width: 30%; z-index: 3; }
.L--p1 .E { --from: translate(70%, 70%) scale(.4) rotate(-12deg); }
.L--p1 img { --r0: -4deg; --fy: -16px; --t: 8s; }
.L--p2 { left: 62%; top: -4%; width: 36%; z-index: 3; }
.L--p2 .E { --from: translate(-50%, 70%) scale(.4) rotate(10deg); }
.L--p2 img { --r0: 3deg; --fy: -12px; --t: 7.4s; }
.L--p3 { left: 76%; top: 30%; width: 26%; z-index: 5; }
.L--p3 .E { --from: translate(-70%, 0) scale(.4); }
.L--p3 img { --r0: 2deg; --fy: -18px; --t: 8.6s; }
.L--d1 { left: 44%; top: 4%; width: 10%; z-index: 2; }
.L--d1 img { --r0: -22deg; --fr: 14deg; --t: 9s; }
.L--d2 { left: 0; top: 64%; width: 12%; z-index: 6; }
.L--d2 img { --r0: 8deg; --fr: -10deg; --t: 10s; --fy: -22px; }
.L--c1 { left: 4%; top: 46%; width: 12%; z-index: 2; }
.L--c1 img { --r0: 18deg; --fr: 20deg; --t: 7s; }
.L--c2 { left: 70%; top: 70%; width: 6%; z-index: 2; }
.L--c2 img { --r0: -14deg; --fr: -24deg; --t: 6.2s; }
.L--bust { left: 82%; top: 64%; width: 22%; z-index: 6; }
.L--bust .E { --from: translateY(60px); }
.L--bust img { --fy: -8px; --fr: 0deg; --t: 9s; }
.sec { position: relative; padding: clamp(96px, 12vw, 160px) 0; }
.eyebrow { margin: 0 0 18px; font: 600 15px/1 var(--font); letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3); }
.h2 { margin: 0; font: 700 clamp(34px, 4.2vw, 62px)/1.06 var(--font); letter-spacing: -.03em; }
.product { background: var(--light); overflow: hidden; }
.product .head { text-align: center; }
.app-wrap { position: relative; max-width: 1180px; margin: clamp(56px, 7vw, 96px) auto 0; perspective: 2200px; }
.app { position: relative; display: grid; grid-template-columns: 76px minmax(0, 1.55fr) minmax(0, 1fr); border-radius: 26px; background: #fff; box-shadow: 0 0 0 1px rgba(11, 11, 12, .05), 0 60px 120px -40px rgba(20, 30, 60, .35), 0 30px 60px -30px rgba(20, 30, 60, .25); transform: rotateX(18deg) rotateY(-10deg) rotateZ(3deg) scale(.92); transform-origin: 50% 60%; opacity: 0; transition: transform 1.6s var(--ease), opacity 1s ease; }
.app-wrap.in .app { transform: rotateX(8deg) rotateY(-5deg) rotateZ(1.2deg); opacity: 1; }
.app__rail { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 26px 0; border-radius: 26px 0 0 26px; background: #111113; color: #8b8d94; }
.app__rail .lg { width: 34px; height: 34px; margin-bottom: 18px; color: #fff; }
.app__rail i { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; }
.app__rail i.on { background: #232327; color: #fff; }
.app__rail i svg { width: 22px; height: 22px; }
.app__rail .sp { flex: 1; }
.pdf { position: relative; padding: 22px 34px 44px; border-right: 1px solid var(--line); }
.pdf__bar { display: flex; align-items: center; gap: 10px; margin: 0 -10px 26px; font-size: 15px; color: var(--ink-2); }
.pill { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px; border-radius: 10px; background: #f3f4f6; font-weight: 500; white-space: nowrap; }
.pill svg { width: 16px; height: 16px; }
.pdf__bar .sp { flex: 1; }
.serif { font: 400 18px/1.6 'Times New Roman', 'PT Serif', Georgia, serif; color: #1c1c1f; }
.serif p { margin: 0 0 18px; }
.serif .after { margin: 22px 0 0; }
.cap { margin: 26px 0 10px !important; }
.t { width: 100%; border-collapse: collapse; font: 400 17px 'Times New Roman', Georgia, serif; }
.t th, .t td { padding: 9px 10px; border: 1px solid #1c1c1f; text-align: center; white-space: nowrap; }
.t th:first-child, .t td:first-child { text-align: left; }
.t th { font-weight: 400; }
.t td.cell { cursor: pointer; transition: background .3s; }
.t td.cell:hover { background: #eef3ff; }
.t td.cell.on { background: #dbe6ff; box-shadow: inset 0 0 0 2px var(--blue); }
.pg { position: absolute; left: 0; right: 0; bottom: 14px; text-align: center; font: 15px Georgia, serif; color: #333; }
.facts { display: flex; flex-direction: column; padding: 28px 26px 26px; }
.facts h3 { margin: 0 0 18px; font: 700 26px var(--font); letter-spacing: -.02em; }
.prog { display: flex; align-items: center; gap: 12px; font-size: 15px; color: var(--ink-2); }
.prog b { color: var(--ink); font-weight: 500; }
.prog__bar { flex: 1; height: 6px; border-radius: 6px; background: #eceef2; overflow: hidden; }
.prog__bar i { display: block; height: 100%; border-radius: 6px; background: var(--blue); transition: width .8s var(--ease); }
.frow { display: grid; grid-template-columns: 64px 1fr 22px; align-items: center; height: 50px; margin: 0 -10px; padding: 0 12px; border-radius: 12px; font-size: 16px; cursor: pointer; transition: background .3s; }
.frow:first-of-type { margin-top: 14px; }
.frow b { font-weight: 600; }
.frow .ok { color: var(--ink-3); transition: color .3s; }
.frow:hover { background: #f5f7fb; }
.frow.on { background: #e5edff; }
.frow.on .ok { color: var(--blue); }
.big { margin: 18px 0; padding: 22px 26px; border-radius: 18px; background: linear-gradient(135deg, #e7eeff, #f2f6ff); }
.big small { display: block; font-size: 14px; color: var(--ink-2); }
.big strong { display: block; margin-top: 4px; font: 700 50px/1.05 var(--font); letter-spacing: -.03em; white-space: nowrap; }
.flip { animation: flip .5s var(--ease); }
@keyframes flip { from { opacity: 0; transform: translateY(12px); } }
.acts { display: flex; gap: 10px; margin-top: auto; }
.acts span { flex: 1; display: grid; place-items: center; height: 46px; border-radius: 12px; background: #f1f2f5; font-weight: 600; font-size: 15px; }
.acts span:first-child { background: var(--blue); color: #fff; box-shadow: 0 8px 20px -8px rgba(47, 107, 255, .7); }
.link { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 3; }
.link path { fill: none; stroke: var(--blue); stroke-width: 3; stroke-linecap: round; filter: drop-shadow(0 2px 6px rgba(47, 107, 255, .45)); }
.link circle { fill: #fff; stroke: var(--blue); stroke-width: 3; }
.tile { position: absolute; right: -3%; top: -9%; width: clamp(110px, 13vw, 180px); z-index: 6; }
.tile img { --fy: -14px; --fr: 3deg; animation: float 6.5s ease-in-out infinite; filter: drop-shadow(0 30px 40px rgba(47, 107, 255, .25)); }
.remark { position: absolute; left: -3%; bottom: -6%; z-index: 6; display: flex; align-items: center; gap: 18px; padding: 26px 34px 26px 26px; border-radius: 22px; background: rgba(255, 255, 255, .55); backdrop-filter: blur(16px) saturate(1.6); -webkit-backdrop-filter: blur(16px) saturate(1.6); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .95), inset 0 0 0 1px rgba(255, 255, 255, .6), 0 30px 60px -20px rgba(20, 30, 60, .35); font: 600 clamp(17px, 1.7vw, 24px)/1.15 var(--font); letter-spacing: -.01em; rotate: 4deg; }
.dot { position: relative; width: 22px; height: 22px; flex: none; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ff8a8a, #e11d2a 60%, #a1101a); box-shadow: 0 4px 12px rgba(225, 29, 42, .5); }
.dot::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid rgba(225, 29, 42, .45); animation: ping 2s ease-out infinite; }
@keyframes ping { from { transform: scale(.6); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
.how { padding-top: 0; background: var(--light); }
.steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin-top: clamp(48px, 6vw, 80px); }
.step { display: flex; flex-direction: column; padding: 28px 36px 40px; border-radius: var(--r); background: linear-gradient(180deg, #fff, #fafbfc); box-shadow: 0 0 0 1px rgba(11, 11, 12, .04), 0 30px 60px -36px rgba(20, 30, 60, .3); transition: transform .5s var(--ease), box-shadow .5s var(--ease), opacity .9s var(--ease); }
.step.in:hover { transform: translateY(-6px); box-shadow: 0 0 0 1px rgba(11, 11, 12, .05), 0 40px 70px -36px rgba(20, 30, 60, .38); }
.step__img { position: relative; display: grid; place-items: center; height: clamp(220px, 21vw, 290px); }
.step__img::after { content: ''; position: absolute; left: 20%; right: 20%; bottom: 2%; height: 14%; border-radius: 50%; background: radial-gradient(closest-side, rgba(47, 107, 255, .2), transparent); filter: blur(6px); }
.step__img img { position: absolute; inset: 0; z-index: 1; height: 100%; width: 100%; object-fit: contain; --fy: -10px; --fr: 0deg; animation: float 7s ease-in-out infinite; }
.step:nth-child(2) .step__img img { animation-delay: -2s; }
.step:nth-child(3) .step__img img { animation-delay: -4s; }
.step__n { margin-top: 18px; font: 700 50px/1 var(--font); letter-spacing: -.03em; color: #c9cbd1; }
.step h3 { margin: 10px 0 8px; font: 700 28px/1.1 var(--font); letter-spacing: -.025em; }
.step p { margin: 0; font-size: 18px; line-height: 1.45; color: var(--ink-2); }
.checks { background: var(--dark); color: var(--on-dark); overflow: hidden; isolation: isolate; }
.checks::before { content: ''; position: absolute; left: -10%; top: 0; width: 70%; height: 100%; background: radial-gradient(50% 45% at 40% 40%, rgba(47, 107, 255, .2), transparent 70%); z-index: -1; }
.checks__in { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 40px; align-items: center; }
.bust { position: relative; margin-left: calc(-1 * var(--gut)); }
.bust img { width: 100%; max-width: 620px; -webkit-mask-image: linear-gradient(180deg, #000 78%, transparent); mask-image: linear-gradient(180deg, #000 78%, transparent); --fy: -12px; --fr: 0deg; animation: float 9s ease-in-out infinite, halo 4s ease-in-out infinite; }
@keyframes halo { 0%, 100% { filter: drop-shadow(0 0 0 rgba(47, 107, 255, 0)) brightness(1); } 50% { filter: drop-shadow(0 0 28px rgba(47, 107, 255, .55)) brightness(1.06); } }
.halo { position: absolute; left: 10%; top: 0; width: 70%; height: 30%; border-radius: 50%; background: radial-gradient(closest-side, rgba(47, 107, 255, .35), transparent); filter: blur(20px); opacity: 0; transition: opacity 1.6s ease .8s; pointer-events: none; z-index: -1; }
.bust.in .halo { opacity: 1; animation: core-b 4s ease-in-out infinite 2s; }
@keyframes core-b { 0%, 100% { opacity: .6; } 50% { opacity: 1; } }
[data-reveal='bust'] { opacity: 0; transform: translateY(80px) scale(.94); filter: blur(10px); transition: opacity 1.4s var(--ease), transform 1.8s var(--ease), filter 1.4s ease; }
[data-reveal='bust'].in { opacity: 1; transform: none; filter: none; }
.clist { list-style: none; margin: 44px 0 0; padding: 0; display: grid; gap: 16px; }
.clist li { display: flex; align-items: center; gap: 24px; font-size: clamp(18px, 1.7vw, 25px); font-weight: 500; }
.clist img { width: 68px; height: 68px; flex: none; transition: transform .4s var(--ease), filter .4s; }
.vt { position: relative; width: 100%; max-width: 640px; margin-top: 48px; padding: 14px; border-radius: 22px; background: linear-gradient(180deg, rgba(255, 255, 255, .09), rgba(255, 255, 255, .03)); box-shadow: inset 0 0 0 1px rgba(200, 215, 255, .22), 0 30px 80px -30px rgba(47, 107, 255, .45); backdrop-filter: blur(14px); }
.vt__h, .vt__r { display: grid; grid-template-columns: 1fr 1.4fr .7fr; gap: 12px; align-items: center; padding: 12px 16px; }
.vt__h { font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: var(--on-dark-2); }
.vt__r { border-radius: 12px; font-size: clamp(16px, 1.4vw, 20px); opacity: 0; transform: translateY(14px); transition: opacity .8s var(--ease), transform .9s var(--ease); transition-delay: var(--d, 0s); }
.vt__r + .vt__r { border-top: 1px solid rgba(255, 255, 255, .08); }
.vt__r b { font-weight: 600; font-variant-numeric: tabular-nums; }
.vt__r i { font-style: normal; color: var(--on-dark-2); font-size: .85em; }
.vt__r--bad { background: rgba(47, 107, 255, .2); box-shadow: inset 0 0 0 1px rgba(120, 160, 255, .6), 0 0 28px rgba(47, 107, 255, .35); }
.vt__rule { display: inline-flex; align-items: center; gap: 10px; margin: 12px 0 2px 16px; padding: 10px 16px 10px 12px; border-radius: 999px; background: #fff; color: var(--ink); font-size: 15px; font-weight: 600; opacity: 0; transform: translateY(10px) scale(.94); transition: opacity .8s var(--ease), transform .9s var(--ease); transition-delay: var(--d, 0s); }
.vt__rule .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 0 4px rgba(47, 107, 255, .2); flex: none; }
.vt.in .vt__r, .vt.in .vt__rule { opacity: 1; transform: none; }
.results { padding-bottom: 0; background: var(--light); }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.stat { padding: 0 32px; }
.stat:first-child { padding-left: 0; }
.stat + .stat { border-left: 1px solid rgba(11, 11, 12, .1); }
.stat { container-type: inline-size; min-width: 0; }
.stat b { display: block; white-space: nowrap; font: 700 min(clamp(48px, 5vw, 80px), 34cqw)/1 var(--font); letter-spacing: -.03em; font-variant-numeric: lining-nums proportional-nums; }
.stat b small { margin-left: .04em; font-size: .5em; font-weight: 600; vertical-align: .62em; letter-spacing: 0; color: var(--ink-3); }
.stat span { display: block; margin-top: 10px; font-size: clamp(16px, 1.5vw, 22px); color: var(--ink-3); }
.cta { position: relative; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); align-items: center; gap: 24px; margin-top: clamp(64px, 8vw, 110px); padding: clamp(40px, 5vw, 72px); border-radius: 36px; background: #050506; color: var(--on-dark); overflow: hidden; isolation: isolate; }
.cta::before { content: ''; position: absolute; right: -10%; bottom: -30%; width: 70%; height: 120%; background: radial-gradient(closest-side, rgba(47, 107, 255, .28), transparent); z-index: -1; }
.cta .h2 { font-size: clamp(40px, 4.6vw, 70px); }
.cta p { margin: 24px 0 40px; font-size: clamp(18px, 1.6vw, 24px); line-height: 1.35; color: var(--on-dark-2); }
.cta__img img { width: 100%; max-width: 440px; margin: 0 auto; --fy: -12px; --fr: 0deg; animation: float 7s ease-in-out infinite; }
.foot { padding: clamp(56px, 6vw, 80px) 0 48px; background: var(--light); }
.foot__in { display: grid; grid-template-columns: 1.2fr repeat(3, minmax(0, 1fr)) auto; gap: 32px; align-items: start; }
.foot h4 { margin: 0 0 12px; font: 700 17px var(--font); }
.foot__in div a { display: block; padding: 4px 0; color: var(--ink-2); transition: color .2s; }
.foot__in div a:hover { color: var(--ink); }
.foot small { font-size: 16px; color: var(--ink-3); }
.sheet { position: fixed; inset: 0; z-index: 60; background: rgba(6, 6, 7, .5); backdrop-filter: blur(6px); }
.sheet__card { position: absolute; left: 12px; right: 12px; top: 12px; padding: 18px; border-radius: 24px; background: #fff; color: var(--ink); box-shadow: 0 30px 60px -20px rgba(0, 0, 0, .4); animation: drop .35s var(--ease); }
@keyframes drop { from { opacity: 0; transform: translateY(-14px); } }
.sheet__card a { display: flex; align-items: center; height: 56px; padding: 0 10px; font: 600 20px var(--font); border-radius: 14px; }
.sheet__card a:active { background: #f2f3f5; }
.sheet__card .btn { width: 100%; justify-content: center; margin-top: 10px; background: var(--ink); color: #fff !important; }
.sheet__x { position: absolute; right: 12px; top: 12px; width: 46px; height: 46px; border: 0; border-radius: 50%; background: #f2f3f5; font-size: 24px; cursor: pointer; }
@media (max-width: 1080px) {
  .nav__links { display: none; }
  .nav__burger { display: grid; place-items: center; order: 3; }
  .nav__right { margin-left: auto; }
  .hero__in { grid-template-columns: 1fr; padding-top: 120px; text-align: center; }
  .hero__lead { margin-inline: auto; }
  .hero__btns { justify-content: center; }
  .hero h1 { font-size: min(clamp(36px, 7.4vw, 72px), 10cqw); }
  .stage { justify-self: center; max-width: 620px; margin-top: 20px; }
  .app { grid-template-columns: 64px minmax(0, 1.4fr) minmax(0, 1fr); }
  .checks__in { grid-template-columns: 1fr; }
  .bust { max-width: 440px; margin: 0 auto -20px; }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 40px; }
  .stat:nth-child(3) { padding-left: 0; border-left: 0; }
  .foot__in { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .foot__in > :first-child, .foot__in > :last-child { grid-column: 1 / -1; }
}
@media (max-width: 720px) {
  .lp { font-size: 16px; }
  .nav__in, .nav.is-scrolled .nav__in { height: 64px; gap: 8px; }
  .nav__login, .nav__prof { display: none; }
  .nav__cta { display: none; }
  .nav__burger { margin-right: -8px; }
  .logo { font-size: 22px; gap: 10px; }
  .logo svg { width: 28px; height: 28px; }
  .logo { min-height: 44px; }
  sub { font-size: 12px; }
  .btn { height: 54px; padding: 0 26px; font-size: 17px; }
  .hero__in { padding-top: 100px; padding-bottom: 96px; gap: 8px; }
  .hero h1 { font-size: min(clamp(32px, 10vw, 48px), 10cqw); }
  .hero__btns .btn { flex: 1 1 200px; }
  .hero__chips { bottom: 24px; padding: 0 16px; font-size: 14px; }
  .hero__chips span + span::before { margin: 0 8px; }
  .stage { width: 108%; margin: 8px -4% 0; }
  .app-wrap { perspective: none; }
  .app, .app-wrap.in .app { grid-template-columns: 1fr; transform: none; }
  .app__rail { display: none; }
  .pdf { padding: 18px 16px 44px; border-right: 0; border-bottom: 1px solid var(--line); }
  .pdf__bar { margin: 0 0 16px; font-size: 13px; }
  .pdf__bar .pill:not(:first-child) { display: none; }
  .serif { font-size: 15px; }
  .serif .x { display: none; }
  .t { font-size: 13px; }
  .t th, .t td { padding: 6px 4px; }
  .facts { padding: 20px 16px; }
  .big strong { font-size: 40px; }
  .app-wrap { margin-top: 88px; }
  .tile { right: -2%; top: -60px; width: 76px; }
  .remark { position: relative; left: auto; bottom: auto; display: inline-flex; margin: 20px 0 0 4px; gap: 12px; padding: 14px 18px 14px 14px; font-size: 15px; rotate: -2deg; }
  .remark br { display: none; }
  .link { display: none; }
  .remark .dot { width: 16px; height: 16px; }
  .steps { grid-template-columns: 1fr; }
  .step { padding: 22px 24px 30px; }
  .step h3 { font-size: 26px; }
  .step p { font-size: 17px; }
  .clist li { gap: 16px; }
  .clist img { width: 52px; height: 52px; }
  .vt__h, .vt__r { grid-template-columns: 1fr 1.5fr .8fr; padding: 10px 12px; }
  .vt__rule { font-size: 14px; margin-left: 8px; }
  .stat { padding: 0 16px; }
  .stat:nth-child(odd) { padding-left: 0; }
  .cta { grid-template-columns: 1fr; padding: 40px 24px 8px; border-radius: 28px; text-align: center; }
  .cta .btn { width: 100%; }
  .cta__img img { max-width: 300px; }
  .foot__in { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .foot__in div a { display: flex; align-items: center; min-height: 44px; padding: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .lp *, .lp *::before, .lp *::after { animation: none !important; transition: none !important; }
  [data-reveal], .h2[data-reveal], .step .step__img, .step .step__n, .clist li img, .cta .cta__img, .L .E, .hero__lead, .hero__btns, .hero__chips, .hero h1 .ln > span, .hero__bg img, .app, .vt__r, .vt__rule { opacity: 1 !important; transform: none !important; filter: none !important; clip-path: none !important; }
}
</style>
