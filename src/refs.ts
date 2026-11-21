import { SEEDS } from './data'
import { paperOf } from './store'

export interface ExtWork {
  authors: string
  title: string
  venue: string
  year: number
  doi?: string
  arxiv?: string
}

export const EXTERNAL: Record<string, ExtWork> = {
  sq1961: { authors: 'Shockley W., Queisser H. J.', title: 'Detailed balance limit of efficiency of p-n junction solar cells', venue: 'J. Appl. Phys., 32(3), 510–519', year: 1961, doi: '10.1063/1.1736034' },
  kojima2009: { authors: 'Kojima A., Teshima K., Shirai Y., Miyasaka T.', title: 'Organometal halide perovskites as visible-light sensitizers for photovoltaic cells', venue: 'J. Am. Chem. Soc., 131(17), 6050–6051', year: 2009, doi: '10.1021/ja809598r' },
  green2023: { authors: 'Green M. A., Dunlop E. D., Hohl-Ebinger J. et al.', title: 'Solar cell efficiency tables (Version 62)', venue: 'Prog. Photovolt. Res. Appl., 31(7), 651–663', year: 2023, doi: '10.1002/pip.3726' },
  nrel: { authors: 'NREL', title: 'Best Research-Cell Efficiency Chart', venue: 'nrel.gov/pv/cell-efficiency.html', year: 2023 },
  saliba2016: { authors: 'Saliba M., Matsui T., Seo J.-Y. et al.', title: 'Cesium-containing triple cation perovskite solar cells: improved stability, reproducibility and high efficiency', venue: 'Energy Environ. Sci., 9(6), 1989–1997', year: 2016, doi: '10.1039/C5EE03874J' },
  jeong2021: { authors: 'Jeong J., Kim M., Seo J. et al.', title: 'Pseudo-halide anion engineering for α-FAPbI3 perovskite solar cells', venue: 'Nature, 592, 381–385', year: 2021, doi: '10.1038/s41586-021-03406-5' },
  jiang2019: { authors: 'Jiang Q., Zhao Y., Zhang X. et al.', title: 'Surface passivation of perovskite film for efficient solar cells', venue: 'Nat. Photonics, 13, 460–466', year: 2019, doi: '10.1038/s41566-019-0398-2' },
  conings2015: { authors: 'Conings B., Drijkoningen J., Gauquelin N. et al.', title: 'Intrinsic thermal instability of methylammonium lead trihalide perovskite', venue: 'Adv. Energy Mater., 5(15), 1500477', year: 2015, doi: '10.1002/aenm.201500477' },
  rong2018: { authors: 'Rong Y., Hu Y., Mei A. et al.', title: 'Challenges for commercializing perovskite solar cells', venue: 'Science, 361(6408), eaat8235', year: 2018, doi: '10.1126/science.aat8235' },
  domanski2018: { authors: 'Domanski K., Alharbi E. A., Hagfeldt A. et al.', title: 'Systematic investigation of the impact of operation conditions on the degradation behaviour of perovskite solar cells', venue: 'Nat. Energy, 3, 61–67', year: 2018, doi: '10.1038/s41560-017-0060-8' },
  leijtens2013: { authors: 'Leijtens T., Eperon G. E., Pathak S. et al.', title: 'Overcoming ultraviolet light instability of sensitized TiO2 with meso-superstructured organometal tri-halide perovskite solar cells', venue: 'Nat. Commun., 4, 2885', year: 2013, doi: '10.1038/ncomms3885' },
  jackson2016: { authors: 'Jackson P., Wuerz R., Hariskos D. et al.', title: 'Effects of heavy alkali elements in Cu(In,Ga)Se2 solar cells with efficiencies up to 22.6%', venue: 'Phys. Status Solidi RRL, 10(8), 583–586', year: 2016, doi: '10.1002/pssr.201600199' },
  nakamura2019: { authors: 'Nakamura M., Yamaguchi K., Kimoto Y. et al.', title: 'Cd-free Cu(In,Ga)(Se,S)2 thin-film solar cell with record efficiency of 23.35%', venue: 'IEEE J. Photovolt., 9(6), 1863–1867', year: 2019, doi: '10.1109/JPHOTOV.2019.2937218' },
  contreras1999: { authors: 'Contreras M. A., Ramanathan K., AbuShama J. et al.', title: 'Diode characteristics in state-of-the-art ZnO/CdS/Cu(In1−xGax)Se2 solar cells', venue: 'Prog. Photovolt. Res. Appl., 13(3), 209–216', year: 2005, doi: '10.1002/pip.626' },
  burst2016: { authors: 'Burst J. M., Duenow J. N., Albin D. S. et al.', title: 'CdTe solar cells with open-circuit voltage breaking the 1 V barrier', venue: 'Nat. Energy, 1, 16015', year: 2016, doi: '10.1038/nenergy.2016.15' },
  gloeckler2013: { authors: 'Gloeckler M., Sankin I., Zhao Z.', title: 'CdTe solar cells at the threshold to 20% efficiency', venue: 'IEEE J. Photovolt., 3(4), 1389–1393', year: 2013, doi: '10.1109/JPHOTOV.2013.2278661' },
  romeo2004: { authors: 'Romeo N., Bosio A., Tedeschi R., Canevari V.', title: 'Growth of polycrystalline CdS and CdTe thin layers for high efficiency thin film solar cells', venue: 'Mater. Chem. Phys., 66(2–3), 201–206', year: 2000, doi: '10.1016/S0254-0584(00)00316-0' },
  kranz2013: { authors: 'Kranz L., Gretener C., Perrenoud J. et al.', title: 'Doping of polycrystalline CdTe for high-efficiency solar cells on flexible metal foil', venue: 'Nat. Commun., 4, 2306', year: 2013, doi: '10.1038/ncomms3306' },
  alashouri2020: { authors: 'Al-Ashouri A., Köhnen E., Li B. et al.', title: 'Monolithic perovskite/silicon tandem solar cell with >29% efficiency by enhanced hole extraction', venue: 'Science, 370(6522), 1300–1309', year: 2020, doi: '10.1126/science.abd4016' },
  bush2017: { authors: 'Bush K. A., Palmstrom A. F., Yu Z. J. et al.', title: '23.6%-efficient monolithic perovskite/silicon tandem solar cells with improved stability', venue: 'Nat. Energy, 2, 17009', year: 2017, doi: '10.1038/nenergy.2017.9' },
  sahli2018: { authors: 'Sahli F., Werner J., Kamino B. A. et al.', title: 'Fully textured monolithic perovskite/silicon tandem solar cells with 25.2% power conversion efficiency', venue: 'Nat. Mater., 17, 820–826', year: 2018, doi: '10.1038/s41563-018-0115-4' },
  noel2014: { authors: 'Noel N. K., Stranks S. D., Abate A. et al.', title: 'Lead-free organic–inorganic tin halide perovskites for photovoltaic applications', venue: 'Energy Environ. Sci., 7(9), 3061–3068', year: 2014, doi: '10.1039/C4EE01076K' },
  hao2014: { authors: 'Hao F., Stoumpos C. C., Cao D. H., Chang R. P. H., Kanatzidis M. G.', title: 'Lead-free solid-state organic–inorganic halide perovskite solar cells', venue: 'Nat. Photonics, 8, 489–494', year: 2014, doi: '10.1038/nphoton.2014.82' },
  ogomi2014: { authors: 'Ogomi Y., Morita A., Tsukamoto S. et al.', title: 'CH3NH3SnxPb(1−x)I3 perovskite solar cells covering up to 1060 nm', venue: 'J. Phys. Chem. Lett., 5(6), 1004–1011', year: 2014, doi: '10.1021/jz5002117' },
  lewis2020: { authors: 'Lewis P., Perez E., Piktus A. et al.', title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', venue: 'NeurIPS 2020', year: 2020, arxiv: '2005.11401' },
  karpukhin2020: { authors: 'Karpukhin V., Oğuz B., Min S. et al.', title: 'Dense Passage Retrieval for Open-Domain Question Answering', venue: 'EMNLP 2020', year: 2020, arxiv: '2004.04906' },
  robertson2009: { authors: 'Robertson S., Zaragoza H.', title: 'The Probabilistic Relevance Framework: BM25 and Beyond', venue: 'Found. Trends Inf. Retr., 3(4), 333–389', year: 2009, doi: '10.1561/1500000019' },
  nogueira2019: { authors: 'Nogueira R., Cho K.', title: 'Passage Re-ranking with BERT', venue: 'arXiv preprint', year: 2019, arxiv: '1901.04085' },
  nogueira2020: { authors: 'Nogueira R., Jiang Z., Pradeep R., Lin J.', title: 'Document Ranking with a Pretrained Sequence-to-Sequence Model', venue: 'Findings of EMNLP 2020', year: 2020, arxiv: '2003.06713' },
  cormack2009: { authors: 'Cormack G. V., Clarke C. L. A., Büttcher S.', title: 'Reciprocal rank fusion outperforms Condorcet and individual rank learning methods', venue: 'SIGIR 2009, 758–759', year: 2009, doi: '10.1145/1571941.1572114' },
  thakur2021: { authors: 'Thakur N., Reimers N., Rücklé A., Srivastava A., Gurevych I.', title: 'BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of Information Retrieval Models', venue: 'NeurIPS Datasets and Benchmarks 2021', year: 2021, arxiv: '2104.08663' },
  khattab2020: { authors: 'Khattab O., Zaharia M.', title: 'ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT', venue: 'SIGIR 2020', year: 2020, arxiv: '2004.12832' },
  liu2023: { authors: 'Liu N. F., Lin K., Hewitt J. et al.', title: 'Lost in the Middle: How Language Models Use Long Contexts', venue: 'TACL, 12, 157–173', year: 2023, arxiv: '2307.03172' },
  gao2023: { authors: 'Gao Y., Xiong Y., Gao X. et al.', title: 'Retrieval-Augmented Generation for Large Language Models: A Survey', venue: 'arXiv preprint', year: 2023, arxiv: '2312.10997' },
  reimers2019: { authors: 'Reimers N., Gurevych I.', title: 'Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks', venue: 'EMNLP 2019', year: 2019, arxiv: '1908.10084' },
}

export type RefStatus = 'ok' | 'unparsed'

export interface Reference {
  n: number
  key: string
  authors: string
  title: string
  venue: string
  year: number | null
  doi?: string
  arxiv?: string
  raw?: string
  status: RefStatus
  mentions: string[]
}

type Row = [string, ...string[]]

const LISTS: Record<string, Row[]> = {
  mapbi: [
    ['kojima2009', 'Перовскиты впервые применили в солнечных элементах в 2009 г. [#].', 'Базовая архитектура n-i-p описана в [#].'],
    ['sq1961', 'Предел эффективности для поглотителя с таким Eg оценён в [#].'],
    ['green2023', 'Сравнение с лучшими лабораторными элементами — по таблицам [#].'],
    ['saliba2016', 'Состав поглотителя подобран по методике [#], что улучшило воспроизводимость.', 'Рост Voc согласуется с данными [#].'],
    ['jeong2021', 'Анионная инженерия интерфейсов даёт сопоставимый прирост FF [#].'],
    ['jiang2019', 'Пассивация поверхностных дефектов снижает потери Voc, как показано в [#].', 'Мы использовали схожую обработку поверхности [#].'],
    ['conings2015', 'Термическая нестабильность MAPbI₃ отмечена ещё в [#].'],
    ['rong2018', 'Вопросы коммерциализации обсуждаются в обзоре [#].'],
    ['?Лукин П. Т. Пассивация границ в гибридных перовскитах // Тез. докл. конф. «Фотоника-2021», с. 45', 'Предварительные результаты по пассивации приведены в [#].'],
    ['domanski2018', 'Деградация при нагреве исследована в [#].'],
  ],
  cigs: [
    ['sq1961', 'Теоретический предел для Eg = 1,15 эВ — по [#].'],
    ['green2023', 'Рекордные значения КПД приведены по таблицам [#].'],
    ['jackson2016', 'Щелочное легирование тяжёлыми металлами повышает Voc, как в [#].', 'Мы воспроизводим схему обработки из [#].'],
    ['nakamura2019', 'Элемент без кадмия с КПД 23,35 % описан в [#].'],
    ['contreras1999', 'Диодные характеристики стандартной структуры ZnO/CdS/CIGS — [#].'],
    ['@cdte', 'Для сравнения с CdTe-технологией см. [#].'],
    ['burst2016', 'Напряжение холостого хода выше 1 В достигнуто на CdTe [#].'],
    ['nrel', 'Актуальная диаграмма рекордов КПД — [#].'],
    ['?Смирнова О. П. Отчёт о НИР «Гибкие CIGS», ФТИ, 2022, 38 с.', 'Условия осаждения на полиимид — в отчёте [#].'],
  ],
  cdte: [
    ['sq1961', 'Предел Шокли — Квайссера для CdTe (Eg = 1,45 эВ) — [#].'],
    ['green2023', 'Рекордные КПД — по таблицам [#].'],
    ['burst2016', 'Рост Voc после обработки хлоридом — [#].', 'Сопоставимый результат получен в [#].'],
    ['gloeckler2013', 'Путь к КПД 20 % на CdTe описан в [#].'],
    ['romeo2004', 'Рекристаллизация слоёв CdTe при CdCl₂-обработке — [#].'],
    ['kranz2013', 'Легирование CdTe для гибких подложек — [#].'],
    ['nrel', 'Лучшие элементы на CdTe — по диаграмме [#].'],
    ['?Петров И. Н. Хлоридная обработка поликристаллического CdTe. Дисс. … канд. физ.-мат. наук, 2020', 'Режимы отжига взяты из диссертации [#].'],
  ],
  czts: [
    ['sq1961', 'Предел Шокли — Квайссера для Eg около 1,1 эВ — [#].'],
    ['green2023', 'Таблицы эффективности — [#].'],
    ['jackson2016', 'Щелочная и Ge-обработка тыльной границы — по аналогии с [#].'],
    ['@cigs', 'Структура Mo/абсорбер/CdS/ZnO — как у CIGS [#].'],
    ['contreras1999', 'Диодные характеристики стандартной структуры — [#].'],
    ['nrel', 'Диаграмма рекордов КПД — [#].'],
    ['?Фёдоров А. С. Кестериты на молибденовом контакте. Препринт, 2023', 'Детали тыльного контакта — в препринте [#].'],
  ],
  stab: [
    ['@mapbi', 'В качестве образца использован элемент из работы [#].', 'Пассивация поверхности по [#] повышает стартовый КПД.'],
    ['conings2015', 'Разложение MAPbI₃ при 85 °C наблюдали ещё в [#].'],
    ['leijtens2013', 'Фотоиндуцированные процессы деградации — [#].'],
    ['domanski2018', 'Влияние условий работы на деградацию — [#].', 'Методика ускоренных испытаний соответствует [#].'],
    ['saliba2016', 'Смешанные катионы повышают стабильность [#].'],
    ['jiang2019', 'Пассивация поверхности замедляет разрушение плёнки [#].'],
    ['rong2018', 'Критерии стабильности для коммерциализации — [#].'],
    ['kojima2009', 'Исходная конструкция перовскитного элемента — [#].'],
    ['?Орлов В. В. Деградация плёнок MAPbI₃ при нагреве // Вестн. МГУ, сер. 3, 2021, № 4', 'Кинетика потери КПД описана в [#].'],
  ],
  leadfree: [
    ['@mapbi', 'Эталонный свинцовый элемент — КПД 18,6 % [#].', 'Условия измерения те же, что в [#].'],
    ['@stab', 'Для сравнения стабильности взят свинцовый аналог [#].'],
    ['noel2014', 'Первые оловянные перовскиты для фотовольтаики — [#].'],
    ['hao2014', 'Бессвинцовые элементы на CH₃NH₃SnI₃ — [#].'],
    ['ogomi2014', 'Смешанные Sn–Pb составы расширяют спектр поглощения [#].'],
    ['kojima2009', 'Исторический контекст — [#].'],
    ['sq1961', 'Оптимальная ширина зоны по [#] близка к 1,3 эВ.'],
    ['green2023', 'Таблицы рекордов — [#].'],
    ['?Belyaev K. S. et al. Ge-doped tin halide perovskites. In press, 2024', 'Часть результатов по германию ожидает публикации [#].'],
  ],
  hybrid: [
    ['@chunks', 'Размер чанка выбран по результатам [#].', 'Влияние длины фрагмента на полноту поиска — [#].'],
    ['robertson2009', 'Лексический компонент — BM25 [#].'],
    ['karpukhin2020', 'Векторный компонент — двухбашенный энкодер [#].', 'Схема обучения как в [#].'],
    ['lewis2020', 'Поиск встроен в RAG-конвейер по [#].'],
    ['cormack2009', 'Слияние списков выполнено по правилу RRF [#].'],
    ['thakur2021', 'Оценка на разнородных коллекциях — по протоколу [#].'],
    ['khattab2020', 'Поздние взаимодействия как альтернатива — [#].'],
    ['reimers2019', 'Эмбеддинги предложений получены моделью типа [#].'],
    ['?Соколов М. И., Дьячкова А. Р. Гибридный поиск для русскоязычных корпусов. Препринт, 2023', 'Предварительные оценки — в [#].'],
  ],
  chunks: [
    ['lewis2020', 'Классическая схема RAG — [#].'],
    ['karpukhin2020', 'Фрагменты по 100 слов в [#] стали де-факто стандартом.'],
    ['robertson2009', 'BM25 как базовая линия — [#].'],
    ['liu2023', 'Длинный контекст хуже используется моделью, чем начало и конец [#].'],
    ['gao2023', 'Обзор приёмов разбиения документов — [#].'],
    ['thakur2021', 'Сравнение на BEIR — [#].'],
    ['reimers2019', 'Эмбеддинги — модели семейства [#].'],
    ['?Захарова Н. В. Сегментация научных текстов для информационного поиска. Дисс., 2021', 'Правила деления по абзацам взяты из [#].'],
  ],
  rerank: [
    ['@hybrid', 'Первичный список кандидатов формируется гибридным поиском [#].', 'Recall@5 до переранжирования — как в [#].'],
    ['@chunks', 'Размер чанка — 512 токенов, по выводам [#].'],
    ['nogueira2019', 'Переранжирование кросс-энкодером на основе BERT — [#].', 'Наша модель обучена по схеме из [#].'],
    ['nogueira2020', 'Альтернатива — seq2seq-ранжировщик [#].'],
    ['karpukhin2020', 'Первый этап — векторный поиск [#].'],
    ['robertson2009', 'Лексический этап — BM25 [#].'],
    ['khattab2020', 'Late interaction как компромисс по скорости [#].'],
    ['thakur2021', 'Тесты на BEIR — [#].'],
    ['lewis2020', 'Качество ответа зависит от найденных фрагментов [#].'],
    ['?Ву Т. Задержка кросс-энкодеров на CPU. Техн. отчёт, 2024', 'Замеры задержки приведены в отчёте [#].'],
  ],
}

export function referencesOf(paperId: string): Reference[] {
  const id = paperOf(paperId)?.seed ?? paperId
  const rows = LISTS[id]
  if (!rows) return []
  return rows.map(([key, ...ctx], i): Reference => {
    const n = i + 1
    const mentions = ctx.map((c) => c.replace(/\[#\]/g, `[${n}]`))
    if (key.startsWith('?')) {
      const raw = key.slice(1)
      const year = raw.match(/\b(19|20)\d{2}\b/)?.[0]
      return { n, key: 'u:' + n, authors: raw.split(/\s{1}(?=[А-ЯA-Z])/)[0] ?? '', title: raw, venue: '', year: year ? +year : null, raw, status: 'unparsed', mentions }
    }
    if (key.startsWith('@')) {
      const s = SEEDS.find((x) => x.id === key.slice(1))!
      return { n, key: 'p:' + s.id, authors: s.authors, title: s.title, venue: s.journal, year: s.year, status: 'ok', mentions }
    }
    const w = EXTERNAL[key]!
    const found = !!(w.doi || w.arxiv)
    return { n, key: 'x:' + key, authors: w.authors, title: w.title, venue: w.venue, year: w.year, doi: w.doi, arxiv: w.arxiv, raw: found ? undefined : `${w.authors}. ${w.title}. ${w.venue}`, status: found ? 'ok' : 'unparsed', mentions }
  })
}

export function refIdLabel(r: Pick<Reference, 'doi' | 'arxiv'>): string {
  return r.doi ? 'DOI ' + r.doi : r.arxiv ? 'arXiv:' + r.arxiv : 'идентификатор не найден'
}
export function refUrl(r: Pick<Reference, 'doi' | 'arxiv'>): string | null {
  return r.doi ? 'https://doi.org/' + r.doi : r.arxiv ? 'https://arxiv.org/abs/' + r.arxiv : null
}
