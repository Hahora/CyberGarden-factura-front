<script setup lang="ts">
import { toRef } from 'vue'
import { useLoadGate } from '../useLoad'

const props = withDefaults(defineProps<{ loading: boolean; min?: number; delay?: number; tag?: string; error?: boolean }>(), { min: 300, delay: 150, tag: 'div' })
const { phase, animate } = useLoadGate(toRef(props, 'loading'), { min: props.min, delay: props.delay })
</script>

<template>
  <component :is="tag" v-if="error && !loading" class="ul"><slot name="error" /></component>
  <component :is="tag" v-else-if="phase === 'sk'" class="ul ul--sk" aria-busy="true"><slot name="skeleton" /></component>
  <component :is="tag" v-else-if="phase === 'content'" class="ul" :class="{ reveal: animate }"><slot /></component>
  <component :is="tag" v-else class="ul ul--wait" aria-busy="true" />
</template>

<style scoped>
.ul { min-width: 0; }
</style>
