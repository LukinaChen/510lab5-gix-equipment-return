'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type Status = 'pending' | 'returned' | 'missing'

type Item = {
  id: string
  name: string
  quantity: number
  status: Status
  notes: string | null
  returned_at: string | null
}

type Team = {
  id: string
  email: string
}

export default function TeamPage() {
  const params = useParams()
  const teamId = params.id as string

  const [team, setTeam] = useState<Team | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit item state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editQty, setEditQty] = useState(1)
  const [editNotes, setEditNotes] = useState('')

  // UPC lookup
  const [upcInput, setUpcInput] = useState('')
  const [upcResult, setUpcResult] = useState<{ title?: string; brand?: string; error?: string } | null>(null)
  const [upcLoading, setUpcLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: teamData, error: teamErr } = await supabase
        .from('teams').select('id, email').eq('id', teamId).single()
      if (teamErr) throw teamErr
      setTeam(teamData)

      const { data: itemsData, error: itemsErr } = await supabase
        .from('items').select('*').eq('team_id', teamId).order('created_at')
      if (itemsErr) throw itemsErr
      setItems(itemsData || [])
    } catch (err) {
      setError('Failed to load team data.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useEffect(() => { fetchData() }, [fetchData])

  async function updateStatus(itemId: string, status: Status) {
    const update = {
      status,
      returned_at: status === 'returned' ? new Date().toISOString() : null,
    }
    const { error: err } = await supabase.from('items').update(update).eq('id', itemId)
    if (err) { setError('Failed to update status.'); return }
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...update } : i))
  }

  function startEdit(item: Item) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditQty(item.quantity)
    setEditNotes(item.notes || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditQty(1)
    setEditNotes('')
  }

  async function saveEdit(itemId: string) {
    const name = editName.trim()
    if (!name) return
    const qty = Math.max(1, editQty)
    const { error: err } = await supabase
      .from('items')
      .update({ name, quantity: qty, notes: editNotes.trim() || null })
      .eq('id', itemId)
    if (err) { setError('Failed to save changes.'); return }
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, name, quantity: qty, notes: editNotes.trim() || null } : i
    ))
    cancelEdit()
  }

  async function lookupUPC() {
    const upc = upcInput.trim()
    if (!upc) return
    setUpcLoading(true)
    setUpcResult(null)
    try {
      const res = await fetch(`/api/upc?upc=${encodeURIComponent(upc)}`)
      const data = await res.json()
      if (!res.ok) setUpcResult({ error: data.error || 'Not found' })
      else setUpcResult({ title: data.title, brand: data.brand })
    } catch {
      setUpcResult({ error: 'Network error' })
    } finally {
      setUpcLoading(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 text-lg">Loading…</p>
    </div>
  )

  const returned = items.filter(i => i.status === 'returned').length
  const missing = items.filter(i => i.status === 'missing').length
  const pending = items.length - returned - missing
  const pct = items.length > 0 ? Math.round((returned / items.length) * 100) : 0

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 mb-6 text-sm font-medium">
          ← All teams
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 shadow-sm">
          <h1 className="text-xl font-bold text-slate-800 break-all mb-4">{team?.email}</h1>
          <div className="flex gap-4 text-base mb-4">
            <span className="text-emerald-600 font-semibold">✓ {returned} returned</span>
            {missing > 0 && <span className="text-red-500 font-semibold">✗ {missing} missing</span>}
            {pending > 0 && <span className="text-slate-400">{pending} pending</span>}
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-sm text-slate-400 mt-2">{pct}% complete</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* UPC Lookup */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 shadow-sm">
          <p className="font-semibold text-slate-700 mb-1">UPC Product Lookup</p>
          <p className="text-sm text-slate-400 mb-3">Scan or enter a barcode to verify a product name</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={upcInput}
              onChange={e => setUpcInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookupUPC()}
              placeholder="e.g. 012345678901"
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <button
              onClick={lookupUPC}
              disabled={upcLoading || !upcInput.trim()}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
            >
              {upcLoading ? '…' : 'Look up'}
            </button>
          </div>
          {upcResult && (
            <div className={`mt-3 p-3 rounded-xl text-sm ${upcResult.error ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-800'}`}>
              {upcResult.error ? upcResult.error : (
                <>
                  <p className="font-semibold">{upcResult.title}</p>
                  {upcResult.brand && <p className="text-xs opacity-70 mt-0.5">{upcResult.brand}</p>}
                </>
              )}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-2xl border shadow-sm transition-all ${
                item.status === 'returned' ? 'border-emerald-200 bg-emerald-50/40' :
                item.status === 'missing'  ? 'border-red-200 bg-red-50/40' :
                'border-slate-200'
              }`}
            >
              {editingId === item.id ? (
                /* ── Edit mode ── */
                <div className="p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Editing item</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-slate-600 mb-1 block">Item name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="w-28">
                        <label className="text-sm font-medium text-slate-600 mb-1 block">Quantity</label>
                        <input
                          type="number"
                          min={1}
                          value={editQty}
                          onChange={e => setEditQty(parseInt(e.target.value) || 1)}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-sm font-medium text-slate-600 mb-1 block">Notes (optional)</label>
                        <input
                          type="text"
                          value={editNotes}
                          onChange={e => setEditNotes(e.target.value)}
                          placeholder="e.g. missing lens cap"
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => saveEdit(item.id)}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-base leading-snug ${item.status === 'returned' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {item.name}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {item.quantity > 1 && (
                          <span className="text-sm text-slate-400">Qty: {item.quantity}</span>
                        )}
                        {item.notes && (
                          <span className="text-sm text-amber-600 italic">{item.notes}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Edit button */}
                      <button
                        onClick={() => startEdit(item)}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        title="Edit item"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>

                      {/* Status buttons */}
                      {item.status !== 'returned' && (
                        <button
                          onClick={() => updateStatus(item.id, 'returned')}
                          className="px-4 py-2 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-semibold hover:bg-emerald-200 active:scale-95 transition-all"
                        >
                          ✓ Returned
                        </button>
                      )}
                      {item.status !== 'missing' && (
                        <button
                          onClick={() => updateStatus(item.id, 'missing')}
                          className="px-4 py-2 rounded-xl bg-red-100 text-red-600 text-sm font-semibold hover:bg-red-200 active:scale-95 transition-all"
                        >
                          ✗ Missing
                        </button>
                      )}
                      {item.status !== 'pending' && (
                        <button
                          onClick={() => updateStatus(item.id, 'pending')}
                          className="px-4 py-2 rounded-xl bg-slate-100 text-slate-500 text-sm font-semibold hover:bg-slate-200 active:scale-95 transition-all"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
