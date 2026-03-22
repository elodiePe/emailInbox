<script setup>
import { computed, onMounted, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useSimulationStore } from '../composables/useSimulationStore'

const localAvatarAssets = import.meta.glob('../assets/*', { eager: true, import: 'default' })

const route = useRoute()
const router = useRouter()
const {
  incomingEmails,
  completedTasks,
  toggleTask,
  selectEmail,
  composeForm,
  initializeSimulation,
  sentEmails,
  toggleEmailUnsafe
} = useSimulationStore()

const unreadCount = computed(() => incomingEmails.value.filter((item) => !item.isRead).length)
const isSentRoute = computed(() => route.name === 'sent-email')

const currentFolder = computed(() => {
  if (isSentRoute.value) return 'sent'
  if (route.query.tab === 'send' || route.query.folder === 'sent') return 'sent'
  if (route.query.folder === 'unread') return 'unread'
  return 'inbox'
})

const email = computed(() => {
  const id = String(route.params.id || '')
  if (isSentRoute.value) {
    const sent = sentEmails.value.find((item) => item.id === id)
    if (!sent) return null

    return {
      ...sent,
      from: sent.from || 'participant@adm.com',
      receivedAt: sent.sentAt,
      isUnsafe: false,
      taskId: null,
      taskLabel: ''
    }
  }

  return incomingEmails.value.find((item) => item.instanceId === id) || null
})

const senderInitial = computed(() => {
  const from = String(email.value?.from || '').trim()
  if (!from) return '?'
  return from.charAt(0).toUpperCase()
})

const senderName = computed(() => {
  const from = String(email.value?.from || '').trim()
  if (!from) return 'Unknown sender'
  if (from.includes('@')) return from.split('@')[0]
  return from
})

const senderAvatar = computed(() => {
  const avatar = String(email.value?.avatar || '').trim()
  if (!avatar) return ''

  // Keep already-resolvable paths/URLs untouched.
  if (avatar.startsWith('/') || avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:')) {
    return avatar
  }

  // Allow plain filenames from src/assets, e.g. "vue.svg".
  const key = Object.keys(localAvatarAssets).find((assetPath) => assetPath.endsWith(`/${avatar}`))
  return key ? localAvatarAssets[key] : ''
})

const isAccountVerified = computed(() => {
  const value = email.value?.accountVerified
  return value === true || value === 'true' || value === 1 || value === '1'
})

function syncSelectedEmailFromRoute() {
  if (isSentRoute.value) return
  const id = String(route.params.id || '')
  if (!id) return
  selectEmail(id)
}

function goToInboxFolder(folder) {
  const query = folder === 'inbox' ? {} : { folder }
  router.push({ path: '/', query })
}
//  function goToSentFolder() {
//    router.push({ path: '/', query: { tab: 'send', folder: 'sent' } })
//  }

function goToCompose() {
  router.push({ path: '/', query: { tab: 'send', folder: 'sent' } })
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
      <button class="compose-cta" @click="goToCompose">+ Compose</button>
<!-- 
      <RouterLink to="/" class="compose-cta" style="display: inline-block; text-align: center; text-decoration: none; color: inherit;">
        Back to Inbox
      </RouterLink> -->

      <!-- <h2>Folders</h2> -->
      <ul class="folder-list">
        <li :class="{ active: currentFolder === 'inbox' }" @click="goToInboxFolder('inbox')">Inbox <span>{{ incomingEmails.length }}</span></li>
        <li :class="{ active: currentFolder === 'unread' }" @click="goToInboxFolder('unread')">Unread <span>{{ unreadCount }}</span></li>
        <li :class="{ active: currentFolder === 'sent' }" @click="goToInboxFolder('sent')">Sent <span>{{ sentEmails.length }}</span></li>
      </ul>
    </section>

    <section class="panel inbox-list-panel mail-read-panel">
      <div class="mail-toolbar">
        <!-- <h2>Email Detail</h2> -->
        <RouterLink to="/" class="tab-link back-link">Back to Inbox</RouterLink>
      </div>

      <div class="mail-detail-panel">
        <template v-if="email">
          <div class="gmail-head">
            <div class="gmail-subject-row">
              <h1 class="gmail-subject">{{ email.subject }}</h1>
              <!-- <span v-if="email.isUnsafe" class="unsafe-label">Marked as unsafe</span> -->
            </div>

            <div class="gmail-meta-row">
              <div class="gmail-sender-block">
                <img
                  v-if="senderAvatar"
                  :src="senderAvatar"
                  :alt="`${senderName} avatar`"
                  class="gmail-avatar gmail-avatar-image"
                />
                <div v-else class="gmail-avatar">{{ senderInitial }}</div>
                <div class="gmail-sender-text">
                  <div class="sender-horizontaly">
                    <p class="gmail-sender-name">{{ senderName }}</p>
                    <span
                      v-if="isAccountVerified"
                      class="verified-icon"
                      title="Verified account: sender identity has been confirmed by the system."
                      aria-label="Verified account"
                    ></span>
                    <p class="gmail-sender-address">&lt;{{ email.from }}&gt;</p>
                  </div>
           
                  <p class="gmail-sender-to">{{ isSentRoute ? `to ${email.to}` : 'to me' }}</p>
                </div>
              </div>

              <div class="gmail-right-meta">
                <p class="gmail-time">{{ email.receivedAt }}</p>
                <!-- <div class="gmail-actions" aria-label="Email actions">
                  <button type="button" class="gmail-action-btn">Star</button>
                  <button type="button" class="gmail-action-btn">Reply</button>
                </div> -->
              </div>
            </div>

            <!-- <p v-if="email.linkedCredentialWebsite" class="meta gmail-linked-meta">
              Linked credential: {{ email.linkedCredentialWebsite }}
            </p> -->
          </div>

          <div class="mail-body" v-html="email.body"></div>
          <div class="tasks-mail-information">
                  <label v-if="!isSentRoute" class="task-row">
            <input
              type="checkbox"
              :checked="email.isUnsafe === true"
              @change="toggleEmailUnsafe(email.instanceId, $event.target.checked)"
            />
            <span>Declare this email as unsafe</span>
          </label>

          <!-- <label v-if="!isSentRoute && email.taskId" class="task-row">
            <input
              type="checkbox"
              :checked="completedTasks[email.taskId] === true"
              @change="toggleTask(email.taskId, $event.target.checked)"
            />
            <span>Mark task complete: {{ email.taskLabel }}</span>
          </label>  -->
        </div>

    
        </template>
        <p v-else>Email not found in inbox.</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.gmail-head {
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 14px;
  margin-bottom: 12px;
}

.gmail-subject-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.gmail-subject {
  margin: 0;
  font-size: 1.85rem;
  font-weight: 400;
  color: #202124;
  line-height: 1.25;
}

.gmail-meta-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.gmail-sender-block {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.gmail-avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #d1e3ff;
  color: #0b57d0;
  font-weight: 700;
}

.gmail-avatar-image {
  object-fit: cover;
}

.gmail-sender-text p {
  margin: 0;
}

.gmail-sender-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #202124;
}

.gmail-sender-address,
.gmail-sender-to {
  color: #5f6368;
  font-size: 0.82rem;
}

.gmail-right-meta {
  text-align: right;
  flex-shrink: 0;
}

.gmail-time {
  margin: 0 0 8px;
  color: #5f6368;
  font-size: 0.82rem;
}

.gmail-actions {
  display: inline-flex;
  gap: 6px;
}

.gmail-action-btn {
  border: 1px solid #dadce0;
  border-radius: 999px;
  background: #fff;
  color: #3c4043;
  padding: 4px 10px;
  font-size: 0.78rem;
  cursor: pointer;
}

.gmail-action-btn:hover {
  background: #f1f3f4;
}

.gmail-linked-meta {
  margin-top: 10px;
}

.verified-icon {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #1a73e8;
  position: relative;
  display: inline-block;
  flex-shrink: 0;
  overflow: hidden;
  font-size: 0;
  color: transparent;
}

.verified-icon::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 2px;
  width: 4px;
  height: 7px;
  border-right: 2px solid #fff;
  border-bottom: 2px solid #fff;
  transform: rotate(45deg);
}

.sender-horizontaly {
  display: flex;
  flex-direction: row;
  gap: 6px;
  align-items: center;
}
@media (max-width: 760px) {
  .gmail-subject {
    font-size: 1.35rem;
  }

  .gmail-meta-row {
    flex-direction: column;
  }

  .gmail-right-meta {
    text-align: left;
  }
}
</style>
