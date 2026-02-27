import { computed, ref, watch } from 'vue'
import schedule from '../data/emailSchedule.json'

const STORAGE_KEY = 'email-simulation-state-v1'

const selectedEmailId = ref(null)
const incomingEmails = ref([])
const sentEmails = ref([])
const completedTasks = ref({})

const composeForm = ref({
  to: '',
  subject: '',
  body: ''
})

const simulationStartedAt = Date.now()
const introActivatedAt = ref(simulationStartedAt)
const groupActivationTime = ref({})
const deliveredEmailIds = ref(new Set())
const initialized = ref(false)
let timerId = null

const groupOrder = computed(() => [schedule.introduction, ...schedule.groups])

const timelineEntries = computed(() => {
  return groupOrder.value.flatMap((group) => {
    return group.emails.map((email) => {
      const emailKey = `${group.id}:${email.id}`
      const delivered = deliveredEmailIds.value.has(emailKey)
      const deliveredInstance = incomingEmails.value.find(
        (item) => item.groupId === group.id && item.id === email.id
      )
      const opened = deliveredInstance ? deliveredInstance.isRead === true : false
      const taskDone = email.taskId ? completedTasks.value[email.taskId] === true : false

      return {
        ...email,
        groupId: group.id,
        groupLabel: group.label,
        emailKey,
        delivered,
        opened,
        taskDone
      }
    })
  })
})

const allTasksByGroup = computed(() => {
  const map = {}
  groupOrder.value.forEach((group) => {
    map[group.id] = group.emails
      .filter((email) => email.taskId)
      .map((email) => ({
        taskId: email.taskId,
        label: email.taskLabel,
        emailId: email.id
      }))
  })
  return map
})

const unlockedGroups = computed(() => {
  const unlocked = { intro: true }
  schedule.groups.forEach((group, index) => {
    const previousGroupId = index === 0 ? 'intro' : schedule.groups[index - 1].id
    unlocked[group.id] = areGroupTasksCompleted(previousGroupId)
  })
  return unlocked
})

const currentGroupToUnlock = computed(() => {
  return schedule.groups.find((group) => !groupActivationTime.value[group.id] && unlockedGroups.value[group.id])
})

const selectedEmail = computed(() => {
  return incomingEmails.value.find((email) => email.instanceId === selectedEmailId.value) || null
})

const inboxCount = computed(() => incomingEmails.value.length)

function saveState() {
  const payload = {
    selectedEmailId: selectedEmailId.value,
    incomingEmails: incomingEmails.value,
    sentEmails: sentEmails.value,
    completedTasks: completedTasks.value,
    introActivatedAt: introActivatedAt.value,
    groupActivationTime: groupActivationTime.value,
    deliveredEmailIds: Array.from(deliveredEmailIds.value)
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

function loadState() {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw)

    selectedEmailId.value = parsed.selectedEmailId || null
    incomingEmails.value = Array.isArray(parsed.incomingEmails) ? parsed.incomingEmails : []
    sentEmails.value = Array.isArray(parsed.sentEmails) ? parsed.sentEmails : []
    completedTasks.value = parsed.completedTasks && typeof parsed.completedTasks === 'object' ? parsed.completedTasks : {}
    introActivatedAt.value = typeof parsed.introActivatedAt === 'number' ? parsed.introActivatedAt : simulationStartedAt
    groupActivationTime.value = parsed.groupActivationTime && typeof parsed.groupActivationTime === 'object' ? parsed.groupActivationTime : {}
    deliveredEmailIds.value = new Set(Array.isArray(parsed.deliveredEmailIds) ? parsed.deliveredEmailIds : [])
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

function areGroupTasksCompleted(groupId) {
  const tasks = allTasksByGroup.value[groupId] || []
  if (tasks.length === 0) return true
  return tasks.every((task) => completedTasks.value[task.taskId] === true)
}

function deliverEmail(email, groupId) {
  const instanceId = `${email.id}-${Date.now()}`
  incomingEmails.value.unshift({
    ...email,
    groupId,
    instanceId,
    isRead: false,
    receivedAt: new Date().toLocaleTimeString()
  })

  if (!selectedEmailId.value) {
    selectedEmailId.value = instanceId
  }
}

function tickSimulation() {
  const now = Date.now()
  let changed = false

  schedule.introduction.emails.forEach((email) => {
    const emailKey = `${schedule.introduction.id}:${email.id}`
    const isDue = now - introActivatedAt.value >= email.delaySeconds * 1000

    if (isDue && !deliveredEmailIds.value.has(emailKey)) {
      deliverEmail(email, schedule.introduction.id)
      deliveredEmailIds.value.add(emailKey)
      changed = true
    }
  })

  schedule.groups.forEach((group) => {
    const activatedAt = groupActivationTime.value[group.id]
    if (!activatedAt) return

    group.emails.forEach((email) => {
      const emailKey = `${group.id}:${email.id}`
      const isDue = now - activatedAt >= email.delaySeconds * 1000

      if (isDue && !deliveredEmailIds.value.has(emailKey)) {
        deliverEmail(email, group.id)
        deliveredEmailIds.value.add(emailKey)
        changed = true
      }
    })
  })

  if (changed) {
    saveState()
  }
}

function releaseNextGroupIfReady() {
  if (!currentGroupToUnlock.value) return
  const groupId = currentGroupToUnlock.value.id
  if (!groupActivationTime.value[groupId]) {
    groupActivationTime.value = {
      ...groupActivationTime.value,
      [groupId]: Date.now()
    }
    saveState()
  }
}

function toggleTask(taskId, done) {
  completedTasks.value = {
    ...completedTasks.value,
    [taskId]: done
  }
  releaseNextGroupIfReady()
  saveState()
}

function selectEmail(instanceId) {
  selectedEmailId.value = instanceId
  saveState()
}

function restartSimulation() {
  window.localStorage.removeItem(STORAGE_KEY)
  selectedEmailId.value = null
  incomingEmails.value = []
  sentEmails.value = []
  completedTasks.value = {}
  composeForm.value = {
    to: '',
    subject: '',
    body: ''
  }

  const now = Date.now()
  introActivatedAt.value = now
  groupActivationTime.value = {}
  deliveredEmailIds.value = new Set()

  releaseNextGroupIfReady()
  tickSimulation()
  saveState()
}

function sendEmail() {
  if (!composeForm.value.to || !composeForm.value.subject || !composeForm.value.body) {
    return
  }

  sentEmails.value.unshift({
    id: `sent-${Date.now()}`,
    to: composeForm.value.to,
    subject: composeForm.value.subject,
    body: composeForm.value.body,
    sentAt: new Date().toLocaleTimeString()
  })

  composeForm.value = {
    to: '',
    subject: '',
    body: ''
  }

  saveState()
}

function initializeSimulation() {
  if (initialized.value) return
  loadState()
  releaseNextGroupIfReady()
  tickSimulation()
  timerId = window.setInterval(tickSimulation, 1000)
  initialized.value = true
}

function stopSimulation() {
  saveState()
  if (timerId) {
    window.clearInterval(timerId)
    timerId = null
  }
  initialized.value = false
}

watch(selectedEmailId, (instanceId) => {
  if (!instanceId) return
  const target = incomingEmails.value.find((email) => email.instanceId === instanceId)
  if (!target || target.isRead === true) return
  target.isRead = true
  saveState()
})

export {
  allTasksByGroup,
  completedTasks,
  composeForm,
  groupOrder,
  inboxCount,
  incomingEmails,
  initializeSimulation,
  restartSimulation,
  selectedEmail,
  selectedEmailId,
  selectEmail,
  sendEmail,
  sentEmails,
  stopSimulation,
  timelineEntries,
  toggleTask,
  unlockedGroups
}