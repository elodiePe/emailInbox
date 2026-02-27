<script setup>
import { computed, onMounted, ref } from 'vue'
import * as XLSX from 'xlsx'
import { useSimulationStore } from '../composables/useSimulationStore'

const {
  groupOrder,
  orderedGroups,
  allTasksByGroup,
  unlockedGroups,
  timelineEntries,
  completedTasks,
  toggleTask,
  restartSimulation,
  initializeSimulation,
  moveGroup
} = useSimulationStore()

const showOnlyUnsafe = ref(false)
const exportFileName = ref('simulation-export')

const displayedTimelineEntries = computed(() => {
  if (!showOnlyUnsafe.value) return timelineEntries.value
  return timelineEntries.value.filter((item) => item.unsafe)
})

function formatSeconds(value) {
  if (typeof value !== 'number') return 'N/A'
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function exportAdminDataToExcel() {
  const workbook = XLSX.utils.book_new()

  const groupOrderRows = orderedGroups.value.map((group, index) => ({
    order: index + 1,
    groupId: group.id,
    groupLabel: group.label
  }))

  const emailStatusRows = timelineEntries.value.map((item) => ({
    group: item.groupLabel,
    groupId: item.groupId,
    emailId: item.id,
    subject: item.subject,
    from: item.from,
    sent: item.delivered ? 'Yes' : 'No',
    opened: item.opened ? 'Yes' : 'No',
    unsafe: item.unsafe ? 'Yes' : 'No',
    unsafeDecisionFromOpenSeconds: typeof item.unsafeDecisionSeconds === 'number' ? item.unsafeDecisionSeconds : 'N/A',
    unsafeDecisionFromOpenDuration: formatSeconds(item.unsafeDecisionSeconds),
    hasTask: item.taskId ? 'Yes' : 'No',
    taskDone: item.taskId ? (item.taskDone ? 'Yes' : 'No') : 'N/A'
  }))

  const groupSheet = XLSX.utils.json_to_sheet(groupOrderRows)
  const statusSheet = XLSX.utils.json_to_sheet(emailStatusRows)

  XLSX.utils.book_append_sheet(workbook, groupSheet, 'Group Order')
  XLSX.utils.book_append_sheet(workbook, statusSheet, 'Email Status')

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
          <p class="meta">From: {{ item.from }} • Delay: {{ item.delaySeconds }}s</p>
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
      <h2>Admin Controls</h2>
      <p class="meta">Use checkboxes to manage tasks manually for test flow control.</p>

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

      <div v-for="group in groupOrder" :key="`admin-${group.id}`" class="group-block">
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
      </div>

      <label class="export-name-field">
        Excel filename
        <input v-model="exportFileName" type="text" placeholder="simulation-export" />
      </label>

      <button class="export-button" @click="exportAdminDataToExcel">Export to Excel</button>
      <button class="reset-button" @click="restartSimulation">Clear localStorage + Restart Timeline</button>
    </section>
  </main>
</template>
