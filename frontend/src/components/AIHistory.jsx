import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || ''

function formatTimestamp(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}

export default function AIHistory({ sessionId, refreshKey }) {
  const [entries, setEntries] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/api/ai/history?session_id=${sessionId}`)
      .then(r => r.json())
      .then(d => setEntries(d.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [sessionId, refreshKey])

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="text-lg font-semibold mb-4">Past Interactions</h2>
        <div className="space-y-3 animate-pulse">
          {[1,2,3].map(i => (
            <div key={i} className="h-8 bg-slate-700 rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (entries.length === 0) return null

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <h2 className="text-lg font-semibold mb-4">
        Past Interactions ({entries.length})
      </h2>
      <div className="space-y-2">
        {entries.map((entry) => {
          const isExpanded = expanded === entry.id
          const typeBadge = entry.type === 'question'
            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
            : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
          const preview = entry.response_text?.slice(0, 120) || '(empty response)'

          return (
            <div key={entry.id} className="border border-slate-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(isExpanded ? null : entry.id)}
                className="w-full text-left px-4 py-3 hover:bg-slate-700/50 transition-colors flex items-start gap-3"
              >
                <span className="text-xs text-slate-500 whitespace-nowrap mt-0.5">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${typeBadge}`}>
                  {entry.type}
                </span>
                <span className="text-sm text-slate-300 truncate flex-1">
                  {preview}
                </span>
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-700 pt-3">
                  {entry.prompt && (
                    <div className="mb-3">
                      <span className="text-xs text-slate-500 block mb-1">Prompt</span>
                      <p className="text-sm text-slate-400 font-mono bg-slate-900 rounded p-3">
                        {entry.prompt}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-slate-500 block mb-1">Response</span>
                    <div className="text-sm text-slate-300 bg-slate-900 rounded p-3 whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {entry.response_text}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
