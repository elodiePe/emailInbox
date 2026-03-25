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
  moveGroup
} = useSimulationStore()

const showOnlyUnsafe = ref(false)
const exportFileName = ref('simulation-export')
const PM_API_BASE = String(import.meta.env.VITE_PASSWORD_MANAGER_API_URL || 'http://localhost:5000').replace(/\/+$/, '')

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
      requestedAtISO: typeof row.requestedAtMs === 'number' ? new Date(row.requestedAtMs).toISOString() : 'N/A',
      completedAtISO: typeof row.completedAtMs === 'number' ? new Date(row.completedAtMs).toISOString() : 'N/A',
      durationSeconds: typeof row.durationSeconds === 'number' ? row.durationSeconds : 'N/A',
      duration: formatSeconds(typeof row.durationSeconds === 'number' ? row.durationSeconds : null)
    }))
  } catch {
    return []
  }
}

function buildDetailedEmailStatusRows(timelineEntries, passwordManagerCredentialCopyRows, emailScheduleData) {
  // Build a map of aggregated data per emailId by matching credentialLinkKey
  const emailCredentialDataMap = {}

  timelineEntries.forEach((email) => {
    const credentialLinkKey = String(email.linkedCredentialWebsite || '').toLowerCase()
    if (!credentialLinkKey) return

    // Get all credential copy events matching this link key
    const matchingEvents = passwordManagerCredentialCopyRows.filter((row) => {
      const rowLinkKey = String(row.credentialLinkKey || '').toLowerCase()
      return rowLinkKey === credentialLinkKey
    })

    // Filter by action types
    const copyUsernameEvents = matchingEvents.filter((e) => e.actionType === 'copyUsername')
    const copyPasswordEvents = matchingEvents.filter((e) => e.actionType === 'copyPassword')
    const togglePasswordEvents = matchingEvents.filter((e) => e.actionType === 'togglePassword')

    // Get completed copy actions with challenge data
    const completedCopyPasswordEvents = copyPasswordEvents.filter((e) => e.outcome === 'completed')

    // Aggregate timings
    const copyPasswordTotalSeconds = completedCopyPasswordEvents.reduce((sum, e) => {
      const duration = typeof e.durationSeconds === 'number' ? e.durationSeconds : 0
      return sum + duration
    }, 0)
    const copyPasswordAverageSeconds = completedCopyPasswordEvents.length > 0
      ? copyPasswordTotalSeconds / completedCopyPasswordEvents.length
      : 0

    const togglePasswordTotalSeconds = togglePasswordEvents.reduce((sum, e) => {
      const duration = typeof e.durationSeconds === 'number' ? e.durationSeconds : 0
      return sum + duration
    }, 0)

    // Get challenge data from events that have challengeType
    const eventsWithChallenges = matchingEvents.filter((e) => e.challengeType && e.challengeType !== 'N/A')
    let challengeTypesSet = new Set()
    let totalAttempts = 0
    let totalChallenges = 0

    eventsWithChallenges.forEach((e) => {
      if (e.challengeType) challengeTypesSet.add(e.challengeType)
      if (typeof e.challengeAttempts === 'number') {
        totalAttempts += e.challengeAttempts
        totalChallenges += 1
      }
    })

    const challengeTypes = Array.from(challengeTypesSet).join(', ') || 'N/A'
    const challengeAttemptsPerEvent = eventsWithChallenges
      .map((e) => (typeof e.challengeAttempts === 'number' ? String(e.challengeAttempts) : 'N/A'))
      .join(', ') || 'N/A'
    const challengeTypesPerEvent = eventsWithChallenges
      .map((e) => (e.challengeType ? String(e.challengeType) : 'N/A'))
      .join(', ') || 'N/A'
    const challengeOutcomesPerEvent = eventsWithChallenges
      .map((e) => (e.outcome ? String(e.outcome) : 'N/A'))
      .join(', ') || 'N/A'

    emailCredentialDataMap[email.id] = {
      copyUsernameCount: copyUsernameEvents.length,
      copyUsernameOutcomes: copyUsernameEvents.map((e) => e.outcome).filter((o) => o !== 'N/A'),
      copyPasswordCount: copyPasswordEvents.length,
      copyPasswordCompletedCount: completedCopyPasswordEvents.length,
      copyPasswordTotalSeconds,
      copyPasswordAverageSeconds,
      copyPasswordDuration: formatSeconds(copyPasswordAverageSeconds),
      togglePasswordCount: togglePasswordEvents.length,
      togglePasswordTotalSeconds,
      togglePasswordAverageSeconds: togglePasswordEvents.length > 0 ? (togglePasswordTotalSeconds / togglePasswordEvents.length) : 0,
      togglePasswordDuration: togglePasswordEvents.length > 0 ? formatSeconds(togglePasswordTotalSeconds / togglePasswordEvents.length) : 'N/A',
      hadChallenges: eventsWithChallenges.length > 0 ? 'Yes' : 'No',
      challengeCount: totalChallenges,
      challengeTypes,
      challengeTypesPerEvent,
      challengeAttemptsPerEvent,
      challengeOutcomesPerEvent,
      totalChallengeAttempts: totalAttempts,
      togglePasswordOutcomes: togglePasswordEvents.map((e) => e.outcome).filter((o) => o !== 'N/A')
    }
  })

  return emailCredentialDataMap
}

async function exportAdminDataToExcel() {
  const workbook = XLSX.utils.book_new()
  const passwordManagerCredentialCopyRows = await getPasswordManagerCredentialCopyRows()

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

  const emailSectionRows = timelineEntries.value.map((item) => ({
    Email_ID: item.id,
    Is_an_attack: (typeof item.isAttack === 'boolean' ? item.isAttack : item.unsafe) ? 'true' : 'false',
    is_email_opened: item.opened === true ? 'true' : 'false',
    is_email_declared_unsafe: item.unsafe === true ? 'true' : 'false',
    time_taken_to_declare_email_unsafe:
      item.unsafe && typeof item.unsafeDecisionSeconds === 'number'
        ? item.unsafeDecisionSeconds
        : 'N/A'
  }))

  const pmTaskStatsMap = {}

  passwordManagerCredentialCopyRows.forEach((row) => {
    const pmTaskId = String(row.credentialLinkKey || row.website || row.accountId || 'N/A')
    if (!pmTaskStatsMap[pmTaskId]) {
      pmTaskStatsMap[pmTaskId] = {
        PM_task_id: pmTaskId,
        PM_copyUsernameAction_count: 0,
        PM_copyPassword_count: 0,
        PM_togglePassword_count: 0,
        'PM-B_challenges_count': 0
      }
    }

    if (row.actionType === 'copyUsername') {
      pmTaskStatsMap[pmTaskId].PM_copyUsernameAction_count += 1
    }

    if (row.actionType === 'copyPassword') {
      pmTaskStatsMap[pmTaskId].PM_copyPassword_count += 1
    }

    if (row.actionType === 'togglePassword') {
      pmTaskStatsMap[pmTaskId].PM_togglePassword_count += 1
    }

    if (
      row.managerMode === 'B' &&
      row.challengeType &&
      row.challengeType !== 'N/A'
    ) {
      pmTaskStatsMap[pmTaskId]['PM-B_challenges_count'] += 1
    }
  })

  const passwordManagerSectionRows = Object.values(pmTaskStatsMap)

  const challengeDetailRows = passwordManagerCredentialCopyRows
    .filter(
      (row) =>
        row.managerMode === 'B' &&
        row.challengeType &&
        row.challengeType !== 'N/A'
    )
    .map((row) => ({
      PM_task_id: String(row.credentialLinkKey || row.website || row.accountId || 'N/A'),
      Challenge_type: row.challengeType,
      Challenge_attempts: typeof row.challengeAttempts === 'number' ? row.challengeAttempts : 'N/A',
      Challenge_outcome: row.outcome || 'N/A',
      Challenge_time: typeof row.challengeDurationSeconds === 'number' ? row.challengeDurationSeconds : 'N/A'
    }))

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
