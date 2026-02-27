import { computed, ref, watch } from 'vue'
import schedule from '../data/emailSchedule.json'
import { hasSupabaseConfig, supabase } from '../lib/supabase'

const STORAGE_KEY = 'email-simulation-state-v1'
const CLOUD_TABLE = 'simulation_state'
const CLOUD_POLL_MS = 4000
const ROOM_KEY = import.meta.env.VITE_SIMULATION_ROOM || 'default'

const selectedEmailId = ref(null)
const incomingEmails = ref([])
const sentEmails = ref([])
const completedTasks = ref({})
const composeForm = ref({ to: '', subject: '', body: '' })

const simulationStartedAt = Date.now()
const introActivatedAt = ref(simulationStartedAt)
const groupActivationTime = ref({})
const deliveredEmailIds = ref(new Set())
const groupSequence = ref(schedule.groups.map((group) => group.id))

const initialized = ref(false)
const localRevision = ref(0)
let timerId = null
let cloudSyncTimerId = null

const orderedGroups = computed(() => {
  const byId = new Map(schedule.groups.map((group) => [group.id, group]))
  const ordered = groupSequence.value
    .map((id) => byId.get(id))
    .filter((group) => Boolean(group))

  const missing = schedule.groups.filter((group) => !groupSequence.value.includes(group.id))
  return [...ordered, ...missing]
})

const groupOrder = computed(() => [schedule.introduction, ...orderedGroups.value])

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

function areGroupTasksCompleted(groupId) {
  const tasks = allTasksByGroup.value[groupId] || []
  if (tasks.length === 0) return true
  return tasks.every((task) => completedTasks.value[task.taskId] === true)
}

const unlockedGroups = computed(() => {
  const unlocked = { intro: true }
  orderedGroups.value.forEach((group, index) => {
    const previousGroupId = index === 0 ? 'intro' : orderedGroups.value[index - 1].id
    unlocked[group.id] = areGroupTasksCompleted(previousGroupId)
  })
  return unlocked
})

const currentGroupToUnlock = computed(() => {
  return orderedGroups.value.find((group) => !groupActivationTime.value[group.id] && unlockedGroups.value[group.id])
})

const selectedEmail = computed(() => {
  return incomingEmails.value.find((email) => email.instanceId === selectedEmailId.value) || null
})

const inboxCount = computed(() => incomingEmails.value.length)

const timelineEntries = computed(() => {
  return groupOrder.value.flatMap((group) => {
    return group.emails.map((email) => {
      const emailKey = `${group.id}:${email.id}`
      const delivered = deliveredEmailIds.value.has(emailKey)
      const deliveredInstance = incomingEmails.value.find(
        (item) => item.groupId === group.id && item.id === email.id
      )
      const opened = deliveredInstance ? deliveredInstance.isRead === true : false
      const dangerous = deliveredInstance ? deliveredInstance.isDangerous === true : false
      const dangerousDeclaredAtMs = deliveredInstance ? deliveredInstance.dangerousDeclaredAtMs : null
      const openedAtMs = deliveredInstance ? deliveredInstance.openedAtMs : null
      const dangerousDecisionSeconds =
        dangerous && typeof dangerousDeclaredAtMs === 'number'
          ? (typeof openedAtMs === 'number'
              ? Math.max(0, Math.round((dangerousDeclaredAtMs - openedAtMs) / 1000))
              : 0)
          : null
      const taskDone = email.taskId ? completedTasks.value[email.taskId] === true : false

      return {
        ...email,
        groupId: group.id,
        groupLabel: group.label,
        emailKey,
        delivered,
        opened,
        dangerous,
        dangerousDecisionSeconds,
        taskDone
      }
    })
  })
})

function normalizeIncomingEmail(email) {
  return {
    ...email,
    isDangerous: email.isDangerous === true,
    isRead: email.isRead === true,
    receivedAtMs: typeof email.receivedAtMs === 'number' ? email.receivedAtMs : null,
    openedAtMs: typeof email.openedAtMs === 'number' ? email.openedAtMs : null,
    dangerousDeclaredAtMs: typeof email.dangerousDeclaredAtMs === 'number' ? email.dangerousDeclaredAtMs : null
  }
}

function applyStatePayload(parsed) {
  selectedEmailId.value = parsed.selectedEmailId || null
  incomingEmails.value = Array.isArray(parsed.incomingEmails) ? parsed.incomingEmails.map(normalizeIncomingEmail) : []
  sentEmails.value = Array.isArray(parsed.sentEmails) ? parsed.sentEmails : []
  completedTasks.value = parsed.completedTasks && typeof parsed.completedTasks === 'object' ? parsed.completedTasks : {}
  composeForm.value = parsed.composeForm && typeof parsed.composeForm === 'object'
    ? {
        to: parsed.composeForm.to || '',
        subject: parsed.composeForm.subject || '',
        body: parsed.composeForm.body || ''
      }
    : { to: '', subject: '', body: '' }
  introActivatedAt.value = typeof parsed.introActivatedAt === 'number' ? parsed.introActivatedAt : simulationStartedAt
  groupActivationTime.value = parsed.groupActivationTime && typeof parsed.groupActivationTime === 'object' ? parsed.groupActivationTime : {}
  groupSequence.value = Array.isArray(parsed.groupSequence) && parsed.groupSequence.length > 0
    ? parsed.groupSequence.filter((id) => schedule.groups.some((group) => group.id === id))
    : schedule.groups.map((group) => group.id)

  const savedDelivered = new Set(Array.isArray(parsed.deliveredEmailIds) ? parsed.deliveredEmailIds : [])
  const deliveredFromInbox = new Set(
    incomingEmails.value
      .filter((email) => email.groupId && email.id)
      .map((email) => `${email.groupId}:${email.id}`)
  )

  if (incomingEmails.value.length === 0) {
    deliveredEmailIds.value = new Set()
  } else {
    deliveredEmailIds.value = new Set([...savedDelivered, ...deliveredFromInbox])
  }

  localRevision.value = typeof parsed._revision === 'number' ? parsed._revision : 0
}

function buildStatePayload(revision) {
  return {
    selectedEmailId: selectedEmailId.value,
    incomingEmails: incomingEmails.value,
    sentEmails: sentEmails.value,
    completedTasks: completedTasks.value,
    composeForm: composeForm.value,
    introActivatedAt: introActivatedAt.value,
    groupActivationTime: groupActivationTime.value,
    deliveredEmailIds: Array.from(deliveredEmailIds.value),
    groupSequence: groupSequence.value,
    _revision: revision
  }
}

async function saveRemoteState(payload) {
  if (!hasSupabaseConfig || !supabase) return

  await supabase
    .from(CLOUD_TABLE)
    .upsert({
      id: ROOM_KEY,
      payload
    }, {
      onConflict: 'id'
    })
}

function saveState(options = { syncRemote: true }) {
  const revision = Date.now()
  localRevision.value = revision
  const payload = buildStatePayload(revision)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))

  if (options.syncRemote !== false) {
    void saveRemoteState(payload)
  }
}

function loadLocalState() {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw)
    applyStatePayload(parsed)
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

async function pullRemoteStateIfNewer() {
  if (!hasSupabaseConfig || !supabase) return

  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select('payload')
    .eq('id', ROOM_KEY)
    .maybeSingle()

  if (error || !data || !data.payload) return

  const remotePayload = data.payload
  const remoteRevision = typeof remotePayload._revision === 'number' ? remotePayload._revision : 0

  if (remoteRevision > localRevision.value) {
    applyStatePayload(remotePayload)
    saveState({ syncRemote: false })
  }
}

function deliverEmail(email, groupId) {
  const instanceId = `${email.id}-${Date.now()}`
  incomingEmails.value.unshift({
    ...email,
    groupId,
    instanceId,
    isRead: false,
    isDangerous: false,
    dangerousDeclaredAtMs: null,
    openedAtMs: null,
    receivedAtMs: Date.now(),
    receivedAt: new Date().toLocaleTimeString()
  })

  if (!selectedEmailId.value) {
    selectedEmailId.value = instanceId
  }
}

function tickSimulation() {
  const now = Date.now()

  schedule.introduction.emails.forEach((email) => {
    const emailKey = `${schedule.introduction.id}:${email.id}`
    const isDue = now - introActivatedAt.value >= email.delaySeconds * 1000

    if (isDue && !deliveredEmailIds.value.has(emailKey)) {
      deliverEmail(email, schedule.introduction.id)
      deliveredEmailIds.value.add(emailKey)
      saveState()
    }
  })

  orderedGroups.value.forEach((group) => {
    const activatedAt = groupActivationTime.value[group.id]
    if (!activatedAt) return

    group.emails.forEach((email) => {
      const emailKey = `${group.id}:${email.id}`
      const isDue = now - activatedAt >= email.delaySeconds * 1000

      if (isDue && !deliveredEmailIds.value.has(emailKey)) {
        deliverEmail(email, group.id)
        deliveredEmailIds.value.add(emailKey)
        saveState()
      }
    })
  })
}

function moveGroup(groupId, direction) {
  const index = groupSequence.value.indexOf(groupId)
  if (index === -1) return

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= groupSequence.value.length) return

  const next = [...groupSequence.value]
  const current = next[index]
  next[index] = next[targetIndex]
  next[targetIndex] = current
  groupSequence.value = next
  saveState()
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

function toggleEmailDangerous(instanceId, dangerous) {
  const target = incomingEmails.value.find((email) => email.instanceId === instanceId)
  if (!target) return
  const nextDangerous = dangerous === true
  target.isDangerous = nextDangerous
  if (nextDangerous) {
    target.dangerousDeclaredAtMs = Date.now()
  } else {
    target.dangerousDeclaredAtMs = null
  }
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

watch(selectedEmailId, (instanceId) => {
  if (!instanceId) return
  const target = incomingEmails.value.find((email) => email.instanceId === instanceId)
  if (!target || target.isRead === true) return
  target.isRead = true
  if (typeof target.openedAtMs !== 'number') {
    target.openedAtMs = Date.now()
  }
  saveState()
})

async function initializeSimulation() {
  if (initialized.value) return

  loadLocalState()
  await pullRemoteStateIfNewer()

  releaseNextGroupIfReady()
  tickSimulation()
  timerId = window.setInterval(tickSimulation, 1000)

  if (hasSupabaseConfig) {
    cloudSyncTimerId = window.setInterval(() => {
      void pullRemoteStateIfNewer()
    }, CLOUD_POLL_MS)
  }

  initialized.value = true
}

function useSimulationStore() {
  return {
    groupOrder,
    orderedGroups,
    groupSequence,
    allTasksByGroup,
    unlockedGroups,
    selectedEmail,
    selectedEmailId,
    incomingEmails,
    inboxCount,
    sentEmails,
    composeForm,
    timelineEntries,
    completedTasks,
    toggleTask,
    selectEmail,
    toggleEmailDangerous,
    sendEmail,
    restartSimulation,
    initializeSimulation,
    moveGroup
  }
}

export { useSimulationStore }
