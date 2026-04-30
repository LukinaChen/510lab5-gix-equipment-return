import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const upc = request.nextUrl.searchParams.get('upc')

  if (!upc || !/^\d{8,14}$/.test(upc)) {
    return NextResponse.json(
      { error: 'Invalid UPC. Must be 8–14 digits.' },
      { status: 400 }
    )
  }

  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`, {
      headers: { 'Accept': 'application/json' },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `UPC API returned ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()

    // Assert: response must be an object with an items array
    console.assert(typeof data === 'object' && data !== null, 'UPC API response must be an object')
    console.assert(Array.isArray(data.items), 'UPC API response must contain an items array')

    const item = data.items?.[0]

    if (!item) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Assert: item must have a title string (core contract)
    console.assert(typeof item.title === 'string', 'UPC item must have a string title')
    console.assert(item.title.length > 0, 'UPC item title must not be empty')

    return NextResponse.json({
      title: item.title ?? null,
      brand: item.brand ?? null,
      description: item.description ?? null,
    })
  } catch (err) {
    console.error('UPC lookup error:', err)
    return NextResponse.json({ error: 'Failed to reach UPC API' }, { status: 500 })
  }
}
