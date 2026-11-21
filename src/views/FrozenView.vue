<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import DataPage from '../components/DataPage.vue'
import UiSpinner from '../components/UiSpinner.vue'
import { useBusy } from '../useBusy'
import UiEmpty from '../components/UiEmpty.vue'
import Icon from '../components/Icon.vue'
import { DEV_TEXT } from '../config'
import { dataRun, dataPids, ensureDataRun } from '../dataTabs'
import { downloadRunSet } from '../case/runSet'

const route = useRoute()
const title = computed(() => String(route.meta.title ?? 'Раздел'))
const canSet = computed(() => !!route.meta.download && !!dataRun.value && dataPids.value.length > 0)
ensureDataRun()
const { busy, run } = useBusy()
</script>

<template>
  <DataPage :title="title">
    <UiEmpty icon="info" :title="DEV_TEXT">
      <template v-if="route.meta.download" #action>
        <button type="button" class="btn btn--soft btn--sm" :disabled="!canSet || busy" @click="run(() => downloadRunSet(dataRun), $event)"><UiSpinner v-if="busy" :size="14" tone="current" /><Icon v-else name="export" :size="16" />{{ busy ? 'Готовим архив…' : 'Скачать набор для сдачи' }}</button>
      </template>
    </UiEmpty>
  </DataPage>
</template>
