<script setup lang="ts">
defineProps<{ active?: boolean }>()

function wave(amp: number, len: number, y: number) {
  let d = `M0 ${y}`
  for (let x = 0; x < 2880; x += len) d += ` q${len / 4} ${-amp} ${len / 2} 0 t${len / 2} 0`
  return d
}
const LINES = [
  { d: wave(26, 720, 120), cls: 'w1' },
  { d: wave(18, 480, 140), cls: 'w2' },
  { d: wave(34, 1440, 160), cls: 'w3' },
  { d: wave(14, 360, 175), cls: 'w4' },
  { d: wave(22, 720, 190), cls: 'w5 is-blue' },
]
</script>

<template>
  <div class="hw" :class="{ 'is-active': active }" aria-hidden="true">
    <svg viewBox="0 0 1440 260" preserveAspectRatio="none">
      <g v-for="l in LINES" :key="l.cls" :class="['hw__line', l.cls]"><path :d="l.d" /></g>
    </svg>
  </div>
</template>

<style scoped>
.hw {
  position: absolute; left: 0; right: 0; bottom: 0; height: min(46vh, 420px);
  pointer-events: none; overflow: hidden; z-index: 0;
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 45%);
  mask-image: linear-gradient(to bottom, transparent, #000 45%);
  opacity: 0; animation: hw-in 1.2s var(--ease) .2s forwards;
}
.hw svg { width: 100%; height: 100%; display: block; overflow: hidden; }
.hw__line path { fill: none; stroke: var(--ink); stroke-width: 1.2; vector-effect: non-scaling-stroke; opacity: .1; }
.hw__line { animation: hw-move 38s linear infinite; }
.w1 { animation-duration: 46s; }
.w2 { animation-duration: 34s; animation-direction: reverse; }
.w2 path { opacity: .07; }
.w3 { animation-duration: 58s; }
.w3 path { opacity: .06; }
.w4 { animation-duration: 28s; animation-direction: reverse; }
.w4 path { opacity: .08; }
.is-blue path { stroke-width: 1.4; opacity: .16; }
.is-blue { animation-duration: 40s; }
.hw.is-active .hw__line { animation-duration: 9s; }
.hw.is-active .is-blue path { opacity: .28; transition: opacity var(--t-slow) ease; }
@keyframes hw-move { from { transform: translateX(0); } to { transform: translateX(-1440px); } }
@keyframes hw-in { to { opacity: 1; } }
@media (max-width: 768px) {
  .hw { height: min(34vh, 300px); }
  .hw svg { width: 260%; }
}
@media (prefers-reduced-motion: reduce) {
  .hw__line { animation: none; }
  .hw { animation: none; opacity: 1; }
}
</style>
