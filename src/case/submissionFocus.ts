import { ref } from 'vue'
import type { Router } from 'vue-router'

export interface SubFocus { tab: string; row: string; pid: string; n: number }
export const submissionFocus = ref<SubFocus | null>(null)
let counter = 0

export function openInSubmission(router: Router, runId: string, tab: string, row: string, pid: string) {
  submissionFocus.value = { tab, row, pid, n: ++counter }
  const path = '/run/' + encodeURIComponent(runId)
  if (router.currentRoute.value.path !== path) void router.push({ path, query: { tab, row, pid } })
}

export const KEY_COL: Record<string, string> = {
  publications: 'publication_id', materials: 'material_id', devices: 'device_id', layers: 'layer_id', measurements: 'measurement_id',
  results: 'result_id', issues: 'issue_id', configurations: 'config_id', datasets: 'dataset_id', tasks: 'task_id', experiments: 'experiment_id',
}
export const LINKS: Record<'solar' | 'rag', Record<string, Record<string, string>>> = {
  solar: {
    devices: { absorber_material_id: 'materials' },
    layers: { device_id: 'devices' },
    measurements: { device_id: 'devices' },
    results: { device_id: 'devices', measurement_id: 'measurements', material_id: 'materials', duplicate_of: 'results' },
    issues: { record_ids: 'results' },
  },
  rag: {
    results: { experiment_id: 'experiments', config_id: 'configurations', dataset_id: 'datasets', task_id: 'tasks', duplicate_of: 'results' },
    issues: { record_ids: 'results' },
  },
}
export const TABS: Record<'solar' | 'rag', string[]> = {
  solar: ['publications', 'materials', 'devices', 'layers', 'measurements', 'results', 'issues'],
  rag: ['publications', 'configurations', 'datasets', 'tasks', 'experiments', 'results', 'issues'],
}
export const TAB_RU: Record<string, string> = {
  publications: 'Публикации', materials: 'Материалы', devices: 'Приборы', layers: 'Слои', measurements: 'Условия', results: 'Результаты', issues: 'Замечания',
  configurations: 'Конфигурации', datasets: 'Датасеты', tasks: 'Задачи', experiments: 'Эксперименты',
}
