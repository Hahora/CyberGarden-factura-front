export const DATA_SOURCE: 'mock' | 'api' = import.meta.env.VITE_DATA_SOURCE === 'api' ? 'api' : 'mock'
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api/v1'
export const isApi = DATA_SOURCE === 'api'
export const DEV_TEXT = 'В разработке'
