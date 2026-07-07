// api/sync-rugby.js
// Fetches Nations Championship results from Rugby Union API (Sportbex via RapidAPI)
// and saves scores + tries to Supabase rugby_results table

import { createClient } from '@supabase/supabase-js'

const TEAM_NAME_MAP = {
  'New Zealand': 'New Zealand', 'All Blacks': 'New Zealand',
  'South Africa': 'South Africa', 'Springboks': 'South Africa',
  'Australia': 'Australia', 'Wallabies': 'Australia',
  'Argentina': 'Argentina', 'Pumas': 'Argentina',
  'England': 'England', 'Ireland': 'Ireland',
  'Scotland': 'Scotland', 'Wales': 'Wales',
  'France': 'France', 'Italy': 'Italy',
  'Japan': 'Japan', 'Fiji': 'Fiji',
  'Japan Brave Blossoms': 'Japan', 'Flying Fijians': 'Fiji',
}

function normalise(name) {
  return TEAM_NAME_MAP[name] || name
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const rapidApiKey = process.env.RAPIDAPI_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!rapidApiKey || !supabaseUrl || !supabaseKey) {
    return res.status(200).json({ error: 'Missing env vars' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Fetch Nations Championship fixtures/results
    // Rugby Union API endpoint for matches
    const response = await fetch(
      'https://rugby-union-api.p.rapidapi.com/matches?league=nations-championship&season=2026',
      {
        headers: {
          'x-rapidapi-host': 'rugby-union-api.p.rapidapi.com',
          'x-rapidapi-key': rapidApiKey,
        },
      }
    )

    if (!response.ok) {
      const text = await response.text()
      return res.status(200).json({ error: `API error: ${text}`, synced: 0 })
    }

    const data = await response.json()
    const matches = Array.isArray(data) ? data : (data.matches || data.data || [])

    let synced = 0

    for (const match of matches) {
      // Only process finished matches
      if (match.status !== 'finished' && match.status !== 'FT' && match.status !== 'ended') continue

      const homeTeam = normalise(match.homeTeam?.name || match.home_team?.name || '')
      const awayTeam = normalise(match.awayTeam?.name || match.away_team?.name || '')
      const homeScore = match.homeScore?.current ?? match.home_score ?? match.score?.home
      const awayScore = match.awayScore?.current ?? match.away_score ?? match.score?.away
      const homeTries = match.homeScore?.tries ?? match.home_tries ?? null
      const awayTries = match.awayScore?.tries ?? match.away_tries ?? null

      if (!homeTeam || !awayTeam || homeScore == null || awayScore == null) continue

      const { error } = await supabase.from('rugby_results').upsert({
        match_key: `${homeTeam}|${awayTeam}`,
        home_team: homeTeam,
        away_team: awayTeam,
        home_score: parseInt(homeScore),
        away_score: parseInt(awayScore),
        home_tries: homeTries != null ? parseInt(homeTries) : null,
        away_tries: awayTries != null ? parseInt(awayTries) : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'match_key' })

      if (!error) synced++
    }

    return res.status(200).json({ synced, total: matches.length, timestamp: new Date().toISOString() })
  } catch (err) {
    return res.status(200).json({ error: err.message, synced: 0 })
  }
}
