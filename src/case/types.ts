export interface PublicationRow {
  publication_id: string; title: string; year: string; DOI: string; authors: string; in_scope: string; exclusion_reason: string
}
export interface MaterialRow {
  publication_id: string; material_id: string; material_name_raw: string; formula_normalized: string; material_class: string
  dimensionality: string; additives: string; bandgap_value: string; bandgap_unit: string; bandgap_method: string; note: string
}
export interface DeviceRow {
  publication_id: string; device_id: string; absorber_material_id: string; device_label: string; device_role: string; device_type: string
  architecture: string; substrate_type: string; active_area: string; area_unit: string; area_definition: string; encapsulation: string; note: string
}
export interface LayerRow {
  publication_id: string; layer_id: string; device_id: string; layer_order: string; layer_function: string; layer_material: string
  layer_thickness: string; thickness_unit: string; deposition_method: string; annealing_temperature: string; annealing_time: string; atmosphere: string; note: string
}
export interface MeasurementRow {
  publication_id: string; measurement_id: string; device_id: string; measurement_type: string; spectrum: string; light_intensity: string
  intensity_unit: string; scan_direction: string; scan_rate: string; mask_used: string; certified: string; certification_lab: string
  temperature: string; stability_protocol: string; stress_conditions: string; note: string
}
export interface ResultRow {
  publication_id: string; result_id: string; device_id: string; measurement_id: string; material_id: string; metric_name: string
  metric_value: string; metric_unit: string; aggregation: string; spread_value: string; n_devices: string; time_point: string; time_unit: string
  raw_value: string; raw_unit: string; normalized_value: string; normalized_unit: string; result_origin: string; cited_publication_id: string
  source_page: string; source_section: string; source_table: string; source_figure: string; source_fragment: string
  extraction_status: string; duplicate_of: string; note: string
}
export interface IssueRow {
  publication_id: string; issue_id: string; record_ids: string; check_name: string; description: string; source_page: string; source_fragment: string
}

export interface GoldTables {
  publications: PublicationRow[]
  materials: MaterialRow[]
  devices: DeviceRow[]
  layers: LayerRow[]
  measurements: MeasurementRow[]
  results: ResultRow[]
  issues: IssueRow[]
}

export const METRICS = ['PCE', 'Voc', 'Jsc', 'FF', 'Rs', 'Rsh', 'HI', 'Jsc_EQE', 'stabilized_PCE', 'T80', 'retained_PCE'] as const
export type MetricName = (typeof METRICS)[number]

export interface Review {
  status: 'new' | 'accepted' | 'rejected'
  corrected?: number
  digits?: number
  at?: number
}

export type FileStatus = 'queued' | 'running' | 'done' | 'out' | 'ocr' | 'error' | 'nodata'
export interface RunFile {
  id: string
  name: string
  status: FileStatus
  progress: number
  hasData: boolean
  reason?: string
  stage?: string
  eta?: number
}
export interface Run {
  id: string
  title: string
  domain: 'solar' | 'rag'
  createdAt: number
  files: RunFile[]
  pinned?: boolean
  remote?: boolean
  apiStatus?: 'queued' | 'running' | 'done' | 'error'
  apiResults?: number
  apiIssues?: number
  apiProgress?: number
  apiEta?: number
}

export type Domain = 'solar' | 'rag'
export interface RagConfigRow {
  publication_id: string; config_id: string; rag_variant: string; retrieval_method: string; retriever_model: string; embedding_model: string
  embedding_version: string; chunking_method: string; chunk_size: string; chunk_overlap: string; chunk_unit: string; index_type: string
  vector_store: string; top_k: string; reranker_model: string; generator_model: string; generator_version: string; prompt_strategy: string
  context_strategy: string; note: string
}
export interface RagDatasetRow {
  publication_id: string; dataset_id: string; dataset_name: string; dataset_version: string; language: string; data_split: string
  scientific_domain: string; note: string
}
export interface RagTaskRow { publication_id: string; task_id: string; task_type: string; note: string }
export interface RagExperimentRow {
  publication_id: string; experiment_id: string; evaluation_protocol: string; baseline_name: string; hardware: string; latency_ms: string
  tokens_per_query: string; sample_size: string; note: string
}
export interface RagResultRow {
  publication_id: string; result_id: string; experiment_id: string; config_id: string; dataset_id: string; task_id: string
  metric_group: string; metric_name: string; metric_variant: string
  metric_direction: string
  metric_k: string
  metric_value: string; metric_unit: string; baseline_value: string; aggregation: string; sample_size: string
  raw_value: string; raw_unit: string; normalized_value: string; normalized_unit: string; result_origin: string; cited_publication_id: string
  source_page: string; source_section: string; source_table: string; source_figure: string; source_fragment: string
  extraction_status: string; duplicate_of: string; note: string
}
export type RagIssueRow = IssueRow
export interface RagTables {
  configurations: RagConfigRow[]; datasets: RagDatasetRow[]; tasks: RagTaskRow[]; experiments: RagExperimentRow[]
  results: RagResultRow[]; issues: RagIssueRow[]
}
export interface RagGoldTables extends RagTables { publications: PublicationRow[] }
export interface RagPaperSummary {
  results: number; configurations: number; datasets: number; tasks: number; experiments: number; issues: number
  metrics: [string, number][]
  scan: boolean
}
