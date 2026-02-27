<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useSimulationStore } from './composables/useSimulationStore'

const { initializeSimulation, currentSessionId, switchSession, syncStatus, syncMessage } = useSimulationStore()
const sessionInput = ref('')
const route = useRoute()

const isAdminRoute = computed(() => route.path.startsWith('/admin'))

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
      <p v-if="isAdminRoute && syncStatus === 'error'" class="sync-warning">{{ syncMessage }}</p>
      <div v-if="isAdminRoute" class="session-switcher">
        <input v-model="sessionInput" type="text" placeholder="Session ID" />
        <button @click="joinSession">Join Session</button>
      </div>
      <!-- <p>Intro + 3 groups x 3 emails, unlocked by completed tasks.</p> -->
    </header>

    <nav class="route-nav">
      <!-- <RouterLink to="/" exact-active-class="router-link-active">Inbox</RouterLink>
      <RouterLink to="/admin" exact-active-class="router-link-active">Admin</RouterLink>
      <RouterLink to="/usability" exact-active-class="router-link-active">Usability</RouterLink> -->
    </nav>

    <RouterView />
  </div>
</template>
