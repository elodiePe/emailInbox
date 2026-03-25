import { computed, ref, watch } from 'vue'
import schedule from '../data/emailSchedule.json'
import { hasSupabaseConfig, supabase } from '../lib/supabase'

const STORAGE_KEY_PREFIX = 'email-simulation-state'
const SESSION_STORAGE_KEY = 'email-simulation-active-session'
const CLOUD_TABLE = 'simulation_state'
const CLOUD_POLL_MS = 4000
const EMAIL_AUTO_ADVANCE_MS = 7000
const DEFAULT_ROOM_KEY = import.meta.env.VITE_SIMULATION_ROOM || 'default'

const selectedEmailId = ref(null)
const incomingEmails = ref([])
const sentEmails = ref([])
const completedTasks = ref({})
const composeForm = ref({ to: '', subject: '', body: '' })
const usabilityResponses = ref({})
const demographicData = ref({
  gender: '',
  age: '',
  educationLevel: '',
  itBackground: '',
  englishLevel: ''
})

const usabilityQuestions = [
  {
    id: 'sus1',
    instrument: 'SUS',
    text: 'I think that I would like to use this system frequently.',
    minScale: 1,
    maxScale: 5
  },
  {
    id: 'sus2',
    instrument: 'SUS',
    text: 'I found the system unnecessarily complex.',
    minScale: 1,
    maxScale: 5
  },
  {
    id: 'sus3',
    instrument: 'SUS',
    text: 'I thought the system was easy to use.',
    minScale: 1,
    maxScale: 5
  },
  {
    id: 'sus4',
    instrument: 'SUS',
    text: 'I think that I would need the support of a technical person to be able to use this system.',
    minScale: 1,
    maxScale: 5
  },
  {
    id: 'sus5',
    instrument: 'SUS',
    text: 'I found the various functions in this system were well integrated.',
    minScale: 1,
    maxScale: 5
  },
  {
    id: 'sus6',
    instrument: 'SUS',
    text: 'I thought there was too much inconsistency in this system.',
    minScale: 1,
    maxScale: 5
  },
  {
    id: 'sus7',
    instrument: 'SUS',
    text: 'I would imagine that most people would learn to use this system very quickly.',
    minScale: 1,
    maxScale: 5
  },
  {
    id: 'sus8',
    instrument: 'SUS',
    text: 'I found the system very cumbersome to use.',
    minScale: 1,
    maxScale: 5
  },
  {
    id: 'sus9',
    instrument: 'SUS',
    text: 'I felt very confident using the system.',
    minScale: 1,
    maxScale: 5
  },
  {
    id: 'sus10',
    instrument: 'SUS',
    text: 'I needed to learn a lot of things before I could get going with this system.',
    minScale: 1,
    maxScale: 5
  },
  {
    id: 'ueqs1',
    instrument: 'UEQ-S',
    text: 'Obstructive / Supportive',
    leftLabel: 'Obstructive',
    rightLabel: 'Supportive',
    minScale: 1,
    maxScale: 7
  },
  {
    id: 'ueqs2',
    instrument: 'UEQ-S',
    text: 'Complicated / Easy',
    leftLabel: 'Complicated',
    rightLabel: 'Easy',
    minScale: 1,
    maxScale: 7
  },
  {
    id: 'ueqs3',
    instrument: 'UEQ-S',
    text: 'Inefficient / Efficient',
    leftLabel: 'Inefficient',
    rightLabel: 'Efficient',
    minScale: 1,
    maxScale: 7
  },
  {
    id: 'ueqs4',
    instrument: 'UEQ-S',
    text: 'Confusing / Clear',
    leftLabel: 'Confusing',
    rightLabel: 'Clear',
    minScale: 1,
    maxScale: 7
  },
  {
    id: 'ueqs5',
    instrument: 'UEQ-S',
    text: 'Boring / Exciting',
    leftLabel: 'Boring',
    rightLabel: 'Exciting',
    minScale: 1,
    maxScale: 7
  },
  {
    id: 'ueqs6',
    instrument: 'UEQ-S',
    text: 'Not Interesting / Interesting',
    leftLabel: 'Not Interesting',
    rightLabel: 'Interesting',
    minScale: 1,
    maxScale: 7
  },
  {
    id: 'ueqs7',
    instrument: 'UEQ-S',
    text: 'Conventional / Inventive',
    leftLabel: 'Conventional',
    rightLabel: 'Inventive',
    minScale: 1,
    maxScale: 7
  },
  {
    id: 'ueqs8',
    instrument: 'UEQ-S',
    text: 'Usual / Leading Edge',
    leftLabel: 'Usual',
    rightLabel: 'Leading Edge',
    minScale: 1,
    maxScale: 7
  }
]

function getUsabilityQuestionById(questionId) {
  return usabilityQuestions.find((question) => question.id === questionId) || null
}

function isValidUsabilityScore(questionId, score) {
  const question = getUsabilityQuestionById(questionId)
  if (!question) return false

  const minScale = Number.isInteger(question.minScale) ? question.minScale : 1
  const maxScale = Number.isInteger(question.maxScale) ? question.maxScale : 5

  return Number.isInteger(score) && score >= minScale && score <= maxScale
}

const simulationStartedAt = Date.now()
const introActivatedAt = ref(simulationStartedAt)
const groupActivationTime = ref({})
const deliveredEmailIds = ref(new Set())
const groupSequence = ref(schedule.groups.map((group) => group.id))
const currentSessionId = ref(DEFAULT_ROOM_KEY)

const initialized = ref(false)
const localRevision = ref(0)
const syncStatus = ref(hasSupabaseConfig ? 'connecting' : 'local-only')
const syncMessage = ref(hasSupabaseConfig ? '' : 'Supabase disabled (missing env). Using local mode.')
let timerId = null
let cloudSyncTimerId = null

function normalizeSessionId(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase()
}

function getLocalStorageKey(sessionId) {
  return `${STORAGE_KEY_PREFIX}:${sessionId}`
}

const orderedGroups = computed(() => {
  const byId = new Map(schedule.groups.map((group) => [group.id, group]))
  const ordered = groupSequence.value
    .map((id) => byId.get(id))
    .filter((group) => Boolean(group))

  const missing = schedule.groups.filter((group) => !groupSequence.value.includes(group.id))
  return [...ordered, ...missing]
})

const outroEmails = computed(() => {
  const rawOutro = schedule.outro
  if (!rawOutro) return []

  if (Array.isArray(rawOutro.emails)) {
    return rawOutro.emails
  }

  if (typeof rawOutro === 'object' && rawOutro.id && rawOutro.subject && rawOutro.body) {
    return [rawOutro]
  }

  return []
})

const groupOrder = computed(() => {
  const groups = [schedule.introduction, ...orderedGroups.value]
  if (outroEmails.value.length === 0) return groups

  return [
    ...groups,
    {
      id: 'outro',
      label: 'Outro',
      emails: outroEmails.value
    }
  ]
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
      const unsafe = deliveredInstance ? deliveredInstance.isUnsafe === true : false
      const unsafeDeclaredAtMs = deliveredInstance ? deliveredInstance.unsafeDeclaredAtMs : null
      const openedAtMs = deliveredInstance ? deliveredInstance.openedAtMs : null
      const unsafeDecisionSeconds =
        unsafe && typeof unsafeDeclaredAtMs === 'number'
          ? (typeof openedAtMs === 'number'
              ? Math.max(0, (unsafeDeclaredAtMs - openedAtMs) / 1000)
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
        unsafe,
        unsafeDecisionSeconds,
        taskDone
      }
    })
  })
})

function normalizeIncomingEmail(email) {
  return {
    ...email,
    isUnsafe: email.isUnsafe === true,
    isRead: email.isRead === true,
    receivedAtMs: typeof email.receivedAtMs === 'number' ? email.receivedAtMs : null,
    openedAtMs: typeof email.openedAtMs === 'number' ? email.openedAtMs : null,
    unsafeDeclaredAtMs: typeof email.unsafeDeclaredAtMs === 'number' ? email.unsafeDeclaredAtMs : null
  }
}

function normalizeUsabilityResponses(value) {
  if (!value || typeof value !== 'object') return {}

  const normalized = {}
  Object.entries(value).forEach(([questionId, score]) => {
    const numericScore = Number(score)
    if (isValidUsabilityScore(questionId, numericScore)) {
      normalized[questionId] = numericScore
    }
  })

  return normalized
}

function normalizeDemographicData(value) {
  const fallback = {
    gender: '',
    age: '',
    educationLevel: '',
    itBackground: '',
    englishLevel: ''
  }

  if (!value || typeof value !== 'object') return fallback

  const allowedGenders = new Set(['Male', 'Female', 'Other'])
  const allowedEnglishLevels = new Set(['Beginner', 'Intermediate', 'Advanced', 'Native'])
  const allowedEducationLevels = new Set(['High School', 'Bachelor', 'Master', 'PhD', 'Other'])
  const allowedItBackgrounds = new Set(['None', 'Basic User', 'Student', 'Professional', 'Other'])

  const normalizedGender = String(value.gender || '').trim()
  const normalizedAge = String(value.age || '').trim().replace(/[^0-9]/g, '')
  const normalizedEducationLevel = String(value.educationLevel || '').trim()
  const normalizedItBackground = String(value.itBackground || '').trim()
  const normalizedEnglishLevel = String(value.englishLevel || '').trim()

  return {
    gender: allowedGenders.has(normalizedGender) ? normalizedGender : '',
    age: normalizedAge,
    educationLevel: allowedEducationLevels.has(normalizedEducationLevel) ? normalizedEducationLevel : '',
    itBackground: allowedItBackgrounds.has(normalizedItBackground) ? normalizedItBackground : '',
    englishLevel: allowedEnglishLevels.has(normalizedEnglishLevel) ? normalizedEnglishLevel : ''
  }
}

function applyStatePayload(parsed) {
  selectedEmailId.value = parsed.selectedEmailId || null
  incomingEmails.value = Array.isArray(parsed.incomingEmails) ? parsed.incomingEmails.map(normalizeIncomingEmail) : []
  sentEmails.value = Array.isArray(parsed.sentEmails) ? parsed.sentEmails : []
  completedTasks.value = parsed.completedTasks && typeof parsed.completedTasks === 'object' ? parsed.completedTasks : {}
  usabilityResponses.value = normalizeUsabilityResponses(parsed.usabilityResponses)
  demographicData.value = normalizeDemographicData(parsed.demographicData)
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

  // Keep delivered history even if inbox is currently empty.
  // Clearing this set causes the scheduler to resend all emails from the start.
  deliveredEmailIds.value = new Set([...savedDelivered, ...deliveredFromInbox])

  localRevision.value = typeof parsed._revision === 'number' ? parsed._revision : 0
}

function buildStatePayload(revision) {
  return {
    selectedEmailId: selectedEmailId.value,
    incomingEmails: incomingEmails.value,
    sentEmails: sentEmails.value,
    completedTasks: completedTasks.value,
    usabilityResponses: usabilityResponses.value,
    demographicData: demographicData.value,
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

  const { error } = await supabase
    .from(CLOUD_TABLE)
    .upsert({
      id: currentSessionId.value,
      payload
    }, {
      onConflict: 'id'
    })

  if (error) {
    syncStatus.value = 'error'
    syncMessage.value = `Sync write failed: ${error.message}`
  } else {
    syncStatus.value = 'connected'
    syncMessage.value = ''
  }
}

function saveState(options = { syncRemote: true }) {
  const revision = Date.now()
  localRevision.value = revision
  const payload = buildStatePayload(revision)
  window.localStorage.setItem(getLocalStorageKey(currentSessionId.value), JSON.stringify(payload))
  window.localStorage.setItem(SESSION_STORAGE_KEY, currentSessionId.value)

  if (options.syncRemote !== false) {
    void saveRemoteState(payload)
  }
}

function loadLocalState() {
  const raw = window.localStorage.getItem(getLocalStorageKey(currentSessionId.value))
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
    .eq('id', currentSessionId.value)
    .maybeSingle()

  if (error) {
    syncStatus.value = 'error'
    syncMessage.value = `Sync read failed: ${error.message}`
    return
  }

  syncStatus.value = 'connected'
  syncMessage.value = ''

  if (!data || !data.payload) return

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
    isUnsafe: false,
    unsafeDeclaredAtMs: null,
    openedAtMs: null,
    receivedAtMs: Date.now(),
    receivedAt: new Date().toLocaleTimeString()
  })

  if (!selectedEmailId.value) {
    selectedEmailId.value = instanceId
  }
}

function getLatestDeliveredEmail() {
  const delivered = incomingEmails.value
    .sort((a, b) => {
      const aMs = typeof a.receivedAtMs === 'number' ? a.receivedAtMs : 0
      const bMs = typeof b.receivedAtMs === 'number' ? b.receivedAtMs : 0
      return bMs - aMs
    })

  return delivered[0] || null
}

function maybeDeliverNextEmailInSequence(now) {
  const latestDelivered = getLatestDeliveredEmail()
  if (latestDelivered) {
    const hasBeenOpened = latestDelivered.isRead === true
    const receivedAtMs = typeof latestDelivered.receivedAtMs === 'number' ? latestDelivered.receivedAtMs : 0
    const timedOut = now - receivedAtMs >= EMAIL_AUTO_ADVANCE_MS

    if (!hasBeenOpened && !timedOut) {
      return false
    }
  }

  const nextEntry = groupOrder.value
    .flatMap((group) => group.emails.map((email) => ({ groupId: group.id, email })))
    .find(({ groupId, email }) => {
      const emailKey = `${groupId}:${email.id}`
    return !deliveredEmailIds.value.has(emailKey)
  })

  if (!nextEntry) return false

  deliverEmail(nextEntry.email, nextEntry.groupId)
  deliveredEmailIds.value.add(`${nextEntry.groupId}:${nextEntry.email.id}`)
  return true
}

function tickSimulation() {
  const now = Date.now()

  const stateChanged = maybeDeliverNextEmailInSequence(now)

  if (stateChanged) {
    saveState()
  }
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
    tickSimulation()
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

function toggleEmailUnsafe(instanceId, unsafe) {
  const target = incomingEmails.value.find((email) => email.instanceId === instanceId)
  if (!target) return
  const nextUnsafe = unsafe === true
  target.isUnsafe = nextUnsafe
  if (nextUnsafe) {
    target.unsafeDeclaredAtMs = Date.now()
  } else {
    target.unsafeDeclaredAtMs = null
  }
  saveState()
}

function resetInMemoryState() {
  selectedEmailId.value = null
  incomingEmails.value = []
  sentEmails.value = []
  completedTasks.value = {}
  usabilityResponses.value = {}
  demographicData.value = {
    gender: '',
    age: '',
    educationLevel: '',
    itBackground: '',
    englishLevel: ''
  }
  composeForm.value = { to: '', subject: '', body: '' }
  introActivatedAt.value = simulationStartedAt
  groupActivationTime.value = {}
  deliveredEmailIds.value = new Set()
  groupSequence.value = schedule.groups.map((group) => group.id)
  localRevision.value = 0
}

async function switchSession(sessionId) {
  const normalized = normalizeSessionId(sessionId)
  if (!normalized) return false

  if (normalized === currentSessionId.value) return true

  currentSessionId.value = normalized
  window.localStorage.setItem(SESSION_STORAGE_KEY, normalized)

  resetInMemoryState()
  loadLocalState()
  await pullRemoteStateIfNewer()

  releaseNextGroupIfReady()
  tickSimulation()
  saveState()
  return true
}

async function restartSimulation() {
  // Clean up password manager study data (but keep passwords)
  const PM_API_BASE = String(import.meta.env.VITE_PASSWORD_MANAGER_API_URL || 'http://localhost:5000').replace(/\/+$/, '')
  const PM_FRICTION_LOG_KEY_PREFIX = 'pm-positive-friction-log'
  const sessionId = currentSessionId.value

  try {
    // Delete all credential copy events for this session
    await fetch(`${PM_API_BASE}/api/study/credential-copy?sessionId=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE'
    })
  } catch (err) {
    console.warn('Failed to delete credential copy events:', err)
  }

  try {
    // Delete all password page sessions for this session
    await fetch(`${PM_API_BASE}/api/study/password-page-session?sessionId=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE'
    })
  } catch (err) {
    console.warn('Failed to delete password page sessions:', err)
  }

  // Clear password manager localStorage challenge logs
  const frictionLogKey = `${PM_FRICTION_LOG_KEY_PREFIX}:${sessionId}`
  window.localStorage.removeItem(frictionLogKey)

  // Also clear challenge index
  window.sessionStorage.removeItem('pm.challenge.index')

  // Clear email simulation data
  window.localStorage.removeItem(getLocalStorageKey(currentSessionId.value))
  selectedEmailId.value = null
  incomingEmails.value = []
  sentEmails.value = []
  completedTasks.value = {}
  usabilityResponses.value = {}
  demographicData.value = {
    gender: '',
    age: '',
    educationLevel: '',
    itBackground: '',
    englishLevel: ''
  }
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

function setUsabilityResponse(questionId, score) {
  const normalizedScore = Number(score)
  if (!isValidUsabilityScore(questionId, normalizedScore)) return

  usabilityResponses.value = {
    ...usabilityResponses.value,
    [questionId]: normalizedScore
  }
  saveState()
}

function setDemographicField(field, value) {
  const allowedFields = new Set(['gender', 'age', 'educationLevel', 'itBackground', 'englishLevel'])
  if (!allowedFields.has(field)) return

  let normalizedValue = String(value ?? '').trim()

  if (field === 'age') {
    normalizedValue = normalizedValue.replace(/[^0-9]/g, '')
  }

  if (field === 'gender') {
    const allowedGenders = new Set(['Male', 'Female', 'Other'])
    if (!allowedGenders.has(normalizedValue)) normalizedValue = ''
  }

  if (field === 'englishLevel') {
    const allowedEnglishLevels = new Set(['Beginner', 'Intermediate', 'Advanced', 'Native'])
    if (!allowedEnglishLevels.has(normalizedValue)) normalizedValue = ''
  }

  if (field === 'educationLevel') {
    const allowedEducationLevels = new Set(['High School', 'Bachelor', 'Master', 'PhD', 'Other'])
    if (!allowedEducationLevels.has(normalizedValue)) normalizedValue = ''
  }

  if (field === 'itBackground') {
    const allowedItBackgrounds = new Set(['None', 'Basic User', 'Student', 'Professional', 'Other'])
    if (!allowedItBackgrounds.has(normalizedValue)) normalizedValue = ''
  }

  demographicData.value = {
    ...demographicData.value,
    [field]: normalizedValue
  }

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
  tickSimulation()
})

async function initializeSimulation() {
  if (initialized.value) return

  const storedSession = normalizeSessionId(window.localStorage.getItem(SESSION_STORAGE_KEY))
  currentSessionId.value = storedSession || normalizeSessionId(DEFAULT_ROOM_KEY) || 'default'

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
    syncStatus,
    syncMessage,
    currentSessionId,
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
    usabilityQuestions,
    usabilityResponses,
    demographicData,
    toggleTask,
    setUsabilityResponse,
    setDemographicField,
    selectEmail,
    toggleEmailUnsafe,
    sendEmail,
    restartSimulation,
    initializeSimulation,
    moveGroup,
    switchSession
  }
}

export { useSimulationStore }
