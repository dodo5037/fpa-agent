import { useState, useEffect, useCallback, useRef } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fetchSummary, fetchVariances, fetchAnomalies,
  askQuestion, generateMemo, uploadData,
  fetchSessions, createSession, deleteSession,
  fetchSettings, updateSettings,
} from './api'
import KPICard from './components/KPICard'
import VarianceTable from './components/VarianceTable'
import AnomalyPanel from './components/AnomalyPanel'
import VarianceChart from './components/VarianceChart'
import QAPanel from './components/QAPanel'
import MemoViewer from './components/MemoViewer'
import UploadPanel from './components/UploadPanel'
import SettingsPanel from './components/SettingsPanel'
import DataViewer from './components/DataViewer'
import DivergingBarChart from './components/DivergingBarChart'
import YTDComboChart from './components/YTDComboChart'
import VectorDeltaChart from './components/VectorDeltaChart'
import DashboardGrid from './components/DashboardGrid'
import TimeSeriesChart from './components/TimeSeriesChart'
import RegionalChart from './components/RegionalChart'
import SteppedAreaChart from './components/SteppedAreaChart'
import AuditTrail from './components/AuditTrail'
import AIHistory from './components/AIHistory'

const queryClient = new QueryClient()

const HIDDEN_BY_DEFAULT = new Set(['timeseries', 'regional', 'stepped-area'])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sessionId, setSessionId] = useState(null)
  const [sessions, setSessions] = useState([])

  const [summary, setSummary] = useState(null)
  const [variances, setVariances] = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [dataLoaded, setDataLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isRefetching, setIsRefetching] = useState(false)

  const dataHashRef = useRef(null)

  const [hiddenWidgets, setHiddenWidgets] = useState(() => new Set(HIDDEN_BY_DEFAULT))
  const [showAddMenu, setShowAddMenu] = useState(false)

  const handleAddWidget = useCallback((widgetId) => {
    setHiddenWidgets(prev => {
      const next = new Set(prev)
      next.delete(widgetId)
      return next
    })
    setShowAddMenu(false)
  }, [])

  const loadSessionData = useCallback(async (sid, isRefresh = false) => {
    if (!sid) return
    if (isRefresh) {
      setIsRefetching(true)
    } else {
      setLoading(true)
      setDataLoaded(false)
    }
    try {
      const [sum, vars, anoms] = await Promise.all([
        fetchSummary(sid),
        fetchVariances(sid),
        fetchAnomalies(sid),
      ])
      setSummary(sum)
      setVariances(vars.results || [])
      setAnomalies(anoms.results || [])
    } catch {
      if (!dataLoaded) {
        setSummary(null)
        setVariances([])
        setAnomalies([])
      }
    } finally {
      setDataLoaded(true)
      setLoading(false)
      setIsRefetching(false)
    }
  }, [dataLoaded])

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetchSessions()
      return res.sessions || []
    } catch { return [] }
  }, [])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const sess = await refreshSessions()
      if (cancelled) return
      setSessions(sess)
      let target = sess.find(s => s.row_count > 0)
      if (!target) target = sess.find(s => s.session_id === 'default') || sess[0]
      if (target) {
        setSessionId(target.session_id)
        await loadSessionData(target.session_id, false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!sessionId) return
    const poll = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/version`)
        const { data_hash } = await res.json()
        if (data_hash !== dataHashRef.current) {
          if (dataHashRef.current !== null) {
            await loadSessionData(sessionId, true)
          }
          dataHashRef.current = data_hash
        }
        const sess = await refreshSessions()
        setSessions(sess)
      } catch {}
    }
    const interval = setInterval(poll, 60000)
    return () => clearInterval(interval)
  }, [sessionId, loadSessionData, refreshSessions])

  const switchSession = useCallback((sid) => {
    if (sid === sessionId) return
    setSessionId(sid)
    dataHashRef.current = null
    loadSessionData(sid, false)
  }, [sessionId, loadSessionData])

  const handleUploadComplete = useCallback(async () => {
    dataHashRef.current = null
    const sess = await refreshSessions()
    setSessions(sess)
    await loadSessionData(sessionId, true)
    setActiveTab('dashboard')
  }, [sessionId, loadSessionData, refreshSessions])

  const handleRecalculate = useCallback(async () => {
    dataHashRef.current = null
    await loadSessionData(sessionId, true)
  }, [sessionId, loadSessionData])

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

  async function fetch(url) {
    const API = import.meta.env.VITE_API_URL || ''
    const r = await window.fetch(`${API}${url}`)
    return r
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
    { id: 'data', label: 'Data', icon: '📋' },
    { id: 'anomalies', label: 'Anomalies', icon: '⚠' },
    { id: 'qa', label: 'Ask AI', icon: '◈' },
    { id: 'audit', label: 'Audit Trail', icon: '🔍' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ]

  const widgets = [
    { id: 'kpi-revenue',    label: 'Revenue KPI',      render: () => (<KPICard label="Total Revenue (Actual)" value={summary?.total_revenue_actual} budget={summary?.total_revenue_budget} type="revenue" />) },
    { id: 'kpi-expense',    label: 'Expense KPI',      render: () => (<KPICard label="Total Expenses (Actual)" value={summary?.total_expense_actual} budget={summary?.total_expense_budget} type="expense" />) },
    { id: 'kpi-net',        label: 'Net Variance KPI', render: () => (<KPICard label="Net Variance" value={summary?.net_variance} type="net" />) },
    { id: 'variance-chart', label: 'Variance Chart',   render: () => (<VarianceChart variances={variances} />) },
    { id: 'anomalies',      label: 'Anomalies Panel',  render: () => (<AnomalyPanel anomalies={anomalies.slice(0, 10)} />) },
    { id: 'diverging',      label: 'Diverging Chart',  render: () => (<DivergingBarChart variances={variances} />) },
    { id: 'ytd-combo',      label: 'YTD Combo Chart',  render: () => (<YTDComboChart sessionId={sessionId} />) },
    { id: 'vector-delta',   label: 'Vector Delta',     render: () => (<VectorDeltaChart sessionId={sessionId} />) },
    { id: 'timeseries',     label: 'Time-Series',      render: () => (<TimeSeriesChart sessionId={sessionId} />) },
    { id: 'regional',       label: 'Regional Budget',  render: () => (<RegionalChart sessionId={sessionId} />) },
    { id: 'stepped-area',   label: 'Stepped Variance', render: () => (<SteppedAreaChart variances={variances} />) },
  ]

  const visibleWidgets = widgets.filter(w => !hiddenWidgets.has(w.id))
  const hiddenAvailable = widgets.filter(w => hiddenWidgets.has(w.id))

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
      <aside className="w-64 bg-slate-800/50 border-r border-slate-700 flex flex-col h-screen sticky top-0">
        <div className="px-5 py-5 border-b border-slate-700">
          <h1 className="text-lg font-semibold tracking-tight">FP&A Agent</h1>
          <p className="text-xs text-slate-500 mt-0.5">Dashboard v2.3</p>
        </div>
        <div className="px-3 py-3 border-b border-slate-700">
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Sessions</span>
            <button onClick={handleNewSession} className="text-slate-500 hover:text-emerald-400 text-sm" title="New session">+</button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {sessions.map(s => (
              <div key={s.session_id}
                className={`flex items-center justify-between group rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                  sessionId === s.session_id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}
                onClick={() => switchSession(s.session_id)}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{s.session_name}</p>
                  <p className="text-xs text-slate-500">{s.row_count || 0} rows</p>
                </div>
                {s.session_id !== 'default' && (
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.session_id) }}
                    className="text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 ml-2 text-xs">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                activeTab === item.id ? 'bg-slate-700 text-white translate-x-1' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 hover:translate-x-0.5'}`}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-3 border-t border-slate-700">
          <p className="text-xs text-slate-600">Session: <span className="text-slate-400">{sessionId}</span></p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="border-b border-slate-700 bg-slate-800/30 px-6 py-3 flex items-center justify-between">
          <h2 className="text-sm text-slate-400">{navItems.find(n => n.id === activeTab)?.label || 'Dashboard'}</h2>
          <div className="flex items-center gap-3">
            {activeTab === 'dashboard' && (
              <>
                <button onClick={handleRecalculate}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 border border-slate-600 hover:border-emerald-500/50 transition-all duration-200">
                  ↻ Recalculate
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowAddMenu(!showAddMenu)}
                    disabled={hiddenAvailable.length === 0}
                    className="text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-600 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed">
                    + Add Widget
                  </button>
                  {showAddMenu && hiddenAvailable.length > 0 && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-slate-700 border border-slate-600 rounded-lg shadow-xl py-1 z-50">
                      {hiddenAvailable.map(w => (
                        <button key={w.id} onClick={() => handleAddWidget(w.id)}
                          className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-600 hover:text-white transition-colors">
                          {w.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
            {isRefetching && (
              <span className="text-xs text-slate-500 flex items-center gap-2">
                <span className="inline-block w-3 h-3 border border-slate-600 border-t-emerald-400 rounded-full animate-spin"></span>
                Syncing...
              </span>
            )}
          </div>
        </header>

        <div key={`${activeTab}-${sessionId}`} className="p-6 reveal-animation">
          {activeTab === 'dashboard' && (
            variances.length > 0 ? (
              <DashboardGrid sessionId={sessionId}>
                {visibleWidgets.map(w => (
                  <div key={w.id}>
                    {w.render()}
                  </div>
                ))}
              </DashboardGrid>
            ) : (
              <DashboardEmptyState onGoToUpload={() => setActiveTab('data')} />
            )
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              <UploadPanel onUpload={(file) => uploadData(file, sessionId)} onUploaded={handleUploadComplete} />
              <DataViewer sessionId={sessionId} />
              <VarianceTable variances={variances} />
            </div>
          )}

          {activeTab === 'anomalies' && <AnomalyPanel anomalies={anomalies} fullPage />}

          {activeTab === 'qa' && (
            <div className="space-y-6">
              <QAPanel onAsk={(q) => askQuestion(q, sessionId)} />
              <MemoViewer onGenerate={() => generateMemo(sessionId)} />
              <AIHistory sessionId={sessionId} />
            </div>
          )}

          {activeTab === 'audit' && <AuditTrail sessionId={sessionId} />}

          {activeTab === 'settings' && (
            <SettingsPanel onSettingsChanged={() => {}} fetchSettings={fetchSettings}
              updateSettings={updateSettings} />)}
        </div>
      </main>
    </div>
  )
}

function DashboardEmptyState({ onGoToUpload }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
      <p className="text-slate-400 text-lg mb-2">No data in this session yet</p>
      <p className="text-slate-500 text-sm mb-6">Upload your budget-vs-actuals CSV to populate the dashboard.</p>
      <button onClick={onGoToUpload}
        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium transition-colors">
        Go to Data
      </button>
    </div>
  )
}
