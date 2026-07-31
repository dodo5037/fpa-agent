import { useState } from 'react'

export default function QAPanel({ onAsk, onRefClick }) {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!question.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await onAsk(question)
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="text-lg font-semibold mb-4">Ask a Question</h2>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What is the total revenue for North Division?"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            {loading ? 'Asking...' : 'Ask'}
          </button>
        </form>
        {error && (
          <div className="mt-3 text-sm text-rose-400 bg-rose-400/10 rounded p-3">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-4">
          {/* SQL Display */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-400">Generated SQL</h3>
              <button
                onClick={() => onRefClick(result.calc_ref)}
                className="text-xs text-slate-500 hover:text-slate-300 underline"
              >
                Audit: {result.calc_ref?.slice(0, 16)}
              </button>
            </div>
            <pre className="bg-slate-900 rounded p-3 text-xs text-emerald-400 overflow-x-auto font-mono-fin">
              {result.sql}
            </pre>
          </div>

          {/* Results Table */}
          {result.results && result.results.length > 0 && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-700">
                <h3 className="text-sm font-semibold text-slate-400">
                  Results ({result.results.length} rows)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800">
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      {Object.keys(result.results[0]).map(col => (
                        <th key={col} className="px-4 py-2 font-medium">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.slice(0, 100).map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-4 py-2 font-mono-fin text-slate-300">
                            {typeof val === 'number' ? val.toLocaleString() : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
