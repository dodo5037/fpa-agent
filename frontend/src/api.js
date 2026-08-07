// Use relative URL when served by nginx (Docker), absolute URL in dev
const API = import.meta.env.VITE_API_URL || ''

// Shared fetch options: never cache GET responses
const GET = { cache: 'no-store' }

// Q1.2: AbortController for cancelling long-running LLM requests
let activeController = null

export function cancelActiveRequest() {
  if (activeController) {
    activeController.abort()
    activeController = null
  }
}

export function isRequestActive() {
  return activeController !== null
}

// Q1.2: Wrap fetch with abort signal for cancellable calls
function cancellableFetch(url, options = {}) {
  activeController = new AbortController()
  const opts = { ...options, signal: activeController.signal }
  return fetch(url, opts).finally(() => {
    activeController = null
  })
}

export async function fetchSummary(sessionId) {
  const res = await fetch(`${API}/api/summary?session_id=${sessionId}`, GET)
  return res.json()
}

export async function fetchVariances(sessionId) {
  const res = await fetch(`${API}/api/variance?session_id=${sessionId}`, GET)
  return res.json()
}

export async function fetchAnomalies(sessionId, threshold = 10) {
  const res = await fetch(`${API}/api/anomalies?threshold_pct=${threshold}&session_id=${sessionId}`, GET)
  return res.json()
}

export async function fetchAuditLog(limit = 50, offset = 0) {
  const res = await fetch(`${API}/api/audit/log?limit=${limit}&offset=${offset}`, GET)
  return res.json()
}

export async function fetchAuditEntry(ref) {
  const res = await fetch(`${API}/api/audit/${ref}`, GET)
  if (res.status === 404) return null
  return res.json()
}

export async function askQuestion(question, sessionId) {
  const res = await cancellableFetch(`${API}/api/ask?session_id=${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Query failed')
  }
  return res.json()
}

export async function generateMemo(sessionId) {
  const res = await cancellableFetch(`${API}/api/memo?session_id=${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Memo generation failed')
  }
  return res.json()
}

export async function uploadData(file, sessionId) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API}/api/data/upload?session_id=${sessionId}`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json()
}

export async function fetchSessions() {
  const res = await fetch(`${API}/api/sessions`, GET)
  return res.json()
}

export async function createSession(name) {
  const res = await fetch(`${API}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return res.json()
}

export async function deleteSession(id) {
  const res = await fetch(`${API}/api/sessions/${id}`, { method: 'DELETE' })
  return res.json()
}

export async function fetchSessionInfo(id) {
  const res = await fetch(`${API}/api/sessions/${id}/info`, GET)
  return res.json()
}

export async function fetchSettings() {
  const res = await fetch(`${API}/api/settings`, GET)
  return res.json()
}

export async function updateSettings(settings) {
  const res = await fetch(`${API}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return res.json()
}

export async function clearAuditLog() {
  const res = await fetch(`${API}/api/audit/clear`, { method: 'POST' })
  return res.json()
}

export async function fetchSessionData(sessionId) {
  const res = await fetch(`${API}/api/data/${sessionId}`, GET)
  return res.json()
}

export async function clearSessionData(sessionId) {
  const res = await fetch(`${API}/api/data/${sessionId}`, { method: 'DELETE' })
  return res.json()
}
