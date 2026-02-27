<script setup>
import { onMounted, ref } from 'vue'
import { useSimulationStore } from '../composables/useSimulationStore'

const {
  groupOrder,
  allTasksByGroup,
  unlockedGroups,
  selectedEmail,
  selectedEmailId,
  incomingEmails,
  inboxCount,
  sentEmails,
  composeForm,
  completedTasks,
  toggleTask,
  selectEmail,
  sendEmail,
  initializeSimulation
} = useSimulationStore()

const activeTab = ref('inbox')

onMounted(() => {
  initializeSimulation()
})
</script>

<template>
  <div>
    <nav class="tabs">
      <button :class="{ active: activeTab === 'inbox' }" @click="activeTab = 'inbox'">
        Inbox ({{ inboxCount }})
      </button>
      <button :class="{ active: activeTab === 'send' }" @click="activeTab = 'send'">
        Send Email
      </button>
    </nav>

    <main v-if="activeTab === 'inbox'" class="inbox-layout">
      <section class="panel task-panel">
        <h2>Task Progress</h2>
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
        </div>
      </section>

      <section class="panel list-panel">
        <h2>Inbox</h2>
        <ul class="email-list">
          <li
            v-for="email in incomingEmails"
            :key="email.instanceId"
            :class="{ selected: selectedEmailId === email.instanceId, unread: !email.isRead }"
            @click="selectEmail(email.instanceId)"
          >
            <p class="subject">{{ email.subject }}</p>
            <p class="meta">{{ email.from }} • {{ email.receivedAt }}</p>
          </li>
          <li v-if="incomingEmails.length === 0" class="empty">No emails received yet.</li>
        </ul>
      </section>

      <section class="panel detail-panel">
        <h2>Email Detail</h2>
        <template v-if="selectedEmail">
          <p><strong>From:</strong> {{ selectedEmail.from }}</p>
          <p><strong>Subject:</strong> {{ selectedEmail.subject }}</p>
          <p><strong>Received:</strong> {{ selectedEmail.receivedAt }}</p>
          <p class="body">{{ selectedEmail.body }}</p>
          <label v-if="selectedEmail.taskId" class="task-row">
            <input
              type="checkbox"
              :checked="completedTasks[selectedEmail.taskId] === true"
              @change="toggleTask(selectedEmail.taskId, $event.target.checked)"
            />
            <span>Mark task complete: {{ selectedEmail.taskLabel }}</span>
          </label>
        </template>
        <p v-else>Select an email to see details.</p>
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
  </div>
</template>
