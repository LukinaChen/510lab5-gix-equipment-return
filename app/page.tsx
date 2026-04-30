'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Papa from 'papaparse'
import Link from 'next/link'

type Team = {
  id: string
  email: string
  item_count: number
  returned_count: number
  missing_count: number
}

export default function Home() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTeams()
  }, [])

  async function fetchTeams() {
    setLoading(true)
    setError(null)
    try {
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, email')
        .order('email')

      if (teamsError) throw teamsError

      const teamsWithCounts = await Promise.all(
        (teamsData || []).map(async (team) => {
          const { data: items, error: itemsError } = await supabase
            .from('items')
            .select('status')
            .eq('team_id', team.id)

          if (itemsError) throw itemsError

          const all = items || []
          return {
            ...team,
            item_count: all.length,
            returned_count: all.filter(i => i.status === 'returned').length,
            missing_count: all.filter(i => i.status === 'missing').length,
          }
        })
      )

      setTeams(teamsWithCounts)
    } catch (err) {
      setError('Failed to load teams. Check Supabase connection.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!confirm('This will replace all existing data. Continue?')) {
      e.target.value = ''
      return
    }

    setUploading(true)
    setError(null)

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // Delete existing data (items first due to FK constraint)
          const { error: delItemsErr } = await supabase
            .from('items')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')
          if (delItemsErr) throw delItemsErr

          const { error: delTeamsErr } = await supabase
            .from('teams')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')
          if (delTeamsErr) throw delTeamsErr

          // Group rows by email
          const teamMap = new Map<string, { name: string; quantity: number }[]>()

          for (const row of results.data) {
            const email = (row['email'] || row['Email'] || '').trim().toLowerCase()
            const itemName = (row['item_name'] || row['Item Name'] || row['name'] || row['Name'] || '').trim()
            const quantity = Math.max(1, parseInt(row['quantity'] || row['Quantity'] || '1') || 1)

            if (!email || !itemName) continue
            if (!teamMap.has(email)) teamMap.set(email, [])
            teamMap.get(email)!.push({ name: itemName, quantity })
          }

          if (teamMap.size === 0) {
            throw new Error('No valid rows found. Check columns: email, item_name, quantity')
          }

          for (const [email, items] of teamMap) {
            const { data: team, error: teamError } = await supabase
              .from('teams')
              .insert({ email })
              .select()
              .single()

            if (teamError) throw teamError

            const { error: itemsError } = await supabase
              .from('items')
              .insert(items.map(item => ({
                team_id: team.id,
                name: item.name,
                quantity: item.quantity,
                status: 'pending',
              })))

            if (itemsError) throw itemsError
          }

          await fetchTeams()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed'
          setError(msg)
          console.error(err)
        } finally {
          setUploading(false)
        }
      },
      error: (err) => {
        setError('Failed to parse CSV: ' + err.message)
        setUploading(false)
      },
    })

    e.target.value = ''
  }

  const totalItems = teams.reduce((s, t) => s + t.item_count, 0)
  const totalReturned = teams.reduce((s, t) => s + t.returned_count, 0)
  const totalMissing = teams.reduce((s, t) => s + t.missing_count, 0)
  const progressPct = totalItems > 0 ? Math.round((totalReturned / totalItems) * 100) : 0

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">GIX Equipment Return</h1>
          <p className="text-sm text-gray-500 mt-1">Upload Dorothy&apos;s CSV, then check off returns by team.</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-gray-800 text-sm">Upload purchase list</p>
              <p className="text-xs text-gray-400 mt-0.5">Required columns: <code>email</code>, <code>item_name</code>, <code>quantity</code></p>
            </div>
            <label className={`flex-shrink-0 cursor-pointer px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${uploading ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {uploading ? 'Uploading…' : 'Choose CSV'}
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {teams.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Overall progress</span>
              <span className="font-medium text-gray-800">
                {totalReturned}/{totalItems} returned
                {totalMissing > 0 && <span className="text-red-500 ml-2">· {totalMissing} missing</span>}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{progressPct}% complete · {teams.length} teams</p>
          </div>
        )}

        {loading ? (
          <p className="text-gray-400 text-center py-12">Loading…</p>
        ) : teams.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm">No teams yet. Upload a CSV to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {teams.map((team) => {
              const pct = team.item_count > 0
                ? Math.round((team.returned_count / team.item_count) * 100)
                : 0
              const allDone = team.returned_count === team.item_count && team.item_count > 0

              return (
                <Link
                  key={team.id}
                  href={`/team/${team.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">{team.email}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {team.missing_count > 0 && (
                        <span className="text-xs text-red-500">{team.missing_count} missing</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${allDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {team.returned_count}/{team.item_count}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${allDone ? 'bg-green-500' : 'bg-blue-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
