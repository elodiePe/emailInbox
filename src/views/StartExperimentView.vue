<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSimulationStore } from '../composables/useSimulationStore'

const router = useRouter()
const { restartSimulation } = useSimulationStore()
const isStarting = ref(false)

async function startExperiment() {
  if (isStarting.value) return
  isStarting.value = true

  try {
    await restartSimulation()
    router.replace('/')
  } finally {
    isStarting.value = false
  }
}
</script>

<template>
  <main class="start-experiment">
    <button class="start-btn" :disabled="isStarting" @click="startExperiment">
      {{ isStarting ? 'Starting...' : 'Start Experiment' }}
    </button>
  </main>
</template>

<style scoped>
.start-experiment {
  min-height: calc(100vh - 80px);
  background: #ffffff;
  display: grid;
  place-items: center;
}

.start-btn {
  padding: 0.9rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  background: #0a5dca;
  color: #ffffff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.start-btn:disabled {
  background: #b7b7b7;
  cursor: not-allowed;
}
</style>