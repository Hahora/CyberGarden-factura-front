<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { chatOfPaper, deleteChat, paperOf } from '../store'
import { openDeep } from '../viewState'

const props = defineProps<{ paperId: string }>()
const router = useRouter()
const KEY = 'gs:dup-keep:' + props.paperId
const kept = ref(false)
try { kept.value = sessionStorage.getItem(KEY) === '1' } catch { }

const twin = computed(() => {
  const id = paperOf(props.paperId)?.dupOf
  return id ? paperOf(id) : undefined
})
const show = computed(() => !!twin.value && !kept.value)

function keep() {
  kept.value = true
  try { sessionStorage.setItem(KEY, '1') } catch { }
}
const twinPath = computed(() => {
  const c = twin.value && chatOfPaper(twin.value.id)
  return c ? '/c/' + c.id + '?view=facts' : ''
})
function openTwin() {
  if (twinPath.value) void openDeep(router, twinPath.value)
}
function remove() {
  const chat = chatOfPaper(props.paperId)
  if (!chat) return
  const twinChat = twin.value && chatOfPaper(twin.value.id)
  void router.push(twinChat ? '/c/' + twinChat.id + '?view=chat' : '/app')
  deleteChat(chat.id)
}
</script>

<template>
  <div v-if="show" class="dup" role="group" aria-label="Возможный дубликат">
    <p class="dup__t">Похоже на «<button v-if="twinPath" type="button" class="dup__link" @click="openTwin">{{ twin!.title }}</button><b v-else>{{ twin!.title }}</b>» — уже есть в коллекции</p>
    <div class="dup__acts">
      <button type="button" class="btn btn--soft btn--sm" @click="keep">Оставить обе</button>
      <button type="button" class="btn btn--ghost btn--sm" @click="remove">Удалить новую</button>
    </div>
  </div>
</template>

<style scoped>
.dup { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s4); padding: var(--s3) var(--s4); border-radius: var(--r); background: var(--bg-2); }
.dup__t { flex: 1 1 260px; min-width: 0; margin: 0; font-size: var(--fs-sm); line-height: 1.45; color: var(--ink-2); }
.dup__t b { font-weight: 500; color: var(--ink); }
.dup__link { font: inherit; font-weight: 500; color: var(--blue); text-align: left; }
.dup__link:hover { text-decoration: underline; text-underline-offset: 3px; }
.dup__acts { display: flex; flex-wrap: wrap; gap: var(--s2); }
@media (max-width: 768px) {
  .dup__acts .btn { min-height: 44px; }
}
</style>
