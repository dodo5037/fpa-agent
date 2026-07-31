import { useState, useEffect } from 'react'
import { fetchSessionData, clearSessionData } from '../api'

function formatCurrency(val) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

export default function DataViewer({ sessionId }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState(null)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(null)

  const loadData = async () => {
    setLoading(true)
    const res = await fetchSessionData(sessionId)
    setData(res.results || [])
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

  if (loading) return <div className="text-slate-500">Loading data...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Session Data</h2>
          <p className="text-sm text-slate-400">{data.length} rows in session "{sessionId}"</p>
        </div>
        {data.length > 0 && (
          <button
            onClick={handleClear}
            disabled={clearing}
            className="text-xs text-rose-400 hover:text-rose-300 bg-rose-400/10 px-3 py-1.5 rounded"
          >
            {clearing ? 'Clearing...' : 'Clear All Data'}
          </button>
        )}
      </div>

      {cleared != null && (
        <div className="text-sm text-emerald-400 bg-emerald-400/10 rounded p-2">
          Deleted {cleared} rows.
        </div>
      )}

      {data.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <p className="text-slate-400">No data in this session</p>
          <p className="text-slate-500 text-sm mt-1">Upload a CSV to get started.</p>
        </div>
      ) : (
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

      {/* Expand Bubble Overlay */}
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
              >
                ✕
              </button>
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
