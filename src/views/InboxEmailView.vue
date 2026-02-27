<script setup>
import { computed, onMounted, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useSimulationStore } from '../composables/useSimulationStore'

const route = useRoute()
const {
  incomingEmails,
  completedTasks,
  toggleTask,
  selectEmail,
  initializeSimulation,
  sentEmails,
  toggleEmailDangerous
} = useSimulationStore()

const unreadCount = computed(() => incomingEmails.value.filter((item) => !item.isRead).length)

const email = computed(() => {
  const id = String(route.params.id || '')
  return incomingEmails.value.find((item) => item.instanceId === id) || null
})

function syncSelectedEmailFromRoute() {
  const id = String(route.params.id || '')
  if (!id) return
  selectEmail(id)
}

onMounted(() => {
  initializeSimulation()
  syncSelectedEmailFromRoute()
})

watch(
  () => route.params.id,
  () => {
    syncSelectedEmailFromRoute()
  }
)
</script>

<template>
  <main class="mail-layout">
    <section class="panel mailbox-sidebar">
      <RouterLink to="/" class="compose-cta" style="display: inline-block; text-align: center; text-decoration: none; color: inherit;">
        Back to Inbox
      </RouterLink>

      <h2>Folders</h2>
      <ul class="folder-list">
        <li class="active">Inbox <span>{{ incomingEmails.length }}</span></li>
        <li>Unread <span>{{ unreadCount }}</span></li>
        <li>Sent <span>{{ sentEmails.length }}</span></li>
      </ul>
    </section>

    <section class="panel inbox-list-panel mail-read-panel">
      <div class="mail-toolbar">
        <h2>Email Detail</h2>
        <RouterLink to="/" class="tab-link back-link">Back to Inbox</RouterLink>
      </div>

      <div class="mail-detail-panel">
        <template v-if="email">
          <div class="mail-header-block">
            <p class="subject">{{ email.subject }}</p>
            <p class="meta">From: {{ email.from }}</p>
            <p class="meta">Received: {{ email.receivedAt }}</p>
            <p v-if="email.isDangerous" class="danger-label">Marked as dangerous</p>
          </div>

          <p class="body mail-body">{{ email.body }}</p>

          <label class="task-row">
            <input
              type="checkbox"
              :checked="email.isDangerous === true"
              @change="toggleEmailDangerous(email.instanceId, $event.target.checked)"
            />
            <span>Declare this email as dangerous</span>
          </label>

          <label v-if="email.taskId" class="task-row">
            <input
              type="checkbox"
              :checked="completedTasks[email.taskId] === true"
              @change="toggleTask(email.taskId, $event.target.checked)"
            />
            <span>Mark task complete: {{ email.taskLabel }}</span>
          </label>
        </template>
        <p v-else>Email not found in inbox.</p>
      </div>
    </section>
  </main>
</template>
