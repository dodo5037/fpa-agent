const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function fetchSummary() {
  const res = await fetch(`${API}/api/summary`)
  return res.json()
}

export async function fetchVariances() {
  const res = await fetch(`${API}/api/variance`)
  return res.json()
}

export async function fetchAnomalies(threshold = 10) {
  const res = await fetch(`${API}/api/anomalies?threshold_pct=${threshold}`)
  return res.json()
}

export async function fetchAuditLog(limit = 50, offset = 0) {
  const res = await fetch(`${API}/api/audit/log?limit=${limit}&offset=${offset}`)
  return res.json()
}

export async function fetchAuditEntry(ref) {
  const res = await fetch(`${API}/api/audit/${ref}`)
  if (res.status === 404) return null
  return res.json()
}

export async function askQuestion(question) {
  const res = await fetch(`${API}/api/ask`, {
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

export async function generateMemo() {
  const res = await fetch(`${API}/api/memo`, {
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

export async function uploadData(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API}/api/data/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json()
}

export async function fetchSettings() {
  const res = await fetch(`${API}/api/settings`)
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
