<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { COLLECTIONS, type CollectionId } from '../data'
import { createProject, projectOf, renameProject, state } from '../store'

const router = useRouter()
const name = ref('')
const note = ref('')
const collection = ref<CollectionId>('solar')
const nameInput = ref<HTMLInputElement | null>(null)

const collections = Object.values(COLLECTIONS)
const isNew = computed(() => state.projectModal === 'new')
const title = computed(() => (isNew.value ? 'Новый проект' : 'Настройки проекта'))

const close = () => {
  state.projectModal = null
}

watch(
  () => state.projectModal,
  (v) => {
    if (v === null) return
    if (v === 'new') {
      name.value = ''
      note.value = ''
      collection.value = state.collection
    } else {
      const p = projectOf(v)
      name.value = p?.name ?? ''
      note.value = p?.note ?? ''
      collection.value = p?.collection ?? state.collection
    }
    nameInput.value?.focus()
  },
  { flush: 'post', immediate: true },
)

function submit() {
  const id = state.projectModal
  const nm = name.value.trim()
  if (id === null || !nm) return
  const text = note.value.trim()
  if (id === 'new') {
    const p = createProject(nm, collection.value, text)
    close()
    void router.push('/p/' + p.id)
    return
  }
  renameProject(id, nm)
  const p = projectOf(id)
  if (p) {
    p.collection = collection.value
    p.note = text
  }
  close()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && state.projectModal !== null) close()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Transition name="fade">
    <div v-if="state.projectModal !== null" class="overlay" @click.self="close">
      <form class="modal pm" role="dialog" aria-modal="true" :aria-label="title" @submit.prevent="submit">
        <div class="pm__grip" aria-hidden="true" />
        <header class="pm__head">
          <h2 class="pm__title">{{ title }}</h2>
          <button type="button" class="icon-btn" aria-label="Закрыть" @click="close">
            <Icon name="x" :size="18" />
          </button>
        </header>

        <div class="pm__body">
          <label class="field">
            <span class="field__label">Название</span>
            <input
              ref="nameInput"
              v-model="name"
              class="field__input"
              type="text"
              placeholder="Например, Перовскиты 2024"
              maxlength="80"
              autocomplete="off"
            />
          </label>

          <div class="field">
            <span class="field__label" id="pm-coll">Коллекция</span>
            <div class="colls" role="radiogroup" aria-labelledby="pm-coll">
              <button
                v-for="c in collections"
                :key="c.id"
                type="button"
                role="radio"
                :aria-checked="collection === c.id"
                class="coll"
                :class="{ 'is-on': collection === c.id }"
                @click="collection = c.id"
              >
                <Icon :name="c.icon" :size="22" class="coll__ico" />
                <span class="coll__name">{{ c.name }}</span>
                <span class="coll__hint">{{ c.hint }}</span>
              </button>
            </div>
          </div>

          <label class="field">
            <span class="field__label">Описание <span class="field__opt">необязательно</span></span>
            <textarea v-model="note" class="field__input field__area" rows="2" placeholder="О чём этот проект" />
          </label>
        </div>

        <footer class="pm__foot">
          <button type="button" class="btn btn--soft" @click="close">Отмена</button>
          <button type="submit" class="btn btn--dark" :disabled="!name.trim()">
            {{ isNew ? 'Создать проект' : 'Сохранить' }}
          </button>
        </footer>
      </form>
    </div>
  </Transition>
</template>

<style scoped>
.pm.modal { padding: 0; }

.pm__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--s5) var(--s5) 0 var(--s6);
}
.pm__title { font-size: var(--fs-h2); font-weight: 600; letter-spacing: -0.01em; }

.pm__body { display: grid; gap: var(--s5); padding: var(--s5) var(--s6) var(--s2); }
.pm__foot { display: flex; justify-content: flex-end; gap: var(--s2); padding: var(--s4) var(--s6) var(--s5); }

.field { display: grid; gap: var(--s2); }
.field__label { font-size: var(--fs-sm); font-weight: 500; color: var(--ink-2); }
.field__opt { font-weight: 400; color: var(--faint); }
.field__input {
  width: 100%; height: 40px; padding: 0 var(--s3); border-radius: var(--r-sm); font-size: var(--fs-body);
  background: var(--bg); border: 1px solid var(--line-2); outline: none;
  transition: border-color var(--t) ease, background-color var(--t) ease;
}
.field__input:focus { border-color: var(--ink-2); background: var(--card); }
.field__area { height: auto; min-height: 64px; padding: var(--s3); line-height: 1.5; resize: vertical; }

.colls { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s3); }
.coll {
  display: grid; align-content: start; gap: var(--s1); padding: var(--s4); text-align: left;
  border-radius: var(--r); background: var(--bg); box-shadow: 0 0 0 1px var(--line);
  transition: background-color var(--t) ease, box-shadow var(--t) ease;
}
.coll:hover { background: var(--bg-2); }
.coll.is-on {
  background: var(--card); box-shadow: none;
  outline: 1.5px solid var(--blue); outline-offset: -1.5px;
}
.coll__ico { margin-bottom: 6px; color: var(--ink-2); }
.coll__name { font-size: var(--fs-body); font-weight: 600; }
.coll__hint { font-size: var(--fs-xs); line-height: 1.4; color: var(--muted); }

.pm__grip { display: none; }

@media (max-width: 520px) {
  .colls { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .pm__grip {
    display: block; flex: none; width: 40px; height: 5px; margin: 8px auto 0;
    border-radius: var(--r-pill); background: var(--line-2);
  }
  .pm__head { padding: 12px 16px 0 20px; }
  .pm__body { gap: 18px; padding: 16px 20px 8px; }
  .field__input:not(.field__area) { height: 44px; }

  .colls { grid-template-columns: 1fr; gap: 8px; }
  .coll {
    grid-template-columns: 22px minmax(0, 1fr); column-gap: 12px; row-gap: 2px;
    align-items: center; padding: 14px 16px;
  }
  .coll__ico { grid-row: span 2; margin: 0; }
  .coll__name, .coll__hint { grid-column: 2; }

  .pm__foot { flex-direction: column; align-items: stretch; gap: 8px; padding: 12px 16px calc(16px + var(--safe-b)); }
  .pm__foot .btn { width: 100%; height: 48px; }
  .pm__foot .btn--dark { order: -1; }
}
</style>
