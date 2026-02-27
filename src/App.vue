<script setup>
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useSimulationStore } from './composables/useSimulationStore'

const { initializeSimulation } = useSimulationStore()

onMounted(() => {
  initializeSimulation()
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <h1>Email Inbox</h1>
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
