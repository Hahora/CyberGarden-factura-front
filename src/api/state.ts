import { reactive } from 'vue'
import { isApi } from '../config'

export const runsLoad = reactive<{ state: 'loading' | 'ready' | 'error' }>({ state: isApi ? 'loading' : 'ready' })
