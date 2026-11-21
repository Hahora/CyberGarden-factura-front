<script setup lang="ts">
import { computed } from 'vue'
import DataPage from '../components/DataPage.vue'
import SubmissionView from '../components/SubmissionView.vue'
import { useBusy } from '../useBusy'
import UiEmpty from '../components/UiEmpty.vue'
import { dataDomain, dataPids, dataRun, useDataReady } from '../dataTabs'
import { ragLoadError, ragRetry } from '../case'
import { downloadRunSet } from '../case/runSet'

const ready = useDataReady(dataPids)
const { busy: setBusy, run: runSet } = useBusy()
const retry = () => void ragRetry(dataPids.value)
const failed = computed(() => dataDomain.value === 'rag' && dataPids.value.some((p) => ragLoadError(p)))
</script>

<template>
  <DataPage title="Таблица набора" :loading="!ready" sub="Те же 7 таблиц, что уходят на сдачу: каждая строка — строка CSV">
    <UiEmpty v-if="failed" icon="table" title="Не удалось загрузить статьи" text="Часть статей не загрузилась, таблица неполная." action="Повторить" @action="retry" />
    <SubmissionView v-else :run-id="dataRun" :domain="dataDomain" :pids="dataPids" bulk :set-busy="setBusy" @download-set="runSet(() => downloadRunSet(dataRun))" />
  </DataPage>
</template>
