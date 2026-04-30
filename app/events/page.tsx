'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type Event = {
  id: string
  title: string
  description: string | null
  category: string
  location: string | null
  event_date: string
  organizer: string | null
}

const CATEGORIES = ['All', 'Workshop', 'Guest Lecture', 'Career Panel', 'Social', 'Other']

const CATEGORY_STYLES: Record<string, string> = {
  'Workshop':      'bg-blue-100 text-blue-700',
  'Guest Lecture': 'bg-purple-100 text-purple-700',
  'Career Panel':  'bg-amber-100 text-amber-700',
  'Social':        'bg-green-100 text-green-700',
  'Other':         'bg-slate-100 text-slate-600',
}

const SAMPLE_EVENTS = [
  { title: 'Design Thinking Workshop', description: 'Hands-on workshop exploring human-centered design methods with industry practitioners.', category: 'Workshop', location: 'GIX Studio, 3rd Floor', event_date: '2026-05-05T14:00:00Z', organizer: 'GIX Faculty' },
  { title: 'AI in Product Design — Guest Lecture', description: 'Senior designer from Microsoft shares how AI tools are reshaping the product design process.', category: 'Guest Lecture', location: 'GIX Auditorium', event_date: '2026-05-08T17:00:00Z', organizer: 'MSTI Program' },
  { title: 'Tech Career Panel: From School to Industry', description: 'Alumni from Amazon, Google, and startups discuss navigating early-career decisions in tech.', category: 'Career Panel', location: 'GIX Collaboration Space', event_date: '2026-05-12T18:00:00Z', organizer: 'GIX Career Services' },
  { title: 'Prototyping with Arduino', description: 'Learn to build interactive hardware prototypes using Arduino microcontrollers.', category: 'Workshop', location: 'Makerspace, 2nd Floor', event_date: '2026-05-14T13:00:00Z', organizer: 'Kevin (Makerspace)' },
  { title: 'End-of-Quarter Social', description: 'Celebrate finishing the quarter with food, drinks, and good company. All GIX students welcome.', category: 'Social', location: 'GIX Rooftop', event_date: '2026-05-16T17:30:00Z', organizer: 'Student Council' },
  { title: 'UX Research Methods — Guest Lecture', description: 'Lead UX researcher at Meta covers qualitative and quantitative research in fast-paced product teams.', category: 'Guest Lecture', location: 'GIX Auditorium', event_date: '2026-05-19T16:00:00Z', organizer: 'MSTI Program' },
  { title: 'Resume & Portfolio Review', description: 'Bring your resume and portfolio for live feedback from industry mentors.', category: 'Career Panel', location: 'GIX Collaboration Space', event_date: '2026-05-21T15:00:00Z', organizer: 'GIX Career Services' },
  { title: 'Figma Advanced Workshop', description: 'Deep dive into auto-layout, components, and design systems in Figma.', category: 'Workshop', location: 'GIX Studio, 3rd Floor', event_date: '2026-05-22T10:00:00Z', organizer: 'GIX Faculty' },
  { title: 'International Student Mixer', description: 'Informal social gathering for GIX international students and local students to connect.', category: 'Social', location: 'GIX Common Area', event_date: '2026-05-23T18:00:00Z', organizer: 'Student Council' },
]

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [filter, setFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => { fetchEvents() }, [])

  async function fetchEvents() {
    setLoading(true)
    setError(null)
    try {
      // Assert: supabase client must be initialised
      console.assert(supabase !== null, 'Supabase client must be initialised before fetching events')

      const { data, error: dbErr } = await supabase
        .from('events')
        .select('id, title, description, category, location, event_date, organizer')
        .order('event_date', { ascending: true })

      if (dbErr) throw dbErr

      // Assert: result must be an array with required fields
      console.assert(Array.isArray(data), 'Events query must return an array')
      if (data && data.length > 0) {
        console.assert('title' in data[0] && 'category' in data[0] && 'event_date' in data[0],
          'Each event must have title, category, and event_date fields')
      }

      setEvents(data || [])
    } catch (err) {
      setError('Failed to load events. Check your connection and try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadSampleEvents() {
    if (!confirm('Load sample events? This will add sample data to the events table.')) return
    setSeeding(true)
    setError(null)
    try {
      const { error: insertErr } = await supabase.from('events').insert(SAMPLE_EVENTS)
      if (insertErr) throw insertErr
      await fetchEvents()
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      setError('Failed to load sample events: ' + msg)
      console.error(err)
    } finally {
      setSeeding(false)
    }
  }

  const filtered = filter === 'All'
    ? events
    : events.filter(e => e.category === filter)

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 font-medium">← Equipment Return</Link>
        </div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">GIX Events</h1>
          <p className="text-slate-500 mt-2">Upcoming workshops, lectures, and panels — all in one place.</p>
        </div>

        {/* Load sample button */}
        {events.length === 0 && !loading && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 shadow-sm">
            <p className="font-semibold text-slate-700 mb-1">No events yet</p>
            <p className="text-sm text-slate-400 mb-4">Load sample events to see the interface in action.</p>
            <button
              onClick={loadSampleEvents}
              disabled={seeding}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {seeding ? 'Loading…' : '✦ Load sample events'}
            </button>
          </div>
        )}

        {events.length > 0 && (
          <div className="flex justify-end mb-4">
            <button
              onClick={loadSampleEvents}
              disabled={seeding}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              {seeding ? 'Adding…' : 'Add more sample data'}
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-5 text-sm">
            {error}
          </div>
        )}

        {/* Category filter */}
        {!loading && events.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  filter === cat
                    ? 'bg-slate-800 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Event list */}
        {loading ? (
          <p className="text-slate-400 text-center py-12 text-lg">Loading events…</p>
        ) : filtered.length === 0 && events.length > 0 ? (
          /* Error scenario 2: no events match the selected filter */
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-base">No {filter} events coming up.</p>
            <button onClick={() => setFilter('All')} className="mt-3 text-sm text-blue-600 hover:underline">
              View all events
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(event => (
              <div key={event.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h2 className="font-semibold text-slate-800 text-base leading-snug">{event.title}</h2>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${CATEGORY_STYLES[event.category] ?? 'bg-slate-100 text-slate-600'}`}>
                    {event.category}
                  </span>
                </div>
                {event.description && (
                  <p className="text-sm text-slate-500 mb-3 leading-relaxed">{event.description}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>🗓 {formatDate(event.event_date)}</span>
                  {event.location && <span>📍 {event.location}</span>}
                  {event.organizer && <span>👤 {event.organizer}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
