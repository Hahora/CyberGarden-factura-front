<script setup lang="ts">
import { computed } from 'vue'
import { FIELD_RU, TABLE_RU, labelOfField, ruValue } from '../case'
import { LEVEL_LABEL, PASSPORT, TYPE_LABEL, type PDomain, type PEntity, type PField } from '../passport'
import { state } from '../store'
import { useViewState } from '../viewState'

const props = defineProps<{ area: 'solar' | 'rag'; data?: PDomain }>()
const ui = useViewState('passport-' + props.area, () => ({ part: 'publications' }))
const d = computed(() => props.data ?? PASSPORT[props.area])
const part = computed<string>({
  get: () => (ui.part === 'rules' || ui.part === 'norms' || d.value.guides.some((g) => g.id === ui.part) || d.value.entities.some((e) => e.id === ui.part) ? ui.part : d.value.guides[0]!.id),
  set: (v) => { ui.part = v },
})
const guide = computed(() => d.value.guides.find((g) => g.id === part.value))
const entity = computed(() => d.value.entities.find((e) => e.id === part.value))

const fmtFactor = (n: number | null) => (n == null ? '' : '× ' + String(+n.toPrecision(6)).replace('.', ','))
const tableName = (e: PEntity) => TABLE_RU[e.id] ?? e.title
const fieldRu = (name: string) => (name in FIELD_RU ? labelOfField(name) : '')
const descOf = (f: PField) => (f.desc.trim().toLowerCase() === fieldRu(f.name).toLowerCase() ? '' : f.desc)
const keyParts = (key: string) => key.split('+').map((s) => s.trim()).map((name) => ({ name, ru: fieldRu(name) }))
const BY_RU: Record<string, string> = { 'бэк': 'Сервис разбора', ML: 'Модель', 'бэк + ML': 'Сервис разбора и модель' }
const valRu = (field: string, v: string) => {
  const t = ruValue(field, v)
  return t === v || t === '—' ? '' : t
}
const parts = computed(() => [
  ...d.value.guides.map((g) => ({ id: g.id, name: g.title, n: g.items.length })),
  ...d.value.entities.map((e) => ({ id: e.id, name: tableName(e), n: e.fields.length })),
  { id: 'rules', name: 'Правила проверки', n: d.value.rules.length },
  { id: 'norms', name: 'Приведение единиц', n: d.value.norms.length },
])
</script>

<template>
    <div class="grid">
      <nav v-if="!state.mobile" class="side" aria-label="Разделы описания">
        <template v-for="(x, i) in parts" :key="x.id">
          <span v-if="i === d.guides.length || i === d.guides.length + d.entities.length" class="sp" aria-hidden="true" />
          <button type="button" class="it" :class="{ on: part === x.id }" :aria-current="part === x.id ? 'true' : undefined" @click="part = x.id">
            <span class="nm">{{ x.name }}</span><em class="num">{{ x.n }}</em>
          </button>
        </template>
      </nav>
      <div v-else class="seg side-m" role="tablist" aria-label="Разделы описания">
        <button v-for="x in parts" :key="x.id" type="button" role="tab" :aria-selected="part === x.id" @click="part = x.id">
          {{ x.name }}<span class="seg__n">{{ x.n }}</span>
        </button>
      </div>

      <section class="card box">
        <template v-if="guide">
          <header class="h"><h2>{{ guide.title }}</h2><p>{{ guide.intro }}</p></header>
          <ul class="gl">
            <li v-for="(x, i) in guide.items" :key="i" class="gl__i"><span class="gl__n num">{{ i + 1 }}</span><span>{{ x }}</span></li>
          </ul>
        </template>

        <template v-else-if="entity">
          <header class="h">
            <h2>{{ tableName(entity) }} <code>{{ entity.id }}</code></h2>
            <p>
              Одна строка — {{ entity.row }}. Ключ:
              <template v-for="(k, i) in keyParts(entity.key)" :key="k.name"><template v-if="i"> + </template><template v-if="k.ru">{{ k.ru + ' ' }}</template><code>{{ k.name }}</code></template>
            </p>
          </header>

          <ul v-if="state.mobile" class="fl">
            <li v-for="f in entity.fields" :key="f.name" class="fl__i">
              <p class="fl__n"><b v-if="fieldRu(f.name)">{{ fieldRu(f.name) }}</b><code>{{ f.name }}</code></p>
              <p class="fl__m">{{ TYPE_LABEL[f.type] }}<template v-if="f.unit"> · {{ f.unit }}</template> · {{ f.required ? 'обязательное' : 'необязательное' }}</p>
              <p v-if="descOf(f)" class="fl__d">{{ descOf(f) }}</p>
              <span v-if="f.values" class="vals"><span v-for="v in f.values" :key="v" class="val-i"><code>{{ v }}</code><small v-if="valRu(f.name, v)">{{ valRu(f.name, v) }}</small></span></span>
              <p v-else-if="f.ref" class="fl__d">ссылка на <code>{{ f.ref }}</code></p>
            </li>
          </ul>
          <div v-else class="tw">
            <table class="tbl tbl--sm tb">
              <thead><tr><th>Поле</th><th>Тип</th><th>Единица</th><th>Обязательное</th><th>Описание</th><th>Допустимые значения</th></tr></thead>
              <tbody>
                <tr v-for="f in entity.fields" :key="f.name">
                  <td><b v-if="fieldRu(f.name)" class="ru">{{ fieldRu(f.name) }}</b><code>{{ f.name }}</code></td>
                  <td>{{ TYPE_LABEL[f.type] }}</td>
                  <td>{{ f.unit ?? '' }}</td>
                  <td>{{ f.required ? 'да' : 'нет' }}</td>
                  <td class="wrap">{{ descOf(f) || '—' }}</td>
                  <td class="wrap">
                    <span v-if="f.values" class="vals"><span v-for="v in f.values" :key="v" class="val-i"><code>{{ v }}</code><small v-if="valRu(f.name, v)">{{ valRu(f.name, v) }}</small></span></span>
                    <span v-else-if="f.ref" class="ref">ссылка на <code>{{ f.ref }}</code></span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <template v-else-if="part === 'rules'">
          <header class="h"><h2>Правила проверки</h2><p>Нарушение сохраняется как замечание: правило, связанные значения, место в статье. Исходное значение не удаляется.</p></header>
          <ul v-if="state.mobile" class="fl">
            <li v-for="r in d.rules" :key="r.id" class="fl__i">
              <p class="fl__n"><b>{{ r.title }}</b><code>{{ r.id }}</code></p>
              <p class="fl__d">{{ r.what }}</p>
              <p class="fl__m">{{ LEVEL_LABEL[r.level] }} · {{ BY_RU[r.by] ?? r.by }}</p>
            </li>
          </ul>
          <div v-else class="tw">
            <table class="tbl tbl--sm tb">
              <thead><tr><th>Правило</th><th>Что проверяет</th><th>Уровень</th><th>Кто считает</th></tr></thead>
              <tbody>
                <tr v-for="r in d.rules" :key="r.id">
                  <td><b class="ru">{{ r.title }}</b><code>{{ r.id }}</code></td>
                  <td class="wrap">{{ r.what }}</td>
                  <td>{{ LEVEL_LABEL[r.level] }}</td>
                  <td>{{ BY_RU[r.by] ?? r.by }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <template v-else>
          <header class="h"><h2>Приведение единиц</h2><p>Хранятся обе записи: как в статье (<code>raw_value</code>, <code>raw_unit</code>) и приведённая (<code>normalized_value</code>, <code>normalized_unit</code>).</p></header>
          <ul v-if="state.mobile" class="fl">
            <li v-for="(n, i) in d.norms" :key="i" class="fl__i">
              <p class="fl__n"><b>{{ n.quantity }}</b></p>
              <p class="fl__d num">{{ n.from }} → {{ n.to }}<template v-if="n.factor != null"> · {{ fmtFactor(n.factor) }}</template></p>
              <p v-if="n.note" class="fl__m">{{ n.note }}</p>
            </li>
          </ul>
          <div v-else class="tw">
            <table class="tbl tbl--sm tb">
              <thead><tr><th>Величина</th><th>Единица в статье</th><th>Единица в таблице</th><th class="n">Множитель</th><th>Примечание</th></tr></thead>
              <tbody>
                <tr v-for="(n, i) in d.norms" :key="i">
                  <td>{{ n.quantity }}</td><td>{{ n.from }}</td><td>{{ n.to }}</td><td class="n num">{{ fmtFactor(n.factor) }}</td><td class="wrap">{{ n.note ?? '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>
    </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 14rem minmax(0, 1fr); gap: var(--block); align-items: start; }
.side { display: grid; gap: 2px; position: sticky; top: 0; }
.it { display: flex; align-items: center; justify-content: space-between; gap: var(--s2); min-height: var(--row-h); padding: 0 var(--s3); border-radius: var(--r-sm); font-size: var(--fs-sm); color: var(--muted); text-align: left; transition: background-color var(--t), color var(--t); }
.it:hover { background: var(--bg-2); color: var(--ink); }
.it.on { background: var(--card); box-shadow: 0 0 0 1px var(--line); color: var(--ink); font-weight: 500; }
.it .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.it em { font-style: normal; font-size: var(--fs-xs); color: var(--muted); }
.sp { height: var(--s3); }

.box { min-width: 0; padding: var(--s5); }
.h { margin-bottom: var(--s3); }
.h h2 { font-size: var(--fs-h2); font-weight: 600; line-height: 1.3; }
.h h2 code { margin-left: var(--s1); font-weight: 400; color: var(--muted); }
.h p { margin-top: var(--s1); font-size: var(--fs-sm); color: var(--muted); }
code { font-family: var(--mono); font-size: var(--fs-xs); }
.h code { padding: 1px var(--s2); border-radius: var(--r-xs); background: var(--bg-2); }

.tw { overflow-x: auto; max-width: 100%; border-radius: var(--r); box-shadow: inset 0 0 0 1px var(--line); }
.tb { width: 100%; min-width: 760px; font-size: var(--fs-sm); }
.tb td { vertical-align: top; padding-block: var(--s2); white-space: nowrap; }
.tb td.wrap { white-space: normal; min-width: 200px; }
.tb td .ru { display: block; font-weight: 500; }
.tb td code { color: var(--muted); }
.vals { display: flex; flex-wrap: wrap; gap: var(--s1) var(--s2); }
.val-i { display: inline-flex; align-items: baseline; gap: var(--s1); padding: 1px var(--s2); border-radius: var(--r-xs); background: var(--bg-2); }
.val-i code { color: var(--ink-2); }
.val-i small { color: var(--muted); font-size: var(--fs-xs); }
.ref { color: var(--muted); }
.gl { list-style: none; padding: 0; display: grid; }
.gl__i { display: flex; gap: var(--s3); padding: var(--s3) 0; font-size: var(--fs-body); line-height: 1.5; color: var(--ink-2); overflow-wrap: anywhere; }
.gl__i + .gl__i { border-top: 1px solid var(--line); }
.gl__n { flex: none; width: 1.5rem; color: var(--muted); font-size: var(--fs-sm); }
.fl { list-style: none; padding: 0; display: grid; }
.fl__i { display: grid; gap: var(--s1); padding: var(--s3) 0; min-width: 0; }
.fl__i + .fl__i { border-top: 1px solid var(--line); }
.fl__n { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s1) var(--s2); }
.fl__n b { font-weight: 500; }
.fl__n code { color: var(--muted); }
.fl__m { font-size: var(--fs-sm); color: var(--muted); }
.fl__d { font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.45; overflow-wrap: anywhere; }

@media (max-width: 960px) {
  .grid { grid-template-columns: minmax(0, 1fr); gap: var(--s3); }
}
@media (max-width: 768px) {
  .box { padding: var(--s4); }
  .md { display: none; }
  .side-m { justify-self: stretch; -webkit-mask-image: linear-gradient(90deg, #000 85%, transparent); mask-image: linear-gradient(90deg, #000 85%, transparent); }
}
</style>
