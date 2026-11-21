import type { CollectionId } from './data'

export interface PField {
  name: string
  type: 'string' | 'int' | 'number' | 'bool' | 'enum' | 'list'
  unit?: string
  required: boolean
  desc: string
  values?: string[]
  ref?: string
}
export interface PEntity {
  id: string
  title: string
  row: string
  key: string
  fields: PField[]
}
export interface PRule {
  id: string
  title: string
  what: string
  level: 'error' | 'warn' | 'info' | 'format'
  by: 'бэк' | 'ML' | 'бэк + ML'
}
export interface PNorm {
  quantity: string
  from: string
  to: string
  factor: number | null
  note?: string
}
export interface PGuide {
  id: 'inclusion' | 'comparability' | 'extraction'
  title: string
  intro: string
  items: string[]
}
export interface PDomain {
  id: CollectionId
  name: string
  entities: PEntity[]
  rules: PRule[]
  norms: PNorm[]
  guides: PGuide[]
}

const f = (name: string, type: PField['type'], required: boolean, desc: string, extra: Partial<PField> = {}): PField => ({ name, type, required, desc, ...extra })
const PUB = f('publication_id', 'string', true, 'Имя файла статьи без расширения: D001, P017')
const NOTE = f('note', 'string', false, 'Свободное примечание; сюда уходит исходная формулировка, не вошедшая в словарь')
const SRC = (extra = ''): PField[] => [
  f('source_page', 'int', false, `Номер страницы в PDF, считая с 1${extra}`),
  f('source_section', 'string', false, 'Раздел статьи'),
  f('source_table', 'string', false, 'Таблица'),
  f('source_figure', 'string', false, 'Рисунок'),
  f('source_fragment', 'string', false, 'Короткая дословная цитата со страницы source_page'),
]

const solarEntities: PEntity[] = [
  {
    id: 'publications', title: 'Публикации', row: 'статья корпуса (в том числе исключённая)', key: 'publication_id',
    fields: [
      PUB,
      f('title', 'string', false, 'Название статьи как в выходных данных'),
      f('year', 'int', false, 'Год публикации из выходных данных'),
      f('DOI', 'string', false, 'Цифровой идентификатор статьи: 10.xxxx/…'),
      f('authors', 'list', false, 'Авторы через «;»'),
      f('in_scope', 'bool', true, 'Относится ли статья к предметной области', { values: ['true', 'false'] }),
      f('exclusion_reason', 'string', false, 'Почему исключена; только если in_scope = false'),
    ],
  },
  {
    id: 'materials', title: 'Материалы', row: 'материал поглотителя', key: 'publication_id + material_id',
    fields: [
      PUB,
      f('material_id', 'string', true, 'M1, M2…, уникален внутри статьи'),
      f('material_name_raw', 'string', false, 'Название как в статье'),
      f('formula_normalized', 'string', false, 'Для перовскита — вид A-B-X с раскрытыми MA, FA, Cs'),
      f('material_class', 'enum', false, 'Класс материала', { values: ['perovskite', 'CIGS', 'CdTe', 'kesterite', 'Sb2Se3', 'thin-film Si', 'other'] }),
      f('dimensionality', 'enum', false, 'Размерность', { values: ['3D', '2D', '2D-3D'] }),
      f('additives', 'string', false, 'Добавки'),
      f('bandgap_value', 'number', false, 'Ширина запрещённой зоны', { unit: 'eV' }),
      f('bandgap_unit', 'enum', false, 'Единица ширины зоны', { values: ['eV'] }),
      f('bandgap_method', 'enum', false, 'Способ определения; cited — значение взято из литературы', { values: ['Tauc', 'EQE', 'PL', 'cited'] }),
      NOTE,
    ],
  },
  {
    id: 'devices', title: 'Приборы', row: 'прибор', key: 'publication_id + device_id',
    fields: [
      PUB,
      f('device_id', 'string', true, 'DV1, DV2…'),
      f('absorber_material_id', 'string', false, 'Поглотитель прибора', { ref: 'materials.material_id' }),
      f('device_label', 'string', false, 'Название прибора в статье'),
      f('device_role', 'enum', false, 'Роль в статье', { values: ['control', 'target', 'record'] }),
      f('device_type', 'enum', false, 'Тип', { values: ['cell', 'minimodule', 'module'] }),
      f('architecture', 'enum', false, 'Архитектура', { values: ['n-i-p', 'p-i-n', 'substrate', 'superstrate'] }),
      f('substrate_type', 'enum', false, 'Подложка', { values: ['rigid', 'flexible'] }),
      f('active_area', 'number', false, 'Площадь', { unit: 'cm2' }),
      f('area_unit', 'enum', false, 'Единица площади', { values: ['cm2'] }),
      f('area_definition', 'enum', false, 'Как определена площадь', { values: ['designated illumination', 'aperture', 'total'] }),
      f('encapsulation', 'string', false, 'Инкапсуляция'),
      NOTE,
    ],
  },
  {
    id: 'layers', title: 'Слои', row: 'слой прибора (подложка не записывается)', key: 'publication_id + layer_id',
    fields: [
      PUB,
      f('layer_id', 'string', true, 'L1, L2…'),
      f('device_id', 'string', false, 'Прибор', { ref: 'devices.device_id' }),
      f('layer_order', 'int', false, 'Порядковый номер слоя, считая от подложки: 1, 2…'),
      f('layer_function', 'enum', false, 'Функция слоя', { values: ['front_contact', 'ETL', 'absorber', 'passivation', 'HTL', 'interlayer', 'recombination', 'back_contact'] }),
      f('layer_material', 'string', false, 'Материал слоя'),
      f('layer_thickness', 'number', false, 'Толщина; микрометры переводятся в нанометры', { unit: 'nm' }),
      f('thickness_unit', 'enum', false, 'Единица толщины', { values: ['nm'] }),
      f('deposition_method', 'string', false, 'Метод нанесения'),
      f('annealing_temperature', 'number', false, 'Температура отжига', { unit: '°C' }),
      f('annealing_time', 'string', false, 'Время отжига с единицей: «10 min»'),
      f('atmosphere', 'string', false, 'Атмосфера'),
      NOTE,
    ],
  },
  {
    id: 'measurements', title: 'Измерения', row: 'условия измерения', key: 'publication_id + measurement_id',
    fields: [
      PUB,
      f('measurement_id', 'string', true, 'MS1, MS2…'),
      f('device_id', 'list', false, 'Приборы через «;»', { ref: 'devices.device_id' }),
      f('measurement_type', 'enum', false, 'Тип измерения; тёмная ВАХ — J-V с примечанием', { values: ['J-V', 'MPP tracking', 'EQE', 'stability'] }),
      f('spectrum', 'string', false, 'Например, AM1.5G'),
      f('light_intensity', 'number', false, 'Мощность освещения'),
      f('intensity_unit', 'string', false, 'Например, mW/cm2'),
      f('scan_direction', 'enum', false, 'Направление развёртки; прямой и обратный ход — разные измерения', { values: ['reverse', 'forward', 'average'] }),
      f('scan_rate', 'string', false, 'Скорость развёртки с единицей'),
      f('mask_used', 'bool', false, 'Использована маска', { values: ['true', 'false'] }),
      f('certified', 'bool', false, 'Сертифицированное измерение', { values: ['true', 'false'] }),
      f('certification_lab', 'string', false, 'Лаборатория'),
      f('temperature', 'string', false, 'Температура измерения'),
      f('stability_protocol', 'enum', false, 'Протокол; если ISOS не назван — other', { values: ['ISOS-D', 'ISOS-L', 'ISOS-T', 'other'] }),
      f('stress_conditions', 'string', false, 'Условия старения'),
      NOTE,
    ],
  },
  {
    id: 'results', title: 'Результаты', row: 'одно значение одного показателя одного прибора при одних условиях', key: 'publication_id + result_id',
    fields: [
      PUB,
      f('result_id', 'string', true, 'R001, R002…'),
      f('device_id', 'string', false, 'Прибор; у cited-записей пусто', { ref: 'devices.device_id' }),
      f('measurement_id', 'string', false, 'Измерение; у cited-записей пусто', { ref: 'measurements.measurement_id' }),
      f('material_id', 'string', false, 'Материал', { ref: 'materials.material_id' }),
      f('metric_name', 'enum', true, 'Показатель; прочие (дефицит Voc, Jmpp…) можно писать понятным названием, в оценку они не идут', { values: ['PCE', 'Voc', 'Jsc', 'FF', 'Rs', 'Rsh', 'HI', 'Jsc_EQE', 'stabilized_PCE', 'T80', 'retained_PCE'] }),
      f('metric_value', 'number', false, 'Совпадает с normalized_value'),
      f('metric_unit', 'string', false, 'Совпадает с normalized_unit'),
      f('aggregation', 'enum', false, 'Пусто, если в статье не сказано, лучший это прибор или среднее', { values: ['champion', 'mean', 'median'] }),
      f('spread_value', 'number', false, 'Разброс (± или стандартное отклонение)'),
      f('n_devices', 'int', false, 'Число приборов'),
      f('time_point', 'number', false, 'Момент измерения для стабильности'),
      f('time_unit', 'string', false, 'Единица момента'),
      f('raw_value', 'string', false, 'Значение дословно как в статье'),
      f('raw_unit', 'string', false, 'Единица дословно как в статье: mV, fraction'),
      f('normalized_value', 'number', false, 'Значение в целевой единице'),
      f('normalized_unit', 'string', false, 'Целевая единица: % · V · mA/cm2 · Ohm*cm2 · h'),
      f('result_origin', 'enum', false, 'primary — собственный результат; cited — из другой работы', { values: ['primary', 'cited'] }),
      f('cited_publication_id', 'string', false, 'Для cited: ссылка в статье, например [12] или [19–21]'),
      ...SRC(),
      f('extraction_status', 'enum', false, 'present_not_extractable — значение есть, но извлечь нельзя (только в supplementary или на графике)', { values: ['extracted', 'present_not_extractable', 'absent'] }),
      f('duplicate_of', 'string', false, 'result_id основной записи, если то же значение упомянуто ещё раз; у основной пусто', { ref: 'results.result_id' }),
      NOTE,
    ],
  },
  {
    id: 'issues', title: 'Замечания', row: 'замечание проверки (отметки «Отметить исправленным» и «Это не ошибка» в файл не попадают: формат организаторов фиксирован и столбца статуса в нём нет; исправленные значения уже исправлены в results, отклонённые не выгружаются и убраны из record_ids)', key: 'publication_id + issue_id',
    fields: [
      PUB,
      f('issue_id', 'string', true, 'I1, I2…'),
      f('record_ids', 'list', false, 'result_id записей через «;»', { ref: 'results.result_id' }),
      f('check_name', 'string', true, 'Какое правило сработало (каталог ниже)'),
      f('description', 'string', true, 'Что не согласуется: числа с обеих сторон'),
      f('source_page', 'int', false, 'Страница PDF, где это видно'),
      f('source_fragment', 'string', false, 'Дословная цитата'),
    ],
  },
]

const solarRules: PRule[] = [
  { id: 'jv_consistency', title: 'КПД против Voc·Jsc·FF/Pвх', what: 'Расчёт по Voc, Jsc, FF и мощности освещения расходится с КПД больше чем на 3 %', level: 'warn', by: 'бэк' },
  { id: 'voc_limit', title: 'Voc не выше Eg/q', what: 'Voc в вольтах не меньше ширины зоны поглотителя в эВ', level: 'error', by: 'бэк' },
  { id: 'range', title: 'Физические пределы', what: 'КПД вне (0; 100), FF вне (0; 100], Jsc ≤ 0 или > 50 мА/см², Voc ≤ 0 или > 3 В, Rs и Rsh ≤ 0, сохранённый КПД > 150 %', level: 'error', by: 'бэк' },
  { id: 'eqe_consistency', title: 'Jsc по EQE и по ВАХ', what: 'Jsc по EQE и Jsc по ВАХ одного прибора расходятся больше чем на 5 %', level: 'warn', by: 'бэк' },
  { id: 'champion_vs_mean', title: 'Лучший против среднего', what: 'У одного прибора значение лучшего прибора меньше среднего или медианы того же показателя', level: 'error', by: 'бэк' },
  { id: 'hysteresis_index', title: 'Индекс гистерезиса', what: 'HI = (КПД обр. − КПД прям.) / КПД обр.; расхождение с указанным в статье больше 1 п.п. или HI < 0', level: 'info', by: 'бэк' },
  { id: 'contradiction', title: 'Противоречие', what: 'Одно значение в разных местах статьи расходится; утверждение текста против таблицы', level: 'error', by: 'бэк + ML' },
  { id: 'missing_conditions', title: 'Нет условий измерения', what: 'Не указаны спектр, интенсивность, площадь или направление развёртки', level: 'warn', by: 'бэк + ML' },
  { id: 'measurement_conditions', title: 'Нестандартные условия', what: '«1 солнце» с поправкой, выдержка на свету перед измерением, двустороннее освещение', level: 'info', by: 'ML' },
  { id: 'comparability', title: 'Несопоставимо', what: 'Нестандартный источник света, мини-модуль, нет спектра AM1.5G', level: 'warn', by: 'бэк + ML' },
  { id: 'ambiguity', title: 'Неоднозначность', what: 'Нельзя понять число приборов, тип развёртки, момент времени или к какому прибору относится значение', level: 'info', by: 'ML' },
  { id: 'unit_inconsistency', title: 'Единица не согласуется', what: 'Единица не совпадает со значением («FF 0.71 %», хотя это доля) или не распознана', level: 'warn', by: 'бэк + ML' },
  { id: 'derived_values', title: 'Производные числа', what: 'В тексте разности и относительные приросты — не записываются как значения показателя', level: 'info', by: 'ML' },
  { id: 'typo', title: 'Опечатка', what: 'Опечатка в формуле или обозначении', level: 'info', by: 'ML' },
  { id: 'possible_swap', title: 'Возможна перестановка', what: 'Значения, вероятно, перепутаны местами', level: 'warn', by: 'ML' },
  { id: 'figure_mismatch', title: 'Рисунок и таблица', what: 'Точки на рисунке не совпадают со значениями таблицы больше чем на 3 %', level: 'warn', by: 'бэк + ML' },
  { id: 'figure_only', title: 'Только на графике', what: 'Чисел нет, результаты видны лишь на графиках (статус «есть в статье, но не извлечь»)', level: 'info', by: 'ML' },
  { id: 'cited_in_table', title: 'Чужие строки в таблице', what: 'В таблице результатов есть строки из других работ (источник — «из цитаты»)', level: 'info', by: 'ML' },
  { id: 'dedup_trap', title: 'Ловушка дубликатов', what: 'Одинаковые значения у разных приборов или одна строка в двух таблицах', level: 'info', by: 'бэк + ML' },
  { id: 'rounding', title: 'Округление', what: 'Расхождение объясняется округлением последнего знака', level: 'info', by: 'бэк' },
  { id: 'plausibility', title: 'Правдоподобие', what: 'Значение у уровня мировых рекордов или выше рекорда класса материала', level: 'warn', by: 'бэк + ML' },
  { id: 'voc_deficit_consistency', title: 'Дефицит Voc', what: 'Указанный дефицит не равен Eg/q − Voc', level: 'warn', by: 'бэк' },
  { id: 'f1', title: 'Пустая ячейка', what: 'Пустая ячейка означает, что в статье этого нет; неизвестное не восстанавливается по догадке', level: 'format', by: 'бэк' },
  { id: 'f2', title: 'Страницы', what: 'Страница — номер страницы в PDF, считая с 1', level: 'format', by: 'бэк' },
  { id: 'f3', title: 'Повторы', what: 'Повтор того же значения того же прибора — отдельная строка со ссылкой на основную (duplicate_of)', level: 'format', by: 'бэк' },
  { id: 'f4', title: 'Исключённые статьи', what: 'У статьи не по теме (in_scope = false) в остальных таблицах строк нет', level: 'format', by: 'бэк' },
  { id: 'f5', title: 'Формат файла', what: 'UTF-8 с BOM, запятая-разделитель, точка в числах, true и false, списки через «;»', level: 'format', by: 'бэк' },
  { id: 'f6', title: 'Сравнение статей', what: 'Статьи попарно не сравниваются; все правила работают внутри статьи', level: 'format', by: 'бэк' },
]

const solarNorms: PNorm[] = [
  { quantity: 'PCE', from: '%', to: '%', factor: 1 },
  { quantity: 'PCE', from: 'доля (fraction)', to: '%', factor: 100, note: 'только если шкала известна' },
  { quantity: 'FF', from: 'доля (fraction)', to: '%', factor: 100 },
  { quantity: 'HI', from: 'доля (fraction)', to: '%', factor: 100 },
  { quantity: 'retained_PCE', from: 'доля (fraction)', to: '%', factor: 100 },
  { quantity: 'Voc', from: 'mV', to: 'V', factor: 0.001 },
  { quantity: 'Jsc, Jsc_EQE', from: 'A/m2', to: 'mA/cm2', factor: 0.1 },
  { quantity: 'Rs, Rsh', from: 'kOhm*cm2', to: 'Ohm*cm2', factor: 1000 },
  { quantity: 'Ширина зоны', from: 'eV', to: 'eV', factor: 1, note: 'нм края поглощения не пересчитываются' },
  { quantity: 'Толщина', from: 'µm', to: 'nm', factor: 1000 },
  { quantity: 'Толщина', from: 'mm', to: 'nm', factor: 1e6 },
  { quantity: 'Толщина', from: 'Å', to: 'nm', factor: 0.1 },
  { quantity: 'Площадь', from: 'mm2', to: 'cm2', factor: 0.01 },
  { quantity: 'Площадь', from: 'm2', to: 'cm2', factor: 1e4 },
  { quantity: 'Время (T80, старение)', from: 'min', to: 'h', factor: 1 / 60 },
  { quantity: 'Время (T80, старение)', from: 's', to: 'h', factor: 1 / 3600 },
  { quantity: 'Время (T80, старение)', from: 'd', to: 'h', factor: 24 },
  { quantity: 'Мощность освещения', from: 'W/m2', to: 'mW/cm2', factor: 0.1 },
  { quantity: 'Мощность освещения', from: '1 sun', to: 'mW/cm2', factor: null, note: '1 sun = 100' },
  { quantity: 'Температура', from: 'K', to: '°C', factor: null, note: 'вычесть 273,15' },
]

const ragEntities: PEntity[] = [
  {
    id: 'publications', title: 'Публикации', row: 'статья корпуса (в том числе исключённая)', key: 'publication_id',
    fields: [
      PUB,
      f('title', 'string', false, 'Название статьи'),
      f('year', 'int', false, 'Год публикации'),
      f('DOI', 'string', false, 'DOI, если известен из источника; иначе пусто'),
      f('authors', 'list', false, 'Авторы через «;»'),
      f('in_scope', 'bool', true, 'Относится ли статья к предметной области: система находит сведения во внешней коллекции документов и использует их при ответе', { values: ['true', 'false'] }),
      f('exclusion_reason', 'string', false, 'Почему исключена; обязательна при in_scope = false, при true пуста'),
    ],
  },
  {
    id: 'configurations', title: 'Конфигурации', row: 'конфигурация RAG или сравниваемый baseline', key: 'publication_id + config_id',
    fields: [
      PUB,
      f('config_id', 'string', true, 'Идентификатор конфигурации внутри статьи'),
      f('rag_variant', 'string', false, 'Название или вариант системы (baseline) из статьи'),
      f('retrieval_method', 'string', false, 'Способ поиска в исходной формулировке: BM25, dense, hybrid'),
      f('retriever_model', 'string', false, 'Название поисковой модели'),
      f('embedding_model', 'string', false, 'Модель эмбеддингов'),
      f('embedding_version', 'string', false, 'Версия эмбеддингов, если указана отдельно'),
      f('chunking_method', 'string', false, 'Как текст режут на фрагменты'),
      f('chunk_size', 'int', false, 'Размер фрагмента, если указан числом'),
      f('chunk_overlap', 'int', false, 'Перекрытие фрагментов, если указано числом'),
      f('chunk_unit', 'string', false, 'Единица размера фрагмента по источнику: tokens, characters и т. п.'),
      f('index_type', 'string', false, 'Тип индекса; не выводится из хранилища'),
      f('vector_store', 'string', false, 'Векторное хранилище; не выводится из типа индекса'),
      f('top_k', 'int', false, 'Сколько документов система достаёт из базы. Это настройка конфигурации, не k метрики'),
      f('reranker_model', 'string', false, 'Модель повторного ранжирования'),
      f('generator_model', 'string', false, 'Модель, которая пишет ответ'),
      f('generator_version', 'string', false, 'Версия генератора, если указана явно'),
      f('prompt_strategy', 'string', false, 'Стратегия промпта'),
      f('context_strategy', 'string', false, 'Как подаётся контекст'),
      NOTE,
    ],
  },
  {
    id: 'datasets', title: 'Датасеты', row: 'набор данных, его версия и разбиение', key: 'publication_id + dataset_id',
    fields: [
      PUB,
      f('dataset_id', 'string', true, 'Идентификатор датасета внутри статьи'),
      f('dataset_name', 'string', false, 'Название датасета'),
      f('dataset_version', 'string', false, 'Версия датасета'),
      f('language', 'string', false, 'Язык'),
      f('data_split', 'string', false, 'Разбиение: train, dev, test и т. п.; разные разбиения не сливаются'),
      f('scientific_domain', 'string', false, 'Научная область датасета'),
      NOTE,
    ],
  },
  {
    id: 'tasks', title: 'Задачи', row: 'задача', key: 'publication_id + task_id',
    fields: [
      PUB,
      f('task_id', 'string', true, 'Идентификатор задачи внутри статьи'),
      f('task_type', 'string', false, 'Тип задачи, например multi-hop question answering; закрытого словаря нет'),
      NOTE,
    ],
  },
  {
    id: 'experiments', title: 'Эксперименты', row: 'протокол и условия эксперимента', key: 'publication_id + experiment_id',
    fields: [
      PUB,
      f('experiment_id', 'string', true, 'Идентификатор эксперимента внутри статьи'),
      f('evaluation_protocol', 'string', false, 'Протокол: условия оценки, способ расчёта, ограничения сравнения'),
      f('baseline_name', 'string', false, 'С чем сравнивают (baseline), если статья называет его прямо'),
      f('hardware', 'string', false, 'Железо и число устройств по статье'),
      f('latency_ms', 'number', false, 'Задержка', { unit: 'ms' }),
      f('tokens_per_query', 'number', false, 'Токенов на запрос'),
      f('sample_size', 'int', false, 'Размер оценочной выборки, не всего датасета'),
      NOTE,
    ],
  },
  {
    id: 'results', title: 'Результаты', row: 'одно значение одной метрики в одном эксперименте', key: 'publication_id + result_id',
    fields: [
      PUB,
      f('result_id', 'string', true, 'Идентификатор записи внутри статьи'),
      f('experiment_id', 'string', false, 'Эксперимент', { ref: 'experiments.experiment_id' }),
      f('config_id', 'string', false, 'Конфигурация', { ref: 'configurations.config_id' }),
      f('dataset_id', 'string', false, 'Датасет', { ref: 'datasets.dataset_id' }),
      f('task_id', 'string', false, 'Задача', { ref: 'tasks.task_id' }),
      f('metric_group', 'string', false, 'Группа метрик по смыслу источника (свободный текст)'),
      f('metric_name', 'string', true, 'Название метрики: Recall, MRR, nDCG, EM, F1'),
      f('metric_variant', 'string', false, 'Вариант метрики: token-level F1, macro, micro, judge-based'),
      f('metric_direction', 'enum', false, 'Что лучше; неизвестное направление — пусто', { values: ['higher_is_better', 'lower_is_better', 'target'] }),
      f('metric_k', 'int', false, 'k самой метрики (Recall@5, nDCG@10); это не top_k конфигурации'),
      f('metric_value', 'number', false, 'Нормализованное значение, если нормализация обоснована'),
      f('metric_unit', 'string', false, 'Единица нормализованного значения'),
      f('baseline_value', 'number', false, 'Значение baseline, только если задача, датасет, метрика, шкала и протокол сопоставимы'),
      f('aggregation', 'string', false, 'Среднее, медиана и т. п. — только при явном указании'),
      f('sample_size', 'int', false, 'Размер выборки для этого результата, если отличается'),
      f('raw_value', 'string', false, 'Значение дословно, как в статье, со знаками и диапазонами'),
      f('raw_unit', 'string', false, 'Единица дословно'),
      f('normalized_value', 'number', false, 'Нормализованное значение; согласовано с metric_value'),
      f('normalized_unit', 'string', false, 'Нормализованная единица; согласована с metric_unit'),
      f('result_origin', 'enum', false, 'primary — число получено в этой работе; cited — перенесено из другой', { values: ['primary', 'cited'] }),
      f('cited_publication_id', 'string', false, 'Для cited: ссылка в статье, например [12]; это не ключ к таблице публикаций'),
      f('source_page', 'int', false, 'Номер страницы PDF, считая с 1; для извлечённого значения обязателен'),
      f('source_section', 'string', false, 'Раздел статьи'),
      f('source_table', 'string', false, 'Таблица'),
      f('source_figure', 'string', false, 'Рисунок; способ чтения графика пояснять в note'),
      f('source_fragment', 'string', false, 'Дословная цитата со страницы source_page'),
      f('extraction_status', 'enum', false, 'Удалось ли извлечь значение', { values: ['extracted', 'present_not_extractable', 'absent'] }),
      f('duplicate_of', 'string', false, 'result_id основной записи, если значение повторено в другом месте', { ref: 'results.result_id' }),
      NOTE,
    ],
  },
  {
    id: 'issues', title: 'Замечания', row: 'замечание проверки', key: 'publication_id + issue_id',
    fields: [
      PUB,
      f('issue_id', 'string', true, 'Идентификатор замечания внутри статьи'),
      f('record_ids', 'list', false, 'result_id связанных значений через «;»', { ref: 'results.result_id' }),
      f('check_name', 'string', true, 'Название правила (открытый список: metric_scale, metric_k, protocol_mismatch, normalization, contradiction)'),
      f('description', 'string', true, 'Что не согласуется, с числами и условиями'),
      f('source_page', 'int', false, 'Страница PDF, где проверялось'),
      f('source_fragment', 'string', false, 'Дословная цитата с места проверки'),
    ],
  },
]

const ragRules: PRule[] = [
  { id: 'metric_scale', title: 'Допустимая шкала', what: 'Значение метрики вне её шкалы: Recall, MRR, nDCG, EM, F1 — от 0 до 1', level: 'error', by: 'бэк' },
  { id: 'metric_k_missing', title: 'Нет k у метрики @k', what: 'Для Recall@k, Precision@k и подобных не указан k', level: 'warn', by: 'бэк' },
  { id: 'recall_k', title: 'Recall по k', what: 'Recall@k1 больше Recall@k2 при k1 < k2', level: 'error', by: 'бэк' },
  { id: 'mrr', title: 'MRR против Recall', what: 'MRR больше Recall@10 той же конфигурации', level: 'error', by: 'бэк' },
  { id: 'contradiction', title: 'Противоречие', what: 'Результат в тексте и в таблице расходится', level: 'error', by: 'бэк + ML' },
  { id: 'f1', title: 'Неизвестное', what: 'Фиксируются только параметры, приведённые в публикации; неизвестное не восстанавливается по догадке', level: 'format', by: 'бэк' },
  { id: 'f2', title: 'Сопоставление', what: 'Результаты сравниваются при совпадении задачи, набора данных, определения метрики и протокола; разные эксперименты и варианты метрик не объединяются', level: 'format', by: 'бэк' },
  { id: 'f3', title: 'Сохранение исходного', what: 'Сохраняются исходная и нормализованная запись; исходный результат при замечании не удаляется', level: 'format', by: 'бэк' },
]

const ragNorms: PNorm[] = [
  { quantity: 'Recall, MRR, nDCG, EM, F1', from: '%', to: 'доля (fraction)', factor: 0.01, note: 'только при известной шкале' },
  { quantity: 'Задержка', from: 's', to: 'ms', factor: 1000 },
  { quantity: 'Размер чанка', from: 'tokens', to: 'tokens', factor: 1, note: 'символы и слова не переводятся в токены: chunk_unit = chars | words' },
]

const solarGuides: PGuide[] = [
  {
    id: 'inclusion', title: 'Критерии отбора статей', intro: 'Статья входит в набор, если она описывает тонкоплёночные солнечные элементы и в ней есть изготовленный прибор.',
    items: [
      'Материалы: тонкоплёночные солнечные элементы — перовскитные, халькогенидные (CIGS, CdTe, кестериты, Sb₂Se₃), тонкоплёночный кремний.',
      'Только однопереходные приборы, без тандемов.',
      'Только экспериментальные работы: описан изготовленный прибор и приведены его фотоэлектрические характеристики.',
      'Расчётные работы без образцов не включаются: у такой статьи in_scope = false, а причина записывается в exclusion_reason. В publications остаётся только её строка.',
    ],
  },
  {
    id: 'comparability', title: 'Критерии сопоставимости', intro: 'Два результата сравнивают друг с другом, только если совпадают все условия из списка. Иначе это разные группы.',
    items: [
      'Класс материала поглотителя (material_class).',
      'Тип прибора (device_type): элемент, минимодуль или модуль.',
      'Условия измерения: спектр AM1.5G, мощность 100 мВт/см².',
      'Сопоставимая площадь прибора.',
      'Агрегация (aggregation): champion, mean или median.',
      'Направление развёртки (scan_direction): прямой и обратный ход не смешиваются.',
      'Сертифицированные значения и стабильность сравниваются отдельно от остальных.',
    ],
  },
  {
    id: 'extraction', title: 'Правила извлечения', intro: 'Короткая выжимка из шаблона сдачи организаторов.',
    items: [
      'Пустая ячейка означает, что в статье этого нет. Неизвестные значения не восстанавливаются по догадке.',
      'source_page — номер страницы в PDF, считая с 1, а не номер в журнале.',
      'source_fragment — короткая дословная цитата со страницы source_page. Пересказ не подходит.',
      'Повтор того же значения того же прибора (аннотация, текст, другая таблица) записывается отдельной строкой со своим source_*; в duplicate_of указывается result_id основной записи.',
      'Значение из другой работы: result_origin = cited, в cited_publication_id — ссылка из статьи, например [12]. device_id и measurement_id у такой строки пустые.',
      'extraction_status: extracted; present_not_extractable (значение есть, но извлечь нельзя: только в supplementary или только на графике); absent.',
    ],
  },
]
const ragGuides: PGuide[] = [
  {
    id: 'inclusion', title: 'Критерии отбора статей', intro: 'Решение принимается по содержанию статьи, а не по слову RAG в названии.',
    items: [
      'Система находит сведения во внешней коллекции документов и использует найденный контекст при ответе.',
      'В публикации описаны конфигурация системы и результаты её оценки.',
      'Если в названии есть слово RAG, а поиска по внешней коллекции или оценки в статье нет, статья не входит: in_scope = false, причина — в exclusion_reason.',
      'И наоборот: статья без слова RAG в названии входит, если система устроена так, как описано выше.',
    ],
  },
  {
    id: 'comparability', title: 'Критерии сопоставимости', intro: 'Результаты сравнивают, только если совпадают все пункты. Разные эксперименты не объединяются.',
    items: [
      'Совпадает задача (tasks).',
      'Совпадает набор данных (datasets).',
      'Совпадает определение метрики: вариант и параметр k (например, Recall@5 и Recall@10 — разные метрики).',
      'Совпадает шкала: доли или проценты.',
      'Совпадает протокол оценки.',
      'Результаты разных экспериментов не объединяются и не усредняются; при расхождении сохраняются обе записи и создаётся замечание.',
    ],
  },
  {
    id: 'extraction', title: 'Правила извлечения', intro: 'Короткая выжимка из шаблона сдачи организаторов.',
    items: [
      'Пустая ячейка означает, что в статье этого нет. Неизвестные значения не восстанавливаются по догадке.',
      'source_page — целый номер страницы PDF, с 1, а не печатная нумерация журнала.',
      'source_fragment — дословный фрагмент указанной страницы. Пересказ не подходит.',
      'Повтор значения записывается отдельной строкой со своим result_id; в duplicate_of указывается основная запись. Циклы, ссылки на себя и объединение разных экспериментов недопустимы.',
      'Результат из другой работы: result_origin = cited, в cited_publication_id — ссылка из статьи. Чужой метод, заново воспроизведённый авторами, — primary.',
      'extraction_status: extracted; present_not_extractable; absent.',
    ],
  },
]

export const PASSPORT: Record<CollectionId, PDomain> = {
  solar: { id: 'solar', name: 'Солнечные элементы', entities: solarEntities, rules: solarRules, norms: solarNorms, guides: solarGuides },
  rag: { id: 'rag', name: 'RAG и поиск', entities: ragEntities, rules: ragRules, norms: ragNorms, guides: ragGuides },
}

export const LEVEL_LABEL: Record<PRule['level'], string> = { error: 'Ошибка', warn: 'Предупреждение', info: 'Справка', format: 'Формат' }
export const TYPE_LABEL: Record<PField['type'], string> = { string: 'текст', int: 'целое', number: 'число', bool: 'да / нет', enum: 'словарь', list: 'список через «;»' }

export type PassportJSON = ReturnType<typeof passportJSON> & { versions?: Record<string, string | null> }
type DomainJSON = PassportJSON['domains'][number]
export function domainFromJSON(d: DomainJSON): PDomain {
  return {
    id: d.id, name: d.name,
    entities: (d.entities ?? []).map((e) => ({
      id: e.id, title: e.title, row: e.row, key: e.key,
      fields: (e.fields ?? []).map((x) => ({ name: x.name, type: x.type, unit: x.unit ?? undefined, required: !!x.required, desc: x.description ?? '', values: x.values ?? undefined, ref: x.ref ?? undefined })),
    })),
    rules: (d.rules ?? []).map((r) => ({ id: r.id, title: r.title, what: r.description, level: r.level, by: r.computed_by })),
    norms: (d.normalization ?? []).map((n) => ({ quantity: n.quantity, from: n.from, to: n.to, factor: n.factor, note: n.note ?? undefined })),
    guides: (d.guides ?? []).map((g) => ({ id: g.id, title: g.title, intro: g.description, items: g.items ?? [] })),
  }
}

export function passportJSON(ids: CollectionId[] = ['solar', 'rag']) {
  return {
    title: 'Паспорт данных «Фактура AI»',
    version: '1',
    format: 'CSV UTF-8 с BOM, запятая, точка, списки через «;»; пустая ячейка = в статье нет',
    domains: ids.map((id) => {
      const d = PASSPORT[id]
      return {
        id: d.id,
        name: d.name,
        entities: d.entities.map((e) => ({
          id: e.id, title: e.title, row: e.row, key: e.key,
          fields: e.fields.map((x) => ({ name: x.name, type: x.type, unit: x.unit ?? null, required: x.required, description: x.desc, values: x.values ?? null, ref: x.ref ?? null })),
        })),
        rules: d.rules.map((r) => ({ id: r.id, title: r.title, description: r.what, level: r.level, computed_by: r.by })),
        guides: d.guides.map((g) => ({ id: g.id, title: g.title, description: g.intro, items: g.items })),
        normalization: d.norms.map((n) => ({ quantity: n.quantity, from: n.from, to: n.to, factor: n.factor, note: n.note ?? null })),
      }
    }),
  }
}

const cellMd = (s: string) => s.replace(/\|/g, '\\|')
export const passportMD = (ids: CollectionId[] = ['solar', 'rag']): string => passportMDOf(ids.map((id) => PASSPORT[id]))
export function passportMDOf(domains: PDomain[]): string {
  const out: string[] = ['# Паспорт данных «Фактура AI»', '', 'Формат: CSV UTF-8 с BOM, запятая-разделитель, точка в числах, true и false, списки через «;». Пустая ячейка означает, что в статье этого нет.', '']
  for (const d of domains) {
    out.push(`## ${d.name}`, '')
    for (const g of d.guides) out.push(`### ${g.title}`, '', g.intro, '', ...g.items.map((x) => `- ${x}`), '')
    for (const e of d.entities) {
      out.push(`### ${e.id}`, '', `Одна строка: ${e.row}. Ключ: ${e.key}.`, '', '| Поле | Тип | Единица | Обяз. | Описание | Допустимые значения |', '|---|---|---|---|---|---|')
      for (const x of e.fields) {
        const extra = x.values ? x.values.join(', ') : x.ref ? `→ ${x.ref}` : ''
        out.push(`| ${x.name} | ${TYPE_LABEL[x.type]} | ${x.unit ?? ''} | ${x.required ? 'да' : ''} | ${cellMd(x.desc)} | ${cellMd(extra)} |`)
      }
      out.push('')
    }
    out.push('### Правила проверки', '', '| Правило | Что проверяет | Уровень | Кто считает |', '|---|---|---|---|')
    for (const r of d.rules) out.push(`| ${r.id} | ${cellMd(r.what)} | ${LEVEL_LABEL[r.level]} | ${r.by} |`)
    out.push('', '### Нормализация', '', '| Величина | Из | В | Множитель | Примечание |', '|---|---|---|---|---|')
    for (const n of d.norms) out.push(`| ${n.quantity} | ${n.from} | ${n.to} | ${n.factor == null ? '' : '×' + +n.factor.toPrecision(6)} | ${n.note ?? ''} |`)
    out.push('')
  }
  return out.join('\n')
}
