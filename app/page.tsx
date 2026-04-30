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

const SAMPLE_DATA = [
  { email: 'teamalpha@uw.edu', items: [
    { name: 'Hollyland Lark M2 Wireless Microphone System', quantity: 1 },
    { name: 'Anker USB-C Hub 7-in-1', quantity: 2 },
    { name: 'HDMI Cable 6ft', quantity: 3 },
    { name: 'Logitech C920 HD Webcam', quantity: 1 },
  ]},
  { email: 'teambeta@uw.edu', items: [
    { name: 'Arduino Uno R3 Starter Kit', quantity: 1 },
    { name: 'Raspberry Pi 4 Model B 8GB', quantity: 1 },
    { name: 'Breadboard 830 Points', quantity: 2 },
    { name: 'USB-A to Micro USB Cable 3ft', quantity: 4 },
  ]},
  { email: 'teamgamma@uw.edu', items: [
    { name: 'GoPro HERO12 Black Action Camera', quantity: 1 },
    { name: 'SanDisk 128GB microSD Card', quantity: 2 },
    { name: 'Rode VideoMicro Compact Microphone', quantity: 1 },
  ]},
]

export default function Home() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [seeding, setSeeding] = useState(false)
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

  async function loadSampleData() {
    if (!confirm('Load sample data? This will replace all existing data.')) return
    setSeeding(true)
    setError(null)
    try {
      await supabase.from('items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('teams').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      for (const { email, items } of SAMPLE_DATA) {
        const { data: team, error: teamErr } = await supabase
          .from('teams').insert({ email }).select().single()
        if (teamErr) throw teamErr
        const { error: itemsErr } = await supabase.from('items').insert(
          items.map(i => ({ team_id: team.id, ...i, status: 'pending' }))
        )
        if (itemsErr) throw itemsErr
      }
      await fetchTeams()
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      setError('Failed to load sample data: ' + msg)
      console.error(err)
    } finally {
      setSeeding(false)
    }
  }

  const totalItems = teams.reduce((s, t) => s + t.item_count, 0)
  const totalReturned = teams.reduce((s, t) => s + t.returned_count, 0)
  const totalMissing = teams.reduce((s, t) => s + t.missing_count, 0)
  const progressPct = totalItems > 0 ? Math.round((totalReturned / totalItems) * 100) : 0

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">GIX Equipment Return</h1>
            <p className="text-slate-500 mt-2">Upload Dorothy&apos;s CSV or load sample data, then check off returns by team.</p>
          </div>
          <Link href="/events" className="flex-shrink-0 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors mt-1">
            📅 GIX Events
          </Link>
        </div>

        {/* Upload / Sample */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 shadow-sm">
          <p className="font-semibold text-slate-700 mb-1">Import data</p>
          <p className="text-sm text-slate-400 mb-4">CSV columns required: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">email</code>, <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">item_name</code>, <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">quantity</code></p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadSampleData}
              disabled={seeding || uploading}
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              {seeding ? 'Loading…' : '✦ Load sample data'}
            </button>
            <label className={`cursor-pointer px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${uploading ? 'bg-slate-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {uploading ? 'Uploading…' : '↑ Upload CSV'}
              <input type="file" accept=".csv" onChange={handleCSVUpload} disabled={uploading} className="hidden" />
            </label>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Overall progress */}
        {teams.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 shadow-sm">
            <div className="flex justify-between mb-3">
              <span className="font-semibold text-slate-700">Overall progress</span>
              <span className="text-slate-500 text-sm">
                <span className="font-bold text-slate-800">{totalReturned}</span>/{totalItems} returned
                {totalMissing > 0 && <span className="text-red-500 ml-2">· {totalMissing} missing</span>}
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${progressPct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-sm text-slate-400 mt-2">{progressPct}% · {teams.length} teams</p>
          </div>
        )}

        {/* Team list */}
        {loading ? (
          <p className="text-slate-400 text-center py-12 text-lg">Loading…</p>
        ) : teams.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p className="text-5xl mb-4">📦</p>
            <p className="text-base">No teams yet. Load sample data or upload a CSV.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {teams.map((team) => {
              const pct = team.item_count > 0 ? Math.round((team.returned_count / team.item_count) * 100) : 0
              const allDone = team.returned_count === team.item_count && team.item_count > 0

              return (
                <Link
                  key={team.id}
                  href={`/team/${team.id}`}
                  className="block bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <span className="font-semibold text-slate-800 truncate text-base">{team.email}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {team.missing_count > 0 && (
                        <span className="text-sm text-red-500 font-medium">{team.missing_count} missing</span>
                      )}
                      <span className={`text-sm px-3 py-1 rounded-full font-semibold ${allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {team.returned_count}/{team.item_count}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-500' : 'bg-blue-500'}`}
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
