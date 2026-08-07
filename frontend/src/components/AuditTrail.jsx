import { useState, useEffect, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || ''

const CATEGORY_BADGES = {
  DATA_INGESTION: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  SYSTEM_CALCULATION: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  ANOMALY_DETECTION: 'bg-red-500/20 text-red-400 border-red-500/30',
  DATA_DELETION: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'DATA_INGESTION', label: 'Data Ingestion' },
  { value: 'ANOMALY_DETECTION', label: 'Anomaly Detection' },
  { value: 'DATA_DELETION', label: 'Data Deletion' },
  { value: 'SYSTEM_CALCULATION', label: 'System Calculation' },
]

function formatTimestamp(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

export default function AuditTrail({ sessionId }) {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const debounceRef = useRef(null)

  const fetchTrail = async (params = {}) => {
    setLoading(true)
    const qs = new URLSearchParams({
      session_id: sessionId,
      limit: '50', offset: '0',
      ...params,
    })
    if (search) qs.set('search', search)
    if (category) qs.set('category', category)
    try {
      const r = await fetch(`${API}/api/audit/trail?${qs}`)
      const d = await r.json()
      setEntries(d.entries || [])
      setTotal(d.count || 0)
    } catch {
      setEntries([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrail()
  }, [sessionId])

  const handleSearchChange = (value) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchTrail(), 300)
  }

  const handleCategoryChange = (value) => {
    setCategory(value)
    fetchTrail()
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search audit logs..."
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
        />
        <select
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-400"
        >
          {CATEGORY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Audit Trail</h2>
          <span className="text-sm text-slate-400">{total} event{total !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-4 bg-slate-700 rounded" style={{ width: `${85 - i*5}%` }} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p className="text-lg mb-1">No audit events yet</p>
            <p className="text-sm">Upload data to generate your first audit entry.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 sticky top-0">
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="px-4 py-3 font-medium">Date &amp; Time</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-center">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.log_id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-slate-400 font-mono-fin text-xs whitespace-nowrap">
                      {formatTimestamp(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${CATEGORY_BADGES[entry.event_category] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                        {entry.event_category?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{entry.description}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setExpanded(expanded === entry.log_id ? null : entry.log_id)}
                        className="text-xs text-slate-500 hover:text-emerald-400 underline"
                      >
                        {expanded === entry.log_id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Metadata expander */}
      {expanded && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h3 className="text-sm font-semibold mb-2 text-slate-300">
            Event Metadata — {entries.find(e => e.log_id === expanded)?.log_id?.slice(0, 8)}
          </h3>
          <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono bg-slate-900 rounded-lg p-4 overflow-x-auto">
            {JSON.stringify(
              entries.find(e => e.log_id === expanded)?.metadata || {},
              null, 2
            )}
          </pre>
        </div>
      )}
    </div>
  )
}
