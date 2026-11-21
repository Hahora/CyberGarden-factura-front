<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import UiProgress from './UiProgress.vue'
import UiSpinner from './UiSpinner.vue'
import { STAGES, factsOf, type Paper } from '../store'

const props = defineProps<{ paper: Paper }>()

const pct = computed(() => Math.min(100, Math.floor(props.paper.processing)))
const current = computed(() => Math.min(STAGES.length - 1, Math.floor((pct.value / 100) * STAGES.length)))
const found = computed(() => Math.round((factsOf(props.paper.id).length * pct.value) / 100))
</script>

<template>
  <div class="pipe">
    <div class="pipe__inner">
      <p class="pipe__eyebrow">Разбор статьи</p>
      <h1 class="pipe__title">{{ paper.title }}</h1>

      <div class="pipe__bar"><UiProgress :value="pct" tone="ink" size="md" label="Разбор статьи" /></div>
      <p class="pipe__pct num">Разбираю статью… {{ pct }} %</p>

      <ol class="pipe__stages">
        <li v-for="(s, i) in STAGES" :key="s" :class="{ done: i < current, now: i === current, wait: i > current }">
          <span class="pipe__mark">
            <Icon v-if="i < current" name="check" :size="14" />
            <UiSpinner v-else-if="i === current" :size="14" tone="ink" label="Идёт этап" />
            <i v-else class="pipe__idle" />
          </span>
          {{ s }}
        </li>
      </ol>

      <p class="pipe__count">Найдено фактов: <b class="num">{{ found }}</b></p>
    </div>
  </div>
</template>

<style scoped>
.pipe { height: 100%; display: grid; place-items: center; padding: 32px 24px; overflow: auto; }
.pipe__inner { width: min(460px, 100%); text-align: center; }
.pipe__eyebrow { font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }
.pipe__title { font-size: var(--fs-h1); line-height: 1.25; font-weight: 500; letter-spacing: -0.01em; margin-bottom: 40px; text-wrap: balance; }
.pipe__pct { margin: 10px 0 32px; font-size: var(--fs-sm); color: var(--muted); }
.pipe__stages { list-style: none; padding: 0; display: inline-flex; flex-direction: column; gap: 10px; text-align: left; }
.pipe__stages li { display: flex; align-items: center; gap: 12px; font-size: var(--fs-body); transition: color var(--t) ease; }
.pipe__stages li.done { color: var(--ink); }
.pipe__stages li.now { color: var(--ink); font-weight: 500; }
.pipe__stages li.wait { color: var(--faint); }
.pipe__mark { width: 18px; height: 18px; display: grid; place-items: center; color: var(--green); }
.pipe__idle { width: 5px; height: 5px; border-radius: 50%; background: var(--line-2); }
.pipe__count { margin-top: 36px; font-size: var(--fs-body); color: var(--muted); }
.pipe__count b { color: var(--ink); font-weight: 500; }

@media (max-width: 768px) {
  .pipe { height: 100%; min-height: 0; padding: 24px 16px calc(24px + var(--safe-b)); }
  .pipe__inner { width: 100%; }
  .pipe__title { margin-bottom: var(--s6); }
  .pipe__stages { display: flex; width: min(320px, 100%); margin: 0 auto; gap: 14px; }
  .pipe__stages li { font-size: 15px; }
}
</style>
