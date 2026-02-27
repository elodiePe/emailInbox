<script setup>
import { onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useSimulationStore } from './composables/useSimulationStore'

const { initializeSimulation, currentSessionId, switchSession } = useSimulationStore()
const sessionInput = ref('')

function joinSession() {
  void switchSession(sessionInput.value)
}

watch(currentSessionId, (value) => {
  sessionInput.value = value
}, { immediate: true })

onMounted(() => {
  initializeSimulation()
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <h1>Email Inbox</h1>
      <div class="session-switcher">
        <input v-model="sessionInput" type="text" placeholder="Session ID" />
        <button @click="joinSession">Join Session</button>
      </div>
      <!-- <p>Intro + 3 groups x 3 emails, unlocked by completed tasks.</p> -->
    </header>

    <nav class="tabs route-tabs">
      <RouterLink to="/" class="tab-link" active-class="active" exact-active-class="active">
        Inbox & Send
      </RouterLink>
      <RouterLink to="/admin" class="tab-link" active-class="active">
        Admin
      </RouterLink>
    </nav>

    <RouterView />
  </div>
</template>
