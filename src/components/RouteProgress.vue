<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const width = ref(0)
const show = ref(false)
let delay = 0
let crawl = 0

function start() {
  clearTimeout(delay)
  delay = window.setTimeout(() => {
    show.value = true
    width.value = 12
    clearInterval(crawl)
    crawl = window.setInterval(() => (width.value += (90 - width.value) * 0.12), 120)
  }, 120)
}
function done() {
  clearTimeout(delay)
  clearInterval(crawl)
  if (!show.value) return
  width.value = 100
  window.setTimeout(() => {
    show.value = false
    width.value = 0
  }, 260)
}
const offBefore = router.beforeEach((to, from) => {
  if (to.path !== from.path) start()
})
const offAfter = router.afterEach(done)
const offError = router.onError(done)
onBeforeUnmount(() => {
  offBefore()
  offAfter()
  offError()
  clearTimeout(delay)
  clearInterval(crawl)
})
</script>

<template>
  <div class="rpg" :class="{ on: show }" role="progressbar" aria-label="Загрузка экрана" :aria-hidden="!show">
    <span :style="{ width: width + '%' }" />
  </div>
</template>

<style scoped>
.rpg { position: fixed; z-index: var(--z-progress); top: 0; left: 0; right: 0; height: 2px; pointer-events: none; opacity: 0; transition: opacity var(--t) ease; }
.rpg.on { opacity: 1; }
.rpg span { display: block; height: 100%; background: var(--blue); box-shadow: 0 0 8px var(--blue); transition: width var(--t) ease; }
</style>
