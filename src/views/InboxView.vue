<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSimulationStore } from '../composables/useSimulationStore'

const {
  groupOrder,
  allTasksByGroup,
  unlockedGroups,
  selectedEmailId,
  incomingEmails,
  inboxCount,
  sentEmails,
  composeForm,
  completedTasks,
  toggleTask,
  selectEmail,
  toggleEmailUnsafe,
  sendEmail,
  initializeSimulation
} = useSimulationStore()

const activeTab = ref('inbox')
const searchQuery = ref('')
const router = useRouter()

const pendingTasks = computed(() => {
  const tasks = groupOrder.value.flatMap((group) => allTasksByGroup.value[group.id] || [])
  return tasks.filter((task) => completedTasks.value[task.taskId] !== true).length
})

const unreadCount = computed(() => {
  return incomingEmails.value.filter((email) => !email.isRead).length
})

const filteredIncomingEmails = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return incomingEmails.value

  return incomingEmails.value.filter((email) => {
    const from = String(email.from || '').toLowerCase()
    const subject = String(email.subject || '').toLowerCase()
    const body = String(email.body || '').toLowerCase()
    return from.includes(query) || subject.includes(query) || body.includes(query)
  })
})

function getPreview(body) {
  if (!body) return ''
  return body.length > 80 ? `${body.slice(0, 80)}...` : body
}

function openEmail(emailId) {
  selectEmail(emailId)
  router.push(`/inbox/${encodeURIComponent(emailId)}`)
}

function toggleUnsafeFromList(email) {
  toggleEmailUnsafe(email.instanceId, !email.isUnsafe)
}

onMounted(() => {
  initializeSimulation()
})
</script>

<template>
  <!-- <nav class="tabs">
    <button :class="{ active: activeTab === 'inbox' }" @click="activeTab = 'inbox'">Inbox ({{ inboxCount }})</button>
    <button :class="{ active: activeTab === 'send' }" @click="activeTab = 'send'">Send Email</button>
  </nav> -->

  <main v-if="activeTab === 'inbox'" class="mail-layout">
    <section class="panel mailbox-sidebar">
      <button class="compose-cta" @click="activeTab = 'send'">+ Compose</button>
<!-- 
      <h2>Folders</h2> -->
      <ul class="folder-list">
        <li class="active">Inbox <span>{{ inboxCount }}</span></li>
<li>Unread <span>{{ unreadCount }}</span></li>
        <!-- <li>Pending Tasks <span>{{ pendingTasks }}</span></li> -->
      </ul>

      <!-- <h2>Task Progress</h2>
      <div v-for="group in groupOrder" :key="group.id" class="group-block">
        <h3>
          {{ group.label }}
          <span class="status" :class="{ unlocked: unlockedGroups[group.id] || group.id === 'intro' }">
            {{ group.id === 'intro' ? 'Active' : unlockedGroups[group.id] ? 'Unlocked' : 'Locked' }}
          </span>
        </h3>
        <label v-for="task in allTasksByGroup[group.id]" :key="task.taskId" class="task-row">
          <input
            type="checkbox"
            :checked="completedTasks[task.taskId] === true"
            @change="toggleTask(task.taskId, $event.target.checked)"
          />
          <span>{{ task.label }}</span>
        </label>
      </div> -->
    </section>

    <section class="panel inbox-list-panel">
      <div class="mail-toolbar">
        <h2>Inbox</h2>
        <input v-model="searchQuery" type="text" placeholder="Search mail" />
      </div>
      <ul class="email-list">
        <li
          v-for="email in filteredIncomingEmails"
          :key="email.instanceId"
          :class="{ unread: !email.isRead }"
          @click="openEmail(email.instanceId)"
        >
          <div class="mail-row-top">
            <p class="sender">{{ email.from }}</p>
            <div class="mail-row-actions">
              <p class="meta">{{ email.receivedAt }}</p>
              <button
                type="button"
                class="unsafe-quick-btn"
                :class="{ active: email.isUnsafe }"
                @click.stop="toggleUnsafeFromList(email)"
              >
                {{ email.isUnsafe ? 'Unsafe' : 'Mark Unsafe' }}
              </button>
            </div>
          </div>
          <p class="subject">
            {{ email.subject }}
            <span v-if="email.isUnsafe" class="mail-flag-unsafe">Unsafe</span>
          </p>
          <p class="snippet">{{ getPreview(email.body) }}</p>
        </li>
        <li v-if="incomingEmails.length === 0" class="empty">No emails received yet.</li>
        <li v-else-if="filteredIncomingEmails.length === 0" class="empty">No emails match your search.</li>
      </ul>
    </section>
  </main>

  <main v-else class="send-layout">
    <section class="panel send-panel">
      <h2>Compose Email</h2>
      <label>
        To
        <input v-model="composeForm.to" type="email" placeholder="person@company.test" />
      </label>
      <label>
        Subject
        <input v-model="composeForm.subject" type="text" placeholder="Subject" />
      </label>
      <label>
        Message
        <textarea v-model="composeForm.body" rows="8" placeholder="Write your email"></textarea>
      </label>
      <button @click="sendEmail">Send</button>
    </section>

    <section class="panel sent-panel">
      <h2>Sent Emails</h2>
      <ul class="email-list">
        <li v-for="email in sentEmails" :key="email.id">
          <p class="subject">{{ email.subject }}</p>
          <p class="meta">To: {{ email.to }} • {{ email.sentAt }}</p>
        </li>
        <li v-if="sentEmails.length === 0" class="empty">No sent emails yet.</li>
      </ul>
    </section>
  </main>
</template>