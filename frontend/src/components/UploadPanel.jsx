import { useState } from 'react'

export default function UploadPanel({ onUpload, onUploaded }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = (f) => {
    setFile(f)
    setResult(null)
    setError(null)
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const res = await onUpload(file)
      setResult(res)
      await onUploaded()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="text-lg font-semibold mb-4">Upload Budget vs Actuals Data</h2>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
          }}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver ? 'border-emerald-400 bg-emerald-400/5' : 'border-slate-600'
          }`}
        >
          <p className="text-slate-400 text-sm mb-2">
            Drag & drop a CSV file here, or
          </p>
          <label className="cursor-pointer text-emerald-400 text-sm hover:text-emerald-300">
            click to browse
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
            />
          </label>
        </div>

        {file && (
          <div className="mt-4 flex items-center justify-between bg-slate-900 rounded p-3">
            <span className="text-sm text-slate-300">{file.name}</span>
            <button
              onClick={() => setFile(null)}
              className="text-xs text-slate-500 hover:text-rose-400"
            >
              Remove
            </button>
          </div>
        )}

        {file && (
          <button
            onClick={handleUpload}
            disabled={loading}
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white py-3 rounded-lg font-medium transition-colors"
          >
            {loading ? 'Uploading...' : 'Upload'}
          </button>
        )}

        {error && (
          <div className="mt-3 text-sm text-rose-400 bg-rose-400/10 rounded p-3">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-3 text-sm text-emerald-400 bg-emerald-400/10 rounded p-3">
            Successfully inserted {result.rows_inserted} rows from {result.filename}
          </div>
        )}

        <div className="mt-6 text-xs text-slate-500">
          <p className="mb-1">Required CSV columns:</p>
          <code className="text-slate-400">entity_id, account_id, period_id, scenario, amount</code>
          <p className="mt-2">Scenario must be "budget" or "actual". Amount must be a number.</p>
        </div>
      </div>
    </div>
  )
}
