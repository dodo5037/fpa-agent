import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchSummary, fetchVariances, fetchAnomalies, fetchAuditLog, fetchAuditEntry,
  askQuestion, generateMemo, uploadData,
  fetchSessions, createSession, deleteSession,
  fetchSettings, updateSettings, clearAuditLog,
} from './api'
import KPICards from './components/KPICards'
import VarianceTable from './components/VarianceTable'
import AnomalyPanel from './components/AnomalyPanel'
import VarianceChart from './components/VarianceChart'
import QAPanel from './components/QAPanel'
import MemoViewer from './components/MemoViewer'
import AuditTrail from './components/AuditTrail'
import UploadPanel from './components/UploadPanel'
import SettingsPanel from './components/SettingsPanel'
import DataViewer from './components/DataViewer'

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sessionId, setSessionId] = useState(null) // null until sessions load
  const [sessions, setSessions] = useState([])

  const [summary, setSummary] = useState(null)
  const [variances, setVariances] = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [dataLoaded, setDataLoaded] = useState(false)
  const [loading, setLoading] = useState(true)

  const [auditLog, setAuditLog] = useState([])
  const [selectedRef, setSelectedRef] = useState(null)
  const [auditDetail, setAuditDetail] = useState(null)

  // Track the last loaded session to avoid duplicate loads
  const loadedSessionRef = useRef(null)
  const pollingRef = useRef(null)

  // ── Core data loader: loads everything for a session in one shot ──
  const loadSessionData = useCallback(async (sid) => {
    if (!sid) return
    setLoading(true)
    setDataLoaded(false)
    try {
      const [sum, vars, anoms] = await Promise.all([
        fetchSummary(sid),
        fetchVariances(sid),
        fetchAnomalies(sid),
      ])
      setSummary(sum)
      setVariances(vars.results || [])
      setAnomalies(anoms.results || [])
      loadedSessionRef.current = sid
    } catch {
      setSummary(null)
      setVariances([])
      setAnomalies([])
    } finally {
      setDataLoaded(true)
      setLoading(false)
    }
  }, [])

  // ── Load sessions list ──
  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetchSessions()
      return res.sessions || []
    } catch {
      return []
    }
  }, [])

  // ── On mount: load sessions ONCE, pick the right one, load data ──
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const sess = await refreshSessions()
      if (cancelled) return
      setSessions(sess)

      // Pick session: current if it has data, else first with data, else default
      let target = sess.find(s => s.row_count > 0)
      if (!target) target = sess.find(s => s.session_id === 'default') || sess[0]
      if (target) {
        setSessionId(target.session_id)
        await loadSessionData(target.session_id)
      }
    }

    init()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Smart polling: every 60s check if row count changed ──
  useEffect(() => {
    if (!sessionId) return

    const poll = async () => {
      const sess = await refreshSessions()
      setSessions(sess)
      const current = sess.find(s => s.session_id === sessionId)
      if (current && current.row_count !== (loadedSessionRef.current?.rowCount ?? -1)) {
        // Row count changed — reload
        await loadSessionData(sessionId)
      }
    }

    pollingRef.current = setInterval(poll, 60000)
    return () => clearInterval(pollingRef.current)
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Switch session: explicit user action ──
  const switchSession = useCallback((sid) => {
    if (sid === sessionId) return
    setSessionId(sid)
    loadSessionData(sid)
  }, [sessionId, loadSessionData])

  // ── After upload: reload ──
  const handleUploadComplete = useCallback(async () => {
    const sess = await refreshSessions()
    setSessions(sess)
    await loadSessionData(sessionId)
    setActiveTab('dashboard')
  }, [sessionId, loadSessionData, refreshSessions])

  const handleRefClick = async (ref) => {
    setSelectedRef(ref)
    const entry = await fetchAuditEntry(ref)
    setAuditDetail(entry)
    setActiveTab('audit')
    const log = await fetchAuditLog()
    setAuditLog(log.entries || [])
  }

  const handleNewSession = async () => {
    const name = prompt('Session name:')
    if (name) {
      await createSession(name)
      const sess = await refreshSessions()
      setSessions(sess)
    }
  }

  const handleDeleteSession = async (id) => {
    if (id === 'default') return
    if (confirm('Delete this session and all its data?')) {
      await deleteSession(id)
      const sess = await refreshSessions()
      setSessions(sess)
      if (sessionId === id) switchSession('default')
    }
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
    { id: 'data', label: 'Data', icon: '📋' },
    { id: 'variance', label: 'Variance Table', icon: '▤' },
    { id: 'anomalies', label: 'Anomalies', icon: '⚠' },
    { id: 'qa', label: 'Ask AI', icon: '◈' },
    { id: 'memo', label: 'Memo', icon: '✎' },
    { id: 'upload', label: 'Upload Data', icon: '↑' },
    { id: 'audit', label: 'Audit Trail', icon: '🔍' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ]

  // Show loading screen until initial data is loaded
  if (!sessionId || (!dataLoaded && loading)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin mb-3"></div>
          <p className="text-slate-500 text-sm">Loading FP&A Dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800/50 border-r border-slate-700 flex flex-col h-screen sticky top-0">
        <div className="px-5 py-5 border-b border-slate-700">
          <h1 className="text-lg font-semibold tracking-tight">FP&A Agent</h1>
          <p className="text-xs text-slate-500 mt-0.5">Dashboard v2.0</p>
        </div>

        <div className="px-3 py-3 border-b border-slate-700">
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Sessions</span>
            <button
              onClick={handleNewSession}
              className="text-slate-500 hover:text-emerald-400 text-sm"
              title="New session"
            >+</button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {sessions.map(s => (
              <div
                key={s.session_id}
                className={`flex items-center justify-between group rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                  sessionId === s.session_id
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:bg-slate-700/50'
                }`}
                onClick={() => switchSession(s.session_id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{s.session_name}</p>
                  <p className="text-xs text-slate-500">{s.row_count || 0} rows</p>
                </div>
                {s.session_id !== 'default' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.session_id) }}
                    className="text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 ml-2 text-xs"
                  >✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                activeTab === item.id
                  ? 'bg-slate-700 text-white translate-x-1'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 hover:translate-x-0.5'
              }`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-5 py-3 border-t border-slate-700">
          <p className="text-xs text-slate-600">
            Session: <span className="text-slate-400">{sessionId}</span>
          </p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <header className="border-b border-slate-700 bg-slate-800/30 px-6 py-3 flex items-center justify-between">
          <h2 className="text-sm text-slate-400">
            {navItems.find(n => n.id === activeTab)?.label || 'Dashboard'}
          </h2>
          {loading && (
            <span className="text-xs text-slate-500 flex items-center gap-2">
              <span className="inline-block w-3 h-3 border border-slate-600 border-t-emerald-400 rounded-full animate-spin"></span>
              Reloading...
            </span>
          )}
        </header>

        {/* Only render content when data is loaded — prevents glitchy partial renders */}
        <div key={`${activeTab}-${sessionId}`} className="p-6 reveal-animation">
          {activeTab === 'dashboard' && (
            variances.length > 0 ? (
              <div className="space-y-6">
                <KPICards summary={summary} onRefClick={handleRefClick} />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <VarianceChart variances={variances} onRefClick={handleRefClick} />
                  </div>
                  <AnomalyPanel anomalies={anomalies.slice(0, 10)} onRefClick={handleRefClick} />
                </div>
              </div>
            ) : (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
                <p className="text-slate-400 text-lg mb-2">No data in this session yet</p>
                <p className="text-slate-500 text-sm mb-6">
                  Upload your budget-vs-actuals CSV to populate the dashboard.
                </p>
                <button
                  onClick={() => setActiveTab('upload')}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  Go to Upload Data
                </button>
              </div>
            )
          )}

          {activeTab === 'data' && (
            <DataViewer sessionId={sessionId} />
          )}

          {activeTab === 'variance' && (
            <VarianceTable variances={variances} onRefClick={handleRefClick} />
          )}

          {activeTab === 'anomalies' && (
            <AnomalyPanel anomalies={anomalies} onRefClick={handleRefClick} fullPage />
          )}

          {activeTab === 'qa' && (
            <QAPanel onAsk={(q) => askQuestion(q, sessionId)} onRefClick={handleRefClick} />
          )}

          {activeTab === 'memo' && (
            <MemoViewer onGenerate={() => generateMemo(sessionId)} />
          )}

          {activeTab === 'upload' && (
            <UploadPanel
              onUpload={(file) => uploadData(file, sessionId)}
              onUploaded={handleUploadComplete}
            />
          )}

          {activeTab === 'audit' && (
            <AuditTrail
              log={auditLog}
              onRefresh={async () => {
                const log = await fetchAuditLog()
                setAuditLog(log.entries || [])
              }}
              selectedRef={selectedRef}
              auditDetail={auditDetail}
              onRefClick={handleRefClick}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPanel
              onSettingsChanged={() => {}}
              fetchSettings={fetchSettings}
              updateSettings={updateSettings}
              clearAuditLog={clearAuditLog}
            />
          )}
        </div>
      </main>
    </div>
  )
}
