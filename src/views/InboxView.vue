<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
const selectedFolder = ref('inbox')
const isMobileSidebarOpen = ref(false)
const router = useRouter()
const route = useRoute()

const pendingTasks = computed(() => {
  const tasks = groupOrder.value.flatMap((group) => allTasksByGroup.value[group.id] || [])
  return tasks.filter((task) => completedTasks.value[task.taskId] !== true).length
})

const unreadCount = computed(() => {
  return incomingEmails.value.filter((email) => !email.isRead).length
})

const filteredIncomingEmails = computed(() => {
  let emails = incomingEmails.value

  if (selectedFolder.value === 'unread') {
    emails = emails.filter((email) => !email.isRead)
  }

  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return emails

  return emails.filter((email) => {
    const from = String(email.from || '').toLowerCase()
    const subject = String(email.subject || '').toLowerCase()
    const body = String(email.body || '').toLowerCase()
    return from.includes(query) || subject.includes(query) || body.includes(query)
  })
})

const filteredSentEmails = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return sentEmails.value

  return sentEmails.value.filter((email) => {
    const to = String(email.to || '').toLowerCase()
    const subject = String(email.subject || '').toLowerCase()
    const body = String(email.body || '').toLowerCase()
    return to.includes(query) || subject.includes(query) || body.includes(query)
  })
})

const isInboxFolder = computed(() => selectedFolder.value === 'inbox')
const isUnreadFolder = computed(() => selectedFolder.value === 'unread')
const isSentFolder = computed(() => selectedFolder.value === 'sent')

function stripHtmlTags(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

function getPreview(body) {
  if (!body) return ''
  const plainText = stripHtmlTags(body)
  return plainText.length > 80 ? `${plainText.slice(0, 80)}...` : plainText
}

function getSubjectPreview(subject) {
  const value = String(subject || '')
  return value.length > 50 ? `${value.slice(0, 50)}...` : value
}

function openEmail(emailId) {
  selectEmail(emailId)
  isMobileSidebarOpen.value = false
  router.push(`/inbox/${encodeURIComponent(emailId)}`)
}

function openSentEmail(emailId) {
  isMobileSidebarOpen.value = false
  router.push(`/sent/${encodeURIComponent(emailId)}`)
}

function toggleUnsafeFromList(email) {
  toggleEmailUnsafe(email.instanceId, !email.isUnsafe)
}

function syncFromQuery() {
  const tab = route.query.tab === 'send' ? 'send' : 'inbox'
  const folder = route.query.folder === 'unread' || route.query.folder === 'sent' ? route.query.folder : 'inbox'

  activeTab.value = tab
  selectedFolder.value = tab === 'send' ? 'sent' : folder
}

function setInboxFolder(folder) {
  activeTab.value = 'inbox'
  selectedFolder.value = folder
  isMobileSidebarOpen.value = false
  router.replace({ path: '/', query: folder === 'inbox' ? {} : { folder } })
}

function openCompose() {
  activeTab.value = 'send'
  selectedFolder.value = 'sent'
  isMobileSidebarOpen.value = false
  router.replace({ path: '/', query: { tab: 'send', folder: 'sent' } })
}

function toggleMobileSidebar() {
  isMobileSidebarOpen.value = !isMobileSidebarOpen.value
}

function closeMobileSidebar() {
  isMobileSidebarOpen.value = false
}

function openSentFolder() {
  openCompose()
}

onMounted(() => {
  initializeSimulation()
  syncFromQuery()
})

watch(
  () => route.query,
  () => {
    syncFromQuery()
  }
)
</script>

<template>
  <!-- <nav class="tabs">
    <button :class="{ active: activeTab === 'inbox' }" @click="activeTab = 'inbox'">Inbox ({{ inboxCount }})</button>
    <button :class="{ active: activeTab === 'send' }" @click="activeTab = 'send'">Send Email</button>
  </nav> -->

  <main v-if="activeTab === 'inbox'" class="mail-layout">
    <section class="panel mailbox-sidebar" :class="{ 'mobile-open': isMobileSidebarOpen }">
      <button class="compose-cta" @click="openCompose">+ Compose</button>
<!-- 
      <h2>Folders</h2> -->
      <ul class="folder-list">
        <li :class="{ active: isInboxFolder }" @click="setInboxFolder('inbox')">Inbox <span>{{ inboxCount }}</span></li>
        <li :class="{ active: isUnreadFolder }" @click="setInboxFolder('unread')">Unread <span>{{ unreadCount }}</span></li>
        <li :class="{ active: isSentFolder }" @click="setInboxFolder('sent')">Sent <span>{{ sentEmails.length }}</span></li>
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

    <button
      class="mobile-sidebar-backdrop"
      :class="{ visible: isMobileSidebarOpen }"
      aria-label="Close sidebar"
      @click="closeMobileSidebar"
    ></button>

    <section class="panel inbox-list-panel">
      <div class="mail-toolbar">
        <button class="mobile-sidebar-toggle" @click="toggleMobileSidebar" aria-label="Toggle folders">☰</button>
        <h2>Inbox</h2>
        <input v-model="searchQuery" type="text" placeholder="Search mail" />
      </div>
      <ul class="email-list">
        <li
          v-if="selectedFolder !== 'sent'"
          v-for="email in filteredIncomingEmails"
          :key="email.instanceId"
          :class="{ unread: !email.isRead }"
          @click="openEmail(email.instanceId)"
        >
          <div class="mail-row-top inbox-row-inline">
            <p class="subject inbox-subject" :title="email.subject">
              {{ getSubjectPreview(email.subject) }}
            </p>
            <p class="snippet inbox-snippet">{{ getPreview(email.body) }}</p>
            <div class="mail-row-actions">
              <p class="meta">{{ email.receivedAt }}</p>
              <!-- <button
                type="button"
                class="unsafe-quick-btn"
                :class="{ active: email.isUnsafe }"
                @click.stop="toggleUnsafeFromList(email)"
              >
                {{ email.isUnsafe ? 'Unsafe' : 'Mark Unsafe' }}
              </button> -->
            </div>
          </div>
          <!-- <p class="subject">
            {{ email.subject }}
            <span v-if="email.isUnsafe" class="mail-flag-unsafe">Unsafe</span>
          </p>
          <p class="snippet">{{ getPreview(email.body) }}</p> -->
        </li>
        <li
          v-if="selectedFolder === 'sent'"
          v-for="email in filteredSentEmails"
          :key="email.id"
          @click="openSentEmail(email.id)"
        >
          <div class="mail-row-top inbox-row-inline">
            <p class="subject inbox-subject" :title="email.subject">
              {{ getSubjectPreview(email.subject) }}
            </p>
            <p class="snippet inbox-snippet">{{ getPreview(email.body) }}</p>
            <div class="mail-row-actions">
              <p class="meta">{{ email.sentAt }}</p>
            </div>
          </div>
        </li>
        <li v-if="selectedFolder !== 'sent' && incomingEmails.length === 0" class="empty">No emails received yet.</li>
        <li v-else-if="selectedFolder !== 'sent' && filteredIncomingEmails.length === 0" class="empty">No emails match your search.</li>
        <li v-if="selectedFolder === 'sent' && sentEmails.length === 0" class="empty">No sent emails yet.</li>
        <li v-else-if="selectedFolder === 'sent' && filteredSentEmails.length === 0" class="empty">No sent emails match your search.</li>
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

<style scoped>
.inbox-row-inline {
  display: flex;
  align-items: center;
  gap: 12px;
}

.inbox-subject {
  flex: 0 0 40ch;
  max-width: 50ch;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.inbox-snippet {
  flex: 1;
  min-width: 0;
  margin: 0;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inbox-row-inline .mail-row-actions {
  margin-left: auto;
  flex-shrink: 0;
}

.inbox-row-inline .meta {
  margin: 0;
}

.mobile-sidebar-toggle {
  display: none;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #0f172a;
  border-radius: 8px;
  width: 36px;
  height: 36px;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.mobile-sidebar-backdrop {
  display: none;
}

@media (max-width: 980px) {
  .inbox-subject {
    max-width: 20ch;
  }
}

@media (max-width: 760px) {
  .mail-layout {
    grid-template-columns: 1fr;
  }

  .mobile-sidebar-toggle {
    display: inline-grid;
    place-items: center;
  }

  .mailbox-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: min(82vw, 300px);
    z-index: 30;
    transform: translateX(-104%);
    transition: transform 0.22s ease;
    border-radius: 0 12px 12px 0;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.22);
    overflow-y: auto;
  }

  .mailbox-sidebar.mobile-open {
    transform: translateX(0);
  }

  .mobile-sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 20;
    border: 0;
    background: rgba(2, 6, 23, 0.42);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .mobile-sidebar-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>