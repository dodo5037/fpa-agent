import { useState } from 'react'

export default function MemoViewer({ onGenerate }) {
  const [memo, setMemo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await onGenerate()
      setMemo(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Variance Memo</h2>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Generating...' : 'Generate Memo'}
          </button>
        </div>

        {error && (
          <div className="text-sm text-rose-400 bg-rose-400/10 rounded p-3 mb-4">
            {error}
          </div>
        )}

        {memo && (
          <div className="space-y-4">
            {memo.calc_ref && (
              <div className="text-xs text-slate-500">
                Based on audit ref: {memo.calc_ref.slice(0, 16)}
              </div>
            )}
            <div className="bg-slate-900 rounded-lg p-5 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
              {memo.memo}
            </div>
          </div>
        )}

        {!memo && !loading && !error && (
          <p className="text-sm text-slate-500 py-8 text-center">
            Click "Generate Memo" to create an AI-powered summary of current variances.
            <br />
            <span className="text-xs">
              The LLM receives pre-computed numbers only — it never performs arithmetic.
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
