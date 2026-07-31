import { useState, useEffect, useCallback } from 'react'
import { fetchSummary, fetchVariances, fetchAnomalies, fetchAuditLog, fetchAuditEntry, askQuestion, generateMemo, uploadData } from './api'
import KPICards from './components/KPICards'
import VarianceTable from './components/VarianceTable'
import AnomalyPanel from './components/AnomalyPanel'
import VarianceChart from './components/VarianceChart'
import QAPanel from './components/QAPanel'
import MemoViewer from './components/MemoViewer'
import AuditTrail from './components/AuditTrail'
import UploadPanel from './components/UploadPanel'

export default function App() {
  const [summary, setSummary] = useState(null)
  const [variances, setVariances] = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedRef, setSelectedRef] = useState(null)
  const [auditDetail, setAuditDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sum, vars, anoms] = await Promise.all([
        fetchSummary(),
        fetchVariances(),
        fetchAnomalies(),
      ])
      setSummary(sum)
      setVariances(vars.results || [])
      setAnomalies(anoms.results || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleRefClick = async (ref) => {
    setSelectedRef(ref)
    const entry = await fetchAuditEntry(ref)
    setAuditDetail(entry)
    setActiveTab('audit')
  }

  const handleAuditLogRefresh = async () => {
    const log = await fetchAuditLog()
    setAuditLog(log.entries || [])
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'variance', label: 'Variance Table' },
    { id: 'anomalies', label: 'Anomalies' },
    { id: 'qa', label: 'Ask AI' },
    { id: 'memo', label: 'Memo' },
    { id: 'upload', label: 'Upload Data' },
    { id: 'audit', label: 'Audit Trail' },
  ]

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            FP&A Agent Dashboard
          </h1>
          <button
            onClick={refresh}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600 transition-colors"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        {/* Tabs */}
        <nav className="mt-4 flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                if (tab.id === 'audit') handleAuditLogRefresh()
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-900/50 border border-rose-700 text-rose-200 px-6 py-3 text-sm">
          Error: {error}
        </div>
      )}

      {/* Content */}
      <main className="p-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {summary && <KPICards summary={summary} onRefClick={handleRefClick} />}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <VarianceChart variances={variances} onRefClick={handleRefClick} />
              </div>
              <div>
                <AnomalyPanel anomalies={anomalies.slice(0, 10)} onRefClick={handleRefClick} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'variance' && (
          <VarianceTable variances={variances} onRefClick={handleRefClick} />
        )}

        {activeTab === 'anomalies' && (
          <AnomalyPanel anomalies={anomalies} onRefClick={handleRefClick} fullPage />
        )}

        {activeTab === 'qa' && (
          <QAPanel onAsk={askQuestion} onRefClick={handleRefClick} />
        )}

        {activeTab === 'memo' && (
          <MemoViewer onGenerate={generateMemo} />
        )}

        {activeTab === 'upload' && (
          <UploadPanel onUpload={uploadData} onUploaded={refresh} />
        )}

        {activeTab === 'audit' && (
          <AuditTrail
            log={auditLog}
            onRefresh={handleAuditLogRefresh}
            selectedRef={selectedRef}
            auditDetail={auditDetail}
            onRefClick={handleRefClick}
          />
        )}
      </main>
    </div>
  )
}
