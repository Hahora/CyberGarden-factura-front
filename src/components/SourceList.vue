<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { plural } from '../search'
import { fmtInt } from '../fmt'
import type { Source } from '../api/chat'

const props = withDefaults(defineProps<{ sources: Source[]; full?: boolean; limit?: number }>(), { full: false, limit: 4 })

const REL: Record<string, string> = { this: 'сама статья', related: 'связанная работа', cites: 'цитирует статью', search: 'найдено в чате' }
const shown = computed(() => (props.full ? props.sources : props.sources.slice(0, props.limit)))
const who = (s: Source) => {
  const a = s.authors ?? []
  return a.length > 3 ? `${a.slice(0, 3).join(', ')} и др.` : a.join(', ')
}
const link = (s: Source) => s.url || (s.doi ? `https://doi.org/${s.doi}` : `https://openalex.org/${s.openalex_id}`)
</script>

<template>
  <ul class="src" :class="{ 'is-full': full }" role="list">
    <li v-for="s in shown" :key="s.openalex_id + ((s as { pid?: string | null }).pid ?? '')" class="src__i" :class="{ card: full }">
      <div class="src__top">
        <span v-if="s.relation" class="src__rel">{{ REL[s.relation] ?? s.relation }}<template v-if="(s as { pid?: string | null }).pid"> {{ (s as { pid?: string | null }).pid }}</template></span>
        <span v-if="s.year" class="src__meta num">{{ s.year }}</span>
        <span v-if="s.cited_by_count != null" class="src__meta num">{{ fmtInt(s.cited_by_count) }} {{ plural(s.cited_by_count, ['цитирование', 'цитирования', 'цитирований']) }}</span>
      </div>
      <a :href="link(s)" target="_blank" rel="noopener" class="src__t">{{ s.title }}<Icon name="arrow-up-right" :size="13" class="src__ext" /></a>
      <p v-if="who(s) || s.venue" class="src__by">{{ [who(s), s.venue].filter(Boolean).join(' · ') }}</p>
      <template v-if="full">
        <p v-if="s.abstract" class="src__abs">{{ s.abstract }}</p>
        <p class="src__links">
          <a :href="link(s)" target="_blank" rel="noopener" class="link">{{ s.doi ? 'DOI ' + s.doi : 'Открыть в OpenAlex' }}</a>
          <a v-if="s.oa_url" :href="s.oa_url" target="_blank" rel="noopener" class="link">Открытый текст</a>
        </p>
        <p v-if="s.cited_in?.length" class="src__in">Встречается в ответах: {{ s.cited_in.map((c) => `«${c.question}»`).join(', ') }}</p>
      </template>
    </li>
  </ul>
</template>

<style scoped>
.src { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s3); }
.src.is-full { gap: var(--s4); }
.src__i { display: grid; gap: 2px; min-width: 0; }
.src__i.card { padding: var(--s4) var(--s5); gap: var(--s1); }
.src__top { display: flex; flex-wrap: wrap; gap: var(--s1) var(--s3); font-size: var(--fs-xs); color: var(--muted); }
.src__rel { color: var(--ink-2); }
.src__t { color: var(--ink); font-weight: 500; line-height: 1.4; text-decoration: none; overflow-wrap: anywhere; }
.src__t:hover { text-decoration: underline; text-decoration-color: var(--faint); }
.src__ext { margin-left: 4px; vertical-align: -1px; color: var(--muted); }
.src__by { font-size: var(--fs-sm); color: var(--muted); overflow-wrap: anywhere; }
.src__abs { margin-top: var(--s1); font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.6; }
.src__links { display: flex; flex-wrap: wrap; gap: var(--s4); margin-top: var(--s1); font-size: var(--fs-sm); }
.src__in { font-size: var(--fs-xs); color: var(--muted); }
</style>
