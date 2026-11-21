<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import DataPage from '../components/DataPage.vue'
import UiEmpty from '../components/UiEmpty.vue'
import UiSkeleton from '../components/UiSkeleton.vue'
import SourceList from '../components/SourceList.vue'
import { chatSources, messageSources, type Source } from '../api/chat'
import { errText } from '../api/edits'
import { runOf } from '../case/runs'
import { plural } from '../search'

const props = defineProps<{ id: string }>()
const route = useRoute()
const mid = computed(() => (typeof route.query.m === 'string' ? route.query.m : ''))
const thread = computed(() => (typeof route.query.thread === 'string' ? route.query.thread : ''))

const loading = ref(true)
const error = ref('')
const list = ref<Source[]>([])
const question = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (mid.value) {
      const r = await messageSources(props.id, mid.value)
      list.value = r.sources ?? []
      question.value = r.question ?? ''
    } else {
      const r = await chatSources(props.id, thread.value || undefined)
      list.value = r.sources ?? []
      question.value = ''
    }
  } catch (e) {
    error.value = errText(e, 'Не удалось загрузить источники')
  } finally { loading.value = false }
}
watch(() => [props.id, mid.value, thread.value], load, { immediate: true })

const sub = computed(() => {
  const n = list.value.length
  const what = question.value ? `по вопросу «${question.value}»` : 'во всём чате'
  return `${runOf(props.id)?.title ?? ''} · ${n} ${plural(n, ['работа', 'работы', 'работ'])} ${what}`
})
</script>

<template>
  <DataPage title="Источники" :loading="loading" :tabs="false" :sub="sub" :back-to="'/run/' + encodeURIComponent(id)">
    <template #skeleton>
      <div class="sk"><div v-for="i in 4" :key="i" class="card sk__i"><UiSkeleton :lines="3" /></div></div>
    </template>
    <p class="note">Работы найдены в OpenAlex. Они не входят в данные разбора и не проверялись по ним.</p>
    <UiEmpty v-if="error" icon="info" :title="error" action="Повторить" @action="load" />
    <UiEmpty v-else-if="!list.length" icon="book" title="Источников пока нет" text="Спросите в разборе о похожих работах или о том, кто цитирует статью." />
    <SourceList v-else :sources="list" full />
  </DataPage>
</template>

<style scoped>
.note { font-size: var(--fs-sm); color: var(--muted); }
.sk { display: grid; gap: var(--s4); }
.sk__i { padding: var(--s5); }
</style>
