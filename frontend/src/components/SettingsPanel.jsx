import { useState, useEffect } from 'react'

export default function SettingsPanel({ fetchSettings, updateSettings, onSettingsChanged }) {
  const [settings, setSettings] = useState(null)
  const [ollamaUrl, setOllamaUrl] = useState('')
  const [ollamaModel, setOllamaModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchSettings().then(s => {
      setSettings(s)
      setOllamaUrl(s.ollama_base_url || '')
      setOllamaModel(s.ollama_model || '')
    })
  }, [fetchSettings])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    await updateSettings({
      ollama_base_url: ollamaUrl,
      ollama_model: ollamaModel,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (!settings) return <div className="text-slate-500">Loading settings...</div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="text-lg font-semibold mb-1">Ollama LLM Configuration</h2>
        <p className="text-sm text-slate-400 mb-4">
          Configure your local Ollama instance. Starts empty — enter your details.
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 block mb-1">Ollama Base URL</label>
            <input
              type="text"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Ollama Model</label>
            <input
              type="text"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="qwen2.5"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-400"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && (
            <span className="text-sm text-emerald-400 ml-3">✓ Saved</span>
          )}
        </div>
      </div>
    </div>
  )
}
