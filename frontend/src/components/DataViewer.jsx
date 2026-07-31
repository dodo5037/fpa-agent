import { useState, useEffect } from 'react'
import { fetchSessionData, clearSessionData } from '../api'

function formatCurrency(val) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

export default function DataViewer({ sessionId }) {
  const [data, setData] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState(null)
  const [view, setView] = useState('files') // 'files' or 'table'
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(null)

  const loadData = async () => {
    setLoading(true)
    const res = await fetchSessionData(sessionId)
    setData(res.results || [])
    setFiles(res.files || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [sessionId])

  const handleClear = async () => {
    if (!confirm('Clear all data in this session? This cannot be undone.')) return
    setClearing(true)
    const res = await clearSessionData(sessionId)
    setCleared(res.deleted)
    setClearing(false)
    await loadData()
    setTimeout(() => setCleared(null), 3000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block w-6 h-6 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin"></div>
        <p className="text-slate-500 text-sm ml-3">Loading data...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Session Data</h2>
          <p className="text-sm text-slate-400">{data.length} rows in session "{sessionId}"</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setView('files')}
              className={`text-xs px-3 py-1.5 rounded transition-colors ${
                view === 'files' ? 'bg-slate-700 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >📁 Files</button>
            <button
              onClick={() => setView('table')}
              className={`text-xs px-3 py-1.5 rounded transition-colors ${
                view === 'table' ? 'bg-slate-700 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >📊 Table</button>
          </div>
          {data.length > 0 && (
            <button
              onClick={handleClear}
              disabled={clearing}
              className="text-xs text-rose-400 hover:text-rose-300 bg-rose-400/10 px-3 py-1.5 rounded"
            >
              {clearing ? 'Clearing...' : 'Clear All'}
            </button>
          )}
        </div>
      </div>

      {cleared != null && (
        <div className="text-sm text-emerald-400 bg-emerald-400/10 rounded p-2">
          Deleted {cleared} rows.
        </div>
      )}

      {data.length === 0 && files.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <p className="text-slate-400">No data in this session</p>
          <p className="text-slate-500 text-sm mt-1">Upload a CSV to get started.</p>
        </div>
      ) : view === 'files' ? (
        /* ── Files View ── */
        <div className="space-y-3">
          {files.length === 0 ? (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
              <p className="text-slate-500 text-sm">No files uploaded in this session</p>
            </div>
          ) : (
            files.map((f, i) => (
              <div
                key={i}
                className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex items-center justify-between hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center text-lg">
                    📄
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{f.filename}</p>
                    <p className="text-xs text-slate-500">
                      {f.row_count} rows • uploaded {f.uploaded_at}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setView('table')}
                  className="text-xs text-slate-400 hover:text-emerald-400 bg-slate-700/50 px-3 py-1.5 rounded"
                >
                  View Data →
                </button>
              </div>
            ))
          )}
          {/* Summary card */}
          {data.length > 0 && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <p className="text-xs text-slate-400 mb-2">Quick Summary</p>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Total Rows</p>
                  <p className="font-mono-fin text-lg text-slate-200">{data.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Files</p>
                  <p className="font-mono-fin text-lg text-slate-200">{files.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Entities</p>
                  <p className="font-mono-fin text-lg text-slate-200">
                    {new Set(data.map(d => d.entity_id)).size}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Accounts</p>
                  <p className="font-mono-fin text-lg text-slate-200">
                    {new Set(data.map(d => d.account_id)).size}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Table View ── */
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 sticky top-0">
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Account ID</th>
                  <th className="px-4 py-3 font-medium">Account Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Scenario</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium text-center">⊕</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-slate-300">{row.entity_id}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono-fin">{row.account_id}</td>
                    <td className="px-4 py-3 text-slate-200">{row.account_name || row.account_id}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        row.account_type === 'revenue'
                          ? 'bg-emerald-400/10 text-emerald-400'
                          : 'bg-rose-400/10 text-rose-400'
                      }`}>
                        {row.account_type || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono-fin">{row.period_id}</td>
                    <td className="px-4 py-3 text-slate-400 capitalize">{row.scenario}</td>
                    <td className="px-4 py-3 text-right font-mono-fin text-slate-300">
                      ${formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                        className="text-slate-500 hover:text-emerald-400 text-sm"
                        title="Expand"
                      >
                        {expandedRow === i ? '⊖' : '⊕'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expand Bubble */}
      {expandedRow !== null && data[expandedRow] && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 reveal-animation"
          onClick={() => setExpandedRow(null)}
        >
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
          <div
            className="relative bg-slate-800/80 backdrop-blur-md border border-slate-600/50 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">Row Details</h3>
              <button
                onClick={() => setExpandedRow(null)}
                className="text-slate-500 hover:text-slate-300 text-lg"
              >✕</button>
            </div>
            <div className="space-y-3">
              {Object.entries(data[expandedRow]).map(([key, val]) => (
                <div key={key} className="flex justify-between items-center py-1 border-b border-slate-700/30">
                  <span className="text-sm text-slate-400">{key.replace(/_/g, ' ')}</span>
                  <span className={`text-sm font-mono-fin ${
                    key === 'amount' ? 'text-emerald-400' :
                    key === 'account_type' ? (val === 'revenue' ? 'text-emerald-400' : 'text-rose-400') :
                    'text-slate-200'
                  }`}>
                    {key === 'amount' ? `$${formatCurrency(val)}` : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
