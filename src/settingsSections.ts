export type SectionId = 'profile' | 'appearance' | 'keys' | 'normalize' | 'export'
export const SECTIONS: { id: SectionId; name: string; hint: string; icon: string }[] = [
  { id: 'profile', name: 'Профиль', hint: 'Имя, почта, пароль, сводка работы', icon: 'user' },
  { id: 'appearance', name: 'Внешний вид', hint: 'Тема, цвет, размер текста', icon: 'sun' },
  { id: 'keys', name: 'Клавиши', hint: 'Горячие клавиши и их свои сочетания', icon: 'keyboard' },
  { id: 'normalize', name: 'Нормализация', hint: 'Синонимы, единицы, материалы', icon: 'book' },
  { id: 'export', name: 'Экспорт и API', hint: 'Выгрузка данных и доступ по API', icon: 'share' },
]
export const sectionOf = (v: unknown): SectionId | null => SECTIONS.find((s) => s.id === v)?.id ?? null
