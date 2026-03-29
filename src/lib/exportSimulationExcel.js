import * as XLSX from 'xlsx'

const PM_API_BASE = String(import.meta.env.VITE_PASSWORD_MANAGER_API_URL || 'http://localhost:5000').replace(/\/+$/, '')
const PM_CREDENTIAL_COPY_LOG_KEY_PREFIX = 'pm-study-credential-copy'
const PM_PAGE_SESSION_LOG_KEY_PREFIX = 'pm-study-password-page-session'

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

function readAllLocalRowsByPrefix(prefix) {
  const rows = []

  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(`${prefix}:`))
      .forEach((key) => {
        try {
          const parsed = JSON.parse(window.localStorage.getItem(key) || '[]')
          if (Array.isArray(parsed)) rows.push(...parsed)
        } catch {
          // Ignore malformed local chunks.
        }
      })
  } catch {
    return []
  }

  return rows
}

function normalizeCredentialKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function getEmailCredentialKey(email) {
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

async function getPasswordManagerCredentialCopyRows(currentSessionId) {
  const mapStudyRows = (rows) => rows.map((row, index) => ({
    index: index + 1,
    sessionId: row.sessionId || currentSessionId,
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

  const getLocalRows = () => {
    try {
      const storageKey = `${PM_CREDENTIAL_COPY_LOG_KEY_PREFIX}:${currentSessionId}`
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
      return readAllLocalRowsByPrefix(PM_CREDENTIAL_COPY_LOG_KEY_PREFIX)
    } catch {
      return []
    }
  }

  try {
    const url = `${PM_API_BASE}/api/study/credential-copy?sessionId=${encodeURIComponent(currentSessionId)}`
    const response = await fetch(url)
    if (!response.ok) return mapStudyRows(getLocalRows())

    const parsed = await response.json()
    if (!Array.isArray(parsed)) return mapStudyRows(getLocalRows())

    return mapStudyRows(parsed)
  } catch {
    return mapStudyRows(getLocalRows())
  }
}

async function getPasswordManagerPageSessionRows(currentSessionId) {
  const mapStudyRows = (rows) => rows.map((row, index) => {
    const startedAtMs = typeof row.startedAtMs === 'number' ? row.startedAtMs : null
    const endedAtMs = typeof row.endedAtMs === 'number' ? row.endedAtMs : null
    const durationSeconds =
      typeof startedAtMs === 'number' && typeof endedAtMs === 'number'
        ? Math.max(0, (endedAtMs - startedAtMs) / 1000)
        : 'N/A'

    return {
      index: index + 1,
      sessionId: row.sessionId || currentSessionId,
      managerMode: row.managerMode || 'unknown',
      website: row.website || 'N/A',
      accountId: row.accountId || 'N/A',
      exitReason: row.exitReason || 'N/A',
      startedAtMs,
      endedAtMs,
      startedAtISO: typeof startedAtMs === 'number' ? new Date(startedAtMs).toISOString() : 'N/A',
      endedAtISO: typeof endedAtMs === 'number' ? new Date(endedAtMs).toISOString() : 'N/A',
      durationSeconds,
      duration: formatSeconds(typeof durationSeconds === 'number' ? durationSeconds : null)
    }
  })

  const getLocalRows = () => {
    try {
      const storageKey = `${PM_PAGE_SESSION_LOG_KEY_PREFIX}:${currentSessionId}`
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
      return readAllLocalRowsByPrefix(PM_PAGE_SESSION_LOG_KEY_PREFIX)
    } catch {
      return []
    }
  }

  try {
    const url = `${PM_API_BASE}/api/study/password-page-session?sessionId=${encodeURIComponent(currentSessionId)}`
    const response = await fetch(url)
    if (!response.ok) return mapStudyRows(getLocalRows())

    const parsed = await response.json()
    if (!Array.isArray(parsed)) return mapStudyRows(getLocalRows())

    return mapStudyRows(parsed)
  } catch {
    return mapStudyRows(getLocalRows())
  }
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

    if (matchingEvents.length === 0 && email.__credentialKey && (emailCountByKey[email.__credentialKey] || 0) > 1) {
      matchingEvents = eventsByKey.get(email.__credentialKey) || []
    }

    const copyUsernameEvents = matchingEvents.filter((e) => e.actionType === 'copyUsername')
    const copyPasswordEvents = matchingEvents.filter((e) => e.actionType === 'copyPassword')
    const togglePasswordEvents = matchingEvents.filter((e) => e.actionType === 'togglePassword')

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
      togglePasswordCount: togglePasswordEvents.length,
      challengeCount: totalChallenges,
      challengeTypes: Array.from(challengeTypesSet).join(', ') || 'N/A',
      totalChallengeAttempts: totalAttempts,
      matchedEvents: matchingEvents
    }
  })

  return emailCredentialDataMap
}

async function exportSimulationDataToExcel({
  currentSessionId,
  timelineEntries,
  orderedGroups,
  usabilityQuestions,
  usabilityResponses,
  demographicData,
  exportFileName = 'simulation-export'
}) {
  const workbook = XLSX.utils.book_new()
  const passwordManagerCredentialCopyRows = await getPasswordManagerCredentialCopyRows(currentSessionId)
  await getPasswordManagerPageSessionRows(currentSessionId)
  const emailCredentialDataMap = buildDetailedEmailStatusRows(timelineEntries, passwordManagerCredentialCopyRows)

  const usabilityRows = usabilityQuestions.map((question, index) => {
    const score = usabilityResponses[question.id]
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

    const letters = orderedGroups
      .map((group) => letterByGroupId[group.id] || '')
      .filter((value) => value)

    return letters.length > 0 ? letters.join('') : 'N/A'
  })()

  const demographicSectionRows = [
    {
      Participant_ID: currentSessionId,
      Participant_gender: demographicData.gender || 'N/A',
      Participant_age: demographicData.age || 'N/A',
      Participant_levelOfEducation: demographicData.educationLevel || 'N/A',
      Participant_englishLevel: demographicData.englishLevel || 'N/A',
      Participant_ITLevel: demographicData.itBackground || 'N/A',
      Participant_PMGroup: participantPmGroup,
      Participant_EmailsOrder: participantEmailsOrder
    }
  ]

  const emailSectionRows = timelineEntries.map((item, index) => {
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

  const passwordManagerSectionRows = timelineEntries.map((item, index) => {
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

  const emailByCredentialKey = new Map()
  timelineEntries.forEach((item, index) => {
    const key = getEmailCredentialKey(item)
    if (key && !emailByCredentialKey.has(key)) {
      emailByCredentialKey.set(key, { item, order: index + 1 })
    }
  })

  const challengeDetailRows = passwordManagerCredentialCopyRows
    .filter((row) => {
      const challengeType = String(row.challengeType || '').trim()
      return challengeType !== '' && challengeType.toUpperCase() !== 'N/A'
    })
    .map((row) => {
      const matched = emailByCredentialKey.get(getEventCredentialKey(row))
      return {
        Email_order: matched?.order ?? 'N/A',
        Group: matched?.item?.groupLabel || 'N/A',
        Email_ID: matched?.item?.id || 'N/A',
        PM_task_id: row.credentialLinkKey || matched?.item?.linkedCredentialKey || 'N/A',
        PM_mode: row.managerMode || 'unknown',
        Challenge_type: row.challengeType,
        Challenge_attempts: typeof row.challengeAttempts === 'number' ? row.challengeAttempts : 'N/A',
        Challenge_outcome: row.outcome || 'N/A',
        Challenge_time:
          typeof row.challengeDurationSeconds === 'number' ? row.challengeDurationSeconds : 'N/A'
      }
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

  const cleanedName = String(exportFileName || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')

  const baseName = cleanedName || 'simulation-export'
  const fileName = `${baseName}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`
  XLSX.writeFileXLSX(workbook, fileName)
}

export { exportSimulationDataToExcel }