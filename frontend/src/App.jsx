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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sessionId, setSessionId] = useState('default')
  const [sessions, setSessions] = useState([])

  // Data state — cached per session
  const [summary, setSummary] = useState(null)
  const [variances, setVariances] = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [loading, setLoading] = useState(false)

  // Audit state
  const [auditLog, setAuditLog] = useState([])
  const [selectedRef, setSelectedRef] = useState(null)
  const [auditDetail, setAuditDetail] = useState(null)

  // Track which sessions we've loaded data for
  const loadedSessions = useRef(new Set())

  const loadSessionData = useCallback(async (sid) => {
    setLoading(true)
    try {
      const [sum, vars, anoms] = await Promise.all([
        fetchSummary(sid),
        fetchVariances(sid),
        fetchAnomalies(sid),
      ])
      setSummary(sum)
      setVariances(vars.results || [])
      setAnomalies(anoms.results || [])
      loadedSessions.current.add(sid)
    } catch {
      setSummary(null)
      setVariances([])
      setAnomalies([])
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshSessions = useCallback(async () => {
    const res = await fetchSessions()
    setSessions(res.sessions || [])
  }, [])

  // On mount: load sessions + initial data
  useEffect(() => {
    refreshSessions()
    loadSessionData('default')
  }, [refreshSessions, loadSessionData])

  // When session changes: only load if we haven't cached it
  const switchSession = useCallback((sid) => {
    setSessionId(sid)
    if (!loadedSessions.current.has(sid)) {
      loadSessionData(sid)
    }
    // If already loaded, data stays as-is (cached)
  }, [loadSessionData])

  const handleUploadComplete = useCallback(async () => {
    // After upload, reload data for the current session
    loadedSessions.current.delete(sessionId)
    await loadSessionData(sessionId)
    await refreshSessions()
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
      await refreshSessions()
    }
  }

  const handleDeleteSession = async (id) => {
    if (id === 'default') return
    if (confirm('Delete this session and all its data?')) {
      await deleteSession(id)
      await refreshSessions()
      if (sessionId === id) {
        switchSession('default')
      }
    }
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
    { id: 'variance', label: 'Variance Table', icon: '▤' },
    { id: 'anomalies', label: 'Anomalies', icon: '⚠' },
    { id: 'qa', label: 'Ask AI', icon: '◈' },
    { id: 'memo', label: 'Memo', icon: '✎' },
    { id: 'upload', label: 'Upload Data', icon: '↑' },
    { id: 'audit', label: 'Audit Trail', icon: '🔍' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ]

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800/50 border-r border-slate-700 flex flex-col h-screen sticky top-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-700">
          <h1 className="text-lg font-semibold tracking-tight">FP&A Agent</h1>
          <p className="text-xs text-slate-500 mt-0.5">Dashboard v2.0</p>
        </div>

        {/* Sessions Section */}
        <div className="px-3 py-3 border-b border-slate-700">
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Sessions</span>
            <button
              onClick={handleNewSession}
              className="text-slate-500 hover:text-emerald-400 text-sm"
              title="New session"
            >
              +
            </button>
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
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Navigation */}
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

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700">
          <p className="text-xs text-slate-600">
            Session: <span className="text-slate-400">{sessionId}</span>
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <header className="border-b border-slate-700 bg-slate-800/30 px-6 py-3 flex items-center justify-between">
          <h2 className="text-sm text-slate-400">
            {navItems.find(n => n.id === activeTab)?.label || 'Dashboard'}
          </h2>
          {loading && (
            <span className="text-xs text-slate-500 animate-pulse">Loading...</span>
          )}
        </header>

        {/* Content Area with transition */}
        <div key={activeTab} className="p-6 reveal-animation">
          {activeTab === 'dashboard' && (
            summary ? (
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
