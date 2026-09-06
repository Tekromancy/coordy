import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const words = searchParams.get('words');
  const userKey = searchParams.get('key');

  if (!words) {
    return NextResponse.json({ error: 'Missing 3 words parameter' }, { status: 400 });
  }

  // Clean words: accept "index.home.raft" or "///index.home.raft" or "index home raft"
  const cleaned = words
    .trim()
    .replace(/^[\/\s]+/, '')
    .split(/[\s.]+/)
    .filter(Boolean)
    .join('.');

  const apiKey = userKey || process.env.WHAT3WORDS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'API_KEY_REQUIRED',
        message: 'A what3words API key is required to convert 3 word addresses to coordinates.',
        cleanedWords: cleaned,
      },
      { status: 401 }
    );
  }

  try {
    const res = await fetch(
      `https://api.what3words.com/v2/convert-to-coordinates?words=${encodeURIComponent(cleaned)}&key=${apiKey}`
    );
    const data = await res.json();

    if (!res.ok || data.error) {
      return NextResponse.json(
        { error: data.error?.message || 'Failed to convert 3 words to coordinates' },
        { status: res.status || 400 }
      );
    }

    return NextResponse.json({
      lat: data.coordinates.lat,
      lon: data.coordinates.lng,
      words: data.words,
      country: data.country,
      nearestPlace: data.nearestPlace,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
