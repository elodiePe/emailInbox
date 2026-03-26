<script setup>
import { computed, onMounted, ref } from 'vue'
import * as XLSX from 'xlsx'
import { useSimulationStore } from '../composables/useSimulationStore'

const {
  currentSessionId,
  groupOrder,
  orderedGroups,
  allTasksByGroup,
  unlockedGroups,
  timelineEntries,
  completedTasks,
  usabilityQuestions,
  usabilityResponses,
  demographicData,
  toggleTask,
  restartSimulation,
  initializeSimulation,
  moveGroup,
  setDeliveryPaused
} = useSimulationStore()

const showOnlyUnsafe = ref(false)
const exportFileName = ref('simulation-export')
const isSendingPaused = ref(false)
const PM_API_BASE = String(import.meta.env.VITE_PASSWORD_MANAGER_API_URL || 'http://localhost:5000').replace(/\/+$/, '')

function startSending() {
  isSendingPaused.value = false
  setDeliveryPaused(false)
}

function stopSending() {
  isSendingPaused.value = true
  setDeliveryPaused(true)
}

const displayedTimelineEntries = computed(() => {
  if (!showOnlyUnsafe.value) return timelineEntries.value
  return timelineEntries.value.filter((item) => item.unsafe)
})

function formatSeconds(value) {
  if (typeof value !== 'number') return 'N/A'
  const total = Math.max(0, value)
  const minutes = Math.floor(total / 60)
  const seconds = total - minutes * 60

  if (Number.isInteger(total)) {
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`
}

async function getPasswordManagerCredentialCopyRows() {
  try {
    const url = `${PM_API_BASE}/api/study/credential-copy?sessionId=${encodeURIComponent(currentSessionId.value)}`
    const response = await fetch(url)
    if (!response.ok) return []

    const parsed = await response.json()
    if (!Array.isArray(parsed)) return []

    return parsed.map((row, index) => ({
      index: index + 1,
      sessionId: row.sessionId || currentSessionId.value,
      managerMode: row.managerMode || 'unknown',
      website: row.website || 'N/A',
      credentialLinkKey: row.credentialLinkKey || 'N/A',
      accountId: row.accountId || 'N/A',
      actionType: row.actionType || 'N/A',
      outcome: row.outcome || 'N/A',
      challengeType: row.challengeType || 'N/A',
      challengeAttempts: typeof row.challengeAttempts === 'number' ? row.challengeAttempts : 'N/A',
      challengeDurationSeconds: typeof row.challengeDurationSeconds === 'number' ? row.challengeDurationSeconds : 'N/A',
      challengeDuration: formatSeconds(typeof row.challengeDurationSeconds === 'number' ? row.challengeDurationSeconds : null),
      requestedAtMs: typeof row.requestedAtMs === 'number' ? row.requestedAtMs : null,
      completedAtMs: typeof row.completedAtMs === 'number' ? row.completedAtMs : null,
      requestedAtISO: typeof row.requestedAtMs === 'number' ? new Date(row.requestedAtMs).toISOString() : 'N/A',
      completedAtISO: typeof row.completedAtMs === 'number' ? new Date(row.completedAtMs).toISOString() : 'N/A',
      durationSeconds: typeof row.durationSeconds === 'number' ? row.durationSeconds : 'N/A',
      duration: formatSeconds(typeof row.durationSeconds === 'number' ? row.durationSeconds : null)
    }))
  } catch {
    return []
  }
}

function normalizeCredentialKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function getEmailCredentialKey(email) {
  // Prefer explicit key when provided, fallback to legacy field.
  return normalizeCredentialKey(email.linkedCredentialKey || email.linkedCredentialWebsite)
}

function getEventCredentialKey(event) {
  return normalizeCredentialKey(event.credentialLinkKey)
}

function getEventTimestampMs(event) {
  if (typeof event.requestedAtMs === 'number') return event.requestedAtMs
  if (typeof event.completedAtMs === 'number') return event.completedAtMs
  return null
}

function getEmailStartMs(email) {
  if (typeof email.openedAtMs === 'number') return email.openedAtMs
  if (typeof email.receivedAtMs === 'number') return email.receivedAtMs
  return null
}

function buildDetailedEmailStatusRows(timelineEntries, passwordManagerCredentialCopyRows) {
  const emailsWithOrder = timelineEntries.map((email, index) => ({
    ...email,
    __order: index + 1,
    __credentialKey: getEmailCredentialKey(email),
    __startMs: getEmailStartMs(email)
  }))

  const emailCountByKey = emailsWithOrder.reduce((acc, email) => {
    const key = email.__credentialKey
    if (!key) return acc
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const emailBuckets = {}
  emailsWithOrder.forEach((email) => {
    emailBuckets[email.id] = []
  })

  const eventsByKey = new Map()
  passwordManagerCredentialCopyRows.forEach((event) => {
    const key = getEventCredentialKey(event)
    if (!key) return
    if (!eventsByKey.has(key)) eventsByKey.set(key, [])
    eventsByKey.get(key).push(event)
  })

  eventsByKey.forEach((events, key) => {
    const candidates = emailsWithOrder.filter((email) => email.__credentialKey === key)
    if (candidates.length === 0) return

    const sortedCandidates = [...candidates].sort((a, b) => {
      const aStart = typeof a.__startMs === 'number' ? a.__startMs : Number.POSITIVE_INFINITY
      const bStart = typeof b.__startMs === 'number' ? b.__startMs : Number.POSITIVE_INFINITY
      if (aStart !== bStart) return aStart - bStart
      return a.__order - b.__order
    })

    const sortedEvents = [...events].sort((a, b) => {
      const aTs = typeof getEventTimestampMs(a) === 'number' ? getEventTimestampMs(a) : Number.POSITIVE_INFINITY
      const bTs = typeof getEventTimestampMs(b) === 'number' ? getEventTimestampMs(b) : Number.POSITIVE_INFINITY
      return aTs - bTs
    })

    sortedEvents.forEach((event) => {
      const eventTs = getEventTimestampMs(event)
      let target = sortedCandidates[0]

      if (typeof eventTs === 'number') {
        sortedCandidates.forEach((candidate) => {
          if (typeof candidate.__startMs === 'number' && candidate.__startMs <= eventTs) {
            target = candidate
          }
        })
      }

      emailBuckets[target.id].push(event)
    })
  })

  const emailCredentialDataMap = {}

  emailsWithOrder.forEach((email) => {
    let matchingEvents = emailBuckets[email.id] || []

    // If multiple emails intentionally reuse the same credential key,
    // expose key-level PM activity on each related row so attacks are not dropped.
    if (matchingEvents.length === 0 && email.__credentialKey && (emailCountByKey[email.__credentialKey] || 0) > 1) {
      matchingEvents = eventsByKey.get(email.__credentialKey) || []
    }

    const copyUsernameEvents = matchingEvents.filter((e) => e.actionType === 'copyUsername')
    const copyPasswordEvents = matchingEvents.filter((e) => e.actionType === 'copyPassword')
    const togglePasswordEvents = matchingEvents.filter((e) => e.actionType === 'togglePassword')
    const completedCopyPasswordEvents = copyPasswordEvents.filter((e) => e.outcome === 'completed')

    const copyPasswordTotalSeconds = completedCopyPasswordEvents.reduce((sum, e) => {
      const duration = typeof e.durationSeconds === 'number' ? e.durationSeconds : 0
      return sum + duration
    }, 0)

    const copyPasswordAverageSeconds =
      completedCopyPasswordEvents.length > 0
        ? copyPasswordTotalSeconds / completedCopyPasswordEvents.length
        : 0

    const togglePasswordTotalSeconds = togglePasswordEvents.reduce((sum, e) => {
      const duration = typeof e.durationSeconds === 'number' ? e.durationSeconds : 0
      return sum + duration
    }, 0)

    const eventsWithChallenges = matchingEvents.filter((e) => e.challengeType && e.challengeType !== 'N/A')

    const challengeTypesSet = new Set()
    let totalAttempts = 0
    let totalChallenges = 0

    eventsWithChallenges.forEach((e) => {
      if (e.challengeType) challengeTypesSet.add(e.challengeType)
      if (typeof e.challengeAttempts === 'number') {
        totalAttempts += e.challengeAttempts
        totalChallenges += 1
      }
    })

    emailCredentialDataMap[email.id] = {
      emailOrder: email.__order,
      credentialLinkKey: email.__credentialKey || 'N/A',
      eventCount: matchingEvents.length,
      copyUsernameCount: copyUsernameEvents.length,
      copyPasswordCount: copyPasswordEvents.length,
      copyPasswordCompletedCount: completedCopyPasswordEvents.length,
      copyPasswordAverageSeconds,
      copyPasswordDuration: formatSeconds(copyPasswordAverageSeconds),
      togglePasswordCount: togglePasswordEvents.length,
      togglePasswordAverageSeconds:
        togglePasswordEvents.length > 0 ? togglePasswordTotalSeconds / togglePasswordEvents.length : 0,
      togglePasswordDuration:
        togglePasswordEvents.length > 0
          ? formatSeconds(togglePasswordTotalSeconds / togglePasswordEvents.length)
          : 'N/A',
      hadChallenges: eventsWithChallenges.length > 0 ? 'Yes' : 'No',
      challengeCount: totalChallenges,
      challengeTypes: Array.from(challengeTypesSet).join(', ') || 'N/A',
      totalChallengeAttempts: totalAttempts,
      matchedEvents: matchingEvents
    }
  })

  return emailCredentialDataMap
}

async function exportAdminDataToExcel() {
  const workbook = XLSX.utils.book_new()
  const passwordManagerCredentialCopyRows = await getPasswordManagerCredentialCopyRows()
  const emailCredentialDataMap = buildDetailedEmailStatusRows(
    timelineEntries.value,
    passwordManagerCredentialCopyRows
  )

  const completedCopyRows = passwordManagerCredentialCopyRows
    .filter((row) => row.outcome === 'completed' && typeof row.durationSeconds === 'number')


  const answeredCount = usabilityQuestions.filter((question) => {
    const score = usabilityResponses.value[question.id]
    const minScale = Number.isInteger(question.minScale) ? question.minScale : 1
    const maxScale = Number.isInteger(question.maxScale) ? question.maxScale : 5
    return Number.isInteger(score) && score >= minScale && score <= maxScale
  }).length

  const usabilityRows = usabilityQuestions.map((question, index) => {
    const score = usabilityResponses.value[question.id]
    const minScale = Number.isInteger(question.minScale) ? question.minScale : 1
    const maxScale = Number.isInteger(question.maxScale) ? question.maxScale : 5
    const answered = Number.isInteger(score) && score >= minScale && score <= maxScale
    return {
      item: index + 1,
      instrument: question.instrument || 'N/A',
      questionId: question.id,
      question: question.text,
      scaleMin: minScale,
      scaleMax: maxScale,
      leftLabel: question.leftLabel || 'N/A',
      rightLabel: question.rightLabel || 'N/A',
      responseScore: answered ? score : 'N/A',
      answered: answered ? 'Yes' : 'No'
    }
  })


  const participantPmGroup = (() => {
    const modeCounts = passwordManagerCredentialCopyRows.reduce((acc, row) => {
      const mode = String(row.managerMode || '').toUpperCase()
      if (mode === 'A' || mode === 'B') {
        acc[mode] = (acc[mode] || 0) + 1
      }
      return acc
    }, {})

    const countA = Number(modeCounts.A || 0)
    const countB = Number(modeCounts.B || 0)

    if (countA > 0 && countB === 0) return 'PM-A'
    if (countB > 0 && countA === 0) return 'PM-B'
    if (countA > 0 && countB > 0) {
      return countA >= countB ? 'PM-A' : 'PM-B'
    }

    const fallback = String(window.localStorage.getItem('pm.managerMode') || '').toUpperCase()
    if (fallback === 'A') return 'PM-A'
    if (fallback === 'B') return 'PM-B'
    return 'N/A'
  })()

  const participantEmailsOrder = (() => {
    const letterByGroupId = {
      'group-1': 'A',
      'group-2': 'B',
      'group-3': 'C'
    }

    const letters = orderedGroups.value
      .map((group) => letterByGroupId[group.id] || '')
      .filter((value) => value)

    return letters.length > 0 ? letters.join('') : 'N/A'
  })()

  const demographicSectionRows = [
    {
      Participant_ID: currentSessionId.value,
      Participant_gender: demographicData.value.gender || 'N/A',
      Participant_age: demographicData.value.age || 'N/A',
      Participant_levelOfEducation: demographicData.value.educationLevel || 'N/A',
      Participant_englishLevel: demographicData.value.englishLevel || 'N/A',
      Participant_ITLevel: demographicData.value.itBackground || 'N/A',
      Participant_PMGroup: participantPmGroup,
      Participant_EmailsOrder: participantEmailsOrder
    }
  ]

  const emailSectionRows = timelineEntries.value.map((item, index) => {
    const stats = emailCredentialDataMap[item.id] || {}

    return {
      Email_order: index + 1,
      Group: item.groupLabel || 'N/A',
      Email_ID: item.id,
      Credential_link_key: stats.credentialLinkKey || getEmailCredentialKey(item) || 'N/A',
      Is_an_attack: (typeof item.isAttack === 'boolean' ? item.isAttack : item.unsafe) ? 'true' : 'false',
      is_email_opened: item.opened === true ? 'true' : 'false',
      is_email_declared_unsafe: item.unsafe === true ? 'true' : 'false',
      time_taken_to_declare_email_unsafe:
        item.unsafe && typeof item.unsafeDecisionSeconds === 'number'
          ? item.unsafeDecisionSeconds
          : 'N/A',
      PM_matched_events_count: stats.eventCount ?? 0,
      PM_copyUsernameAction_count: stats.copyUsernameCount ?? 0,
      PM_copyPassword_count: stats.copyPasswordCount ?? 0,
      PM_togglePassword_count: stats.togglePasswordCount ?? 0,
      PM_challenges_count: stats.challengeCount ?? 0,
      PM_challenge_types: stats.challengeTypes || 'N/A'
    }
  })

  const passwordManagerSectionRows = timelineEntries.value.map((item, index) => {
    const stats = emailCredentialDataMap[item.id] || {}
    return {
      Email_order: index + 1,
      Group: item.groupLabel || 'N/A',
      Email_ID: item.id,
      PM_task_id: stats.credentialLinkKey || getEmailCredentialKey(item) || 'N/A',
      PM_copyUsernameAction_count: stats.copyUsernameCount ?? 0,
      PM_copyPassword_count: stats.copyPasswordCount ?? 0,
      PM_togglePassword_count: stats.togglePasswordCount ?? 0,
      PM_B_challenges_count: stats.challengeCount ?? 0,
      PM_challenge_types: stats.challengeTypes || 'N/A'
    }
  })

  const challengeDetailRows = timelineEntries.value.flatMap((item, index) => {
    const stats = emailCredentialDataMap[item.id]
    const matchedEvents = stats?.matchedEvents || []

    return matchedEvents
      .filter((row) => row.managerMode === 'B' && row.challengeType && row.challengeType !== 'N/A')
      .map((row) => ({
        Email_order: index + 1,
        Group: item.groupLabel || 'N/A',
        Email_ID: item.id,
        PM_task_id: stats?.credentialLinkKey || getEmailCredentialKey(item) || 'N/A',
        Challenge_type: row.challengeType,
        Challenge_attempts: typeof row.challengeAttempts === 'number' ? row.challengeAttempts : 'N/A',
        Challenge_outcome: row.outcome || 'N/A',
        Challenge_time:
          typeof row.challengeDurationSeconds === 'number' ? row.challengeDurationSeconds : 'N/A'
      }))
  })

  const usabilitySheet = XLSX.utils.json_to_sheet(usabilityRows)
  const demographicSectionSheet = XLSX.utils.json_to_sheet(demographicSectionRows)
  const emailSectionSheet = XLSX.utils.json_to_sheet(emailSectionRows)
  const passwordManagerSectionSheet = XLSX.utils.json_to_sheet(passwordManagerSectionRows)
  const challengeDetailSheet = XLSX.utils.json_to_sheet(challengeDetailRows)

  XLSX.utils.book_append_sheet(workbook, usabilitySheet, 'Usability Questionnaire')
  XLSX.utils.book_append_sheet(workbook, demographicSectionSheet, 'Demographic Section')
  XLSX.utils.book_append_sheet(workbook, emailSectionSheet, 'Emails')
  XLSX.utils.book_append_sheet(workbook, passwordManagerSectionSheet, 'Password Manager')
  XLSX.utils.book_append_sheet(workbook, challengeDetailSheet, 'PM Challenges')

  const cleanedName = String(exportFileName.value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')

  const baseName = cleanedName || 'simulation-export'
  const fileName = `${baseName}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`
  XLSX.writeFileXLSX(workbook, fileName)
}

onMounted(() => {
  initializeSimulation()
})
</script>

<template>
  <main class="admin-layout">
    <section class="panel admin-timeline-panel">
      <div class="admin-timeline-head">
        <h2>Simulation Timeline</h2>
        <label class="unsafe-filter-toggle">
          <input type="checkbox" v-model="showOnlyUnsafe" />
          <span>Only unsafe</span>
        </label>
      </div>
      <ul class="timeline-list">
        <li
          v-for="item in displayedTimelineEntries"
          :key="item.emailKey"
          class="timeline-item"
          :class="{
            'is-unsafe': item.unsafe,
            'is-task-done': item.taskId && item.taskDone,
            'is-opened': item.opened && !(item.taskId && item.taskDone),
            'is-sent': item.delivered && !item.opened && !(item.taskId && item.taskDone),
            'is-pending': !item.delivered
          }"
        >
          <p class="subject">{{ item.groupLabel }} • {{ item.subject }}</p>
          <div class="timeline-status-row">
            <span class="timeline-badge" :class="item.delivered ? 'sent-done' : 'sent-pending'">
              Sent: {{ item.delivered ? 'Yes' : 'No' }}
            </span>
            <span class="timeline-badge" :class="item.opened ? 'opened-done' : 'opened-pending'">
              Opened: {{ item.opened ? 'Yes' : 'No' }}
            </span>
            <span class="timeline-badge" :class="item.unsafe ? 'unsafe-done' : 'unsafe-pending'">
              Unsafe: {{ item.unsafe ? 'Yes' : 'No' }}
            </span>
            <span class="timeline-badge" :class="item.unsafe ? 'unsafe-time' : 'unsafe-time-pending'">
              Time from open: {{ formatSeconds(item.unsafeDecisionSeconds) }}
            </span>
            <span v-if="item.taskId" class="timeline-badge" :class="item.taskDone ? 'task-done' : 'task-pending'">
              Task: {{ item.taskDone ? 'Done' : 'Pending' }}
            </span>
          </div>
        </li>
        <li v-if="displayedTimelineEntries.length === 0" class="empty">No timeline emails for this filter.</li>
      </ul>
    </section>

    <section class="panel admin-actions-panel">

      <div class="sending-control-section">
        <h3>Email Delivery Control</h3>
        <p class="sending-status" :class="{ paused: isSendingPaused }">
          Status: <strong>{{ isSendingPaused ? 'PAUSED' : 'SENDING' }}</strong>
        </p>
        <div class="sending-button-group">
          <button class="start-button" @click="startSending" :disabled="!isSendingPaused">Start Sending</button>
          <button class="stop-button" @click="stopSending" :disabled="isSendingPaused">Stop Sending</button>
        </div>
      </div>

      <h3>Group Order</h3>
      <ul class="group-order-list">
        <li v-for="(group, index) in orderedGroups" :key="`order-${group.id}`" class="group-order-item">
          <span>{{ index + 1 }}. {{ group.label }}</span>
          <div class="group-order-actions">
            <button @click="moveGroup(group.id, 'up')" :disabled="index === 0">Up</button>
            <button @click="moveGroup(group.id, 'down')" :disabled="index === orderedGroups.length - 1">Down</button>
          </div>
        </li>
      </ul>

      <!-- <div v-for="group in groupOrder" :key="`admin-${group.id}`" class="group-block">
        <h3>
          {{ group.label }}
          <span class="status" :class="{ unlocked: unlockedGroups[group.id] || group.id === 'intro' }">
            {{ group.id === 'intro' ? 'Active' : unlockedGroups[group.id] ? 'Unlocked' : 'Locked' }}
          </span>
        </h3>
        <label v-for="task in allTasksByGroup[group.id]" :key="`admin-${task.taskId}`" class="task-row">
          <input
            type="checkbox"
            :checked="completedTasks[task.taskId] === true"
            @change="toggleTask(task.taskId, $event.target.checked)"
          />
          <span>{{ task.label }}</span>
        </label>
      </div> -->

      <label class="export-name-field">
        Excel filename
        <input v-model="exportFileName" type="text" placeholder="simulation-export" />
      </label>

      <button class="export-button" @click="exportAdminDataToExcel">Export to Excel</button>
      <button class="reset-button" @click="restartSimulation">Clear localStorage + Restart Timeline</button>
    </section>
  </main>
</template>

<style scoped>
.sending-control-section {
  margin-bottom: 24px;
  padding: 16px;
  background: #f0f4f8;
  border-radius: 8px;
  border-left: 4px solid #0066cc;
}

.sending-control-section h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #202124;
}

.sending-status {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #555;
}

.sending-status.paused {
  color: #d32f2f;
  font-weight: 600;
}

.sending-status strong {
  font-weight: 700;
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
}

.sending-status:not(.paused) strong {
  background: #c8e6c9;
  color: #1b5e20;
}

.sending-status.paused strong {
  background: #ffcdd2;
  color: #b71c1c;
}

.sending-button-group {
  display: flex;
  gap: 8px;
}

.start-button,
.stop-button {
  padding: 8px 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.start-button {
  background: #4caf50;
  color: white;
  border-color: #388e3c;
}

.start-button:hover:not(:disabled) {
  background: #45a049;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.start-button:disabled {
  background: #e0e0e0;
  color: #999;
  cursor: not-allowed;
}

.stop-button {
  background: #f44336;
  color: white;
  border-color: #d32f2f;
}

.stop-button:hover:not(:disabled) {
  background: #da190b;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.stop-button:disabled {
  background: #e0e0e0;
  color: #999;
  cursor: not-allowed;
}
</style>
