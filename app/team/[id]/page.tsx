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

const STATUS_STYLES: Record<Status, string> = {
  pending: 'border-gray-200 bg-white',
  returned: 'border-green-200 bg-green-50',
  missing: 'border-red-200 bg-red-50',
}

export default function TeamPage() {
  const params = useParams()
  const teamId = params.id as string

  const [team, setTeam] = useState<Team | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UPC lookup state
  const [upcInput, setUpcInput] = useState('')
  const [upcResult, setUpcResult] = useState<{ title?: string; brand?: string; error?: string } | null>(null)
  const [upcLoading, setUpcLoading] = useState(false)

  // Notes editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notesValue, setNotesValue] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: teamData, error: teamErr } = await supabase
        .from('teams')
        .select('id, email')
        .eq('id', teamId)
        .single()
      if (teamErr) throw teamErr
      setTeam(teamData)

      const { data: itemsData, error: itemsErr } = await supabase
        .from('items')
        .select('id, name, quantity, status, notes, returned_at')
        .eq('team_id', teamId)
        .order('created_at')
      if (itemsErr) throw itemsErr
      setItems(itemsData || [])
    } catch (err) {
      setError('Failed to load team. Check your connection.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function updateStatus(itemId: string, status: Status) {
    const update: Partial<Item> = { status }
    update.returned_at = status === 'returned' ? new Date().toISOString() : null

    const { error: updateErr } = await supabase
      .from('items')
      .update(update)
      .eq('id', itemId)

    if (updateErr) {
      setError('Failed to update item status.')
      return
    }

    setItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, ...update } : item
      )
    )

    if (status === 'missing' && editingId !== itemId) {
      setEditingId(itemId)
      setNotesValue('')
    }
  }

  async function saveNotes(itemId: string) {
    const { error: noteErr } = await supabase
      .from('items')
      .update({ notes: notesValue.trim() || null })
      .eq('id', itemId)

    if (noteErr) {
      setError('Failed to save note.')
      return
    }

    setItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, notes: notesValue.trim() || null } : item
      )
    )
    setEditingId(null)
    setNotesValue('')
  }

  async function lookupUPC() {
    const upc = upcInput.trim()
    if (!upc) return

    setUpcLoading(true)
    setUpcResult(null)

    try {
      const res = await fetch(`/api/upc?upc=${encodeURIComponent(upc)}`)
      const data = await res.json()

      if (!res.ok) {
        setUpcResult({ error: data.error || 'Lookup failed' })
      } else {
        setUpcResult({ title: data.title, brand: data.brand })
      }
    } catch {
      setUpcResult({ error: 'Network error — could not reach UPC service' })
    } finally {
      setUpcLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    )
  }

  const returned = items.filter(i => i.status === 'returned').length
  const missing = items.filter(i => i.status === 'missing').length
  const pending = items.length - returned - missing

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <Link href="/" className="text-sm text-blue-600 hover:text-blue-700 mb-3 inline-block">
            ← All teams
          </Link>
          <h1 className="text-lg font-bold text-gray-900 break-all">{team?.email}</h1>
          <div className="flex flex-wrap gap-3 mt-2 text-sm">
            <span className="text-green-600 font-medium">✓ {returned} returned</span>
            {missing > 0 && <span className="text-red-600 font-medium">✗ {missing} missing</span>}
            {pending > 0 && <span className="text-gray-400">{pending} pending</span>}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* UPC Lookup */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <p className="text-sm font-medium text-gray-800 mb-2">UPC Product Lookup</p>
          <p className="text-xs text-gray-400 mb-3">Scan or enter a barcode to verify a product name</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              value={upcInput}
              onChange={e => setUpcInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookupUPC()}
              placeholder="e.g. 012345678901"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 min-w-0"
            />
            <button
              onClick={lookupUPC}
              disabled={upcLoading || !upcInput.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex-shrink-0"
            >
              {upcLoading ? '…' : 'Look up'}
            </button>
          </div>
          {upcResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${upcResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
              {upcResult.error ? (
                upcResult.error
              ) : (
                <>
                  <p className="font-medium">{upcResult.title}</p>
                  {upcResult.brand && <p className="text-xs opacity-75 mt-0.5">{upcResult.brand}</p>}
                </>
              )}
            </div>
          )}
        </div>

        {/* Items checklist */}
        {items.length === 0 ? (
          <p className="text-gray-400 text-center py-8 text-sm">No items for this team.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-4 transition-all ${STATUS_STYLES[item.status]}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${item.status === 'returned' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                      {item.name}
                    </p>
                    {item.quantity > 1 && (
                      <p className="text-xs text-gray-400 mt-0.5">Qty: {item.quantity}</p>
                    )}
                    {item.notes && editingId !== item.id && (
                      <button
                        onClick={() => { setEditingId(item.id); setNotesValue(item.notes || '') }}
                        className="text-xs text-orange-600 mt-1 italic hover:underline text-left"
                      >
                        {item.notes}
                      </button>
                    )}
                    {editingId === item.id && (
                      <div className="mt-2 flex gap-2 items-center">
                        <input
                          type="text"
                          value={notesValue}
                          onChange={e => setNotesValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveNotes(item.id)}
                          placeholder="Add note (e.g. missing lens cap)"
                          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 min-w-0"
                          autoFocus
                        />
                        <button onClick={() => saveNotes(item.id)} className="text-xs text-blue-600 font-medium hover:text-blue-700 flex-shrink-0">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">Cancel</button>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {item.status !== 'returned' && (
                      <button
                        onClick={() => updateStatus(item.id, 'returned')}
                        className="px-3 py-2 text-xs font-medium rounded-lg bg-green-100 text-green-700 hover:bg-green-200 active:bg-green-300 transition-colors min-w-[80px] text-center"
                      >
                        ✓ Returned
                      </button>
                    )}
                    {item.status !== 'missing' && (
                      <button
                        onClick={() => updateStatus(item.id, 'missing')}
                        className="px-3 py-2 text-xs font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 active:bg-red-300 transition-colors min-w-[80px] text-center"
                      >
                        ✗ Missing
                      </button>
                    )}
                    {item.status !== 'pending' && (
                      <button
                        onClick={() => updateStatus(item.id, 'pending')}
                        className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors min-w-[80px] text-center"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
