// Rugby Nations Championship 2026
// Rounds 2-6 plus Finals Weekend

export const PLAYERS = ["Jez", "Stu", "Olly"]

export const TOURNAMENT = {
  name: "Rugby Nations Championship 2026",
  dates: "July 11 – November 29, 2026",
}

export const WEEK_LABELS = {
  1: "Round 2 · 11 Jul",
  2: "Round 3 · 18 Jul",
  3: "Round 4 · 6-8 Nov",
  4: "Round 5 · 13-15 Nov",
  5: "Round 6 · 21 Nov",
  6: "Finals · 27-29 Nov",
}

export const MATCHES = [
  // WEEK 1 — Round 2, 11 July
  { id: "r2m1", week: 1, date: "2026-07-11", home: "New Zealand", away: "Italy" },
  { id: "r2m2", week: 1, date: "2026-07-11", home: "Australia", away: "France" },
  { id: "r2m3", week: 1, date: "2026-07-11", home: "Japan", away: "Ireland" },
  { id: "r2m4", week: 1, date: "2026-07-11", home: "Fiji", away: "England" },
  { id: "r2m5", week: 1, date: "2026-07-11", home: "South Africa", away: "Scotland" },
  { id: "r2m6", week: 1, date: "2026-07-11", home: "Argentina", away: "Wales" },
  // WEEK 2 — Round 3, 18 July
  { id: "r3m1", week: 2, date: "2026-07-18", home: "New Zealand", away: "Ireland" },
  { id: "r3m2", week: 2, date: "2026-07-18", home: "Japan", away: "France" },
  { id: "r3m3", week: 2, date: "2026-07-18", home: "Australia", away: "Italy" },
  { id: "r3m4", week: 2, date: "2026-07-18", home: "Fiji", away: "Scotland" },
  { id: "r3m5", week: 2, date: "2026-07-18", home: "South Africa", away: "Wales" },
  { id: "r3m6", week: 2, date: "2026-07-18", home: "Argentina", away: "England" },
  // WEEK 3 — Round 4, 6-8 November
  { id: "r4m1", week: 3, date: "2026-11-06", home: "Ireland", away: "Argentina" },
  { id: "r4m2", week: 3, date: "2026-11-07", home: "Italy", away: "South Africa" },
  { id: "r4m3", week: 3, date: "2026-11-07", home: "Scotland", away: "New Zealand" },
  { id: "r4m4", week: 3, date: "2026-11-07", home: "Wales", away: "Japan" },
  { id: "r4m5", week: 3, date: "2026-11-07", home: "France", away: "Fiji" },
  { id: "r4m6", week: 3, date: "2026-11-08", home: "England", away: "Australia" },
  // WEEK 4 — Round 5, 13-15 November
  { id: "r5m1", week: 4, date: "2026-11-13", home: "France", away: "South Africa" },
  { id: "r5m2", week: 4, date: "2026-11-14", home: "Italy", away: "Argentina" },
  { id: "r5m3", week: 4, date: "2026-11-14", home: "Wales", away: "New Zealand" },
  { id: "r5m4", week: 4, date: "2026-11-14", home: "Ireland", away: "Fiji" },
  { id: "r5m5", week: 4, date: "2026-11-14", home: "Scotland", away: "Australia" },
  { id: "r5m6", week: 4, date: "2026-11-15", home: "England", away: "Japan" },
  // WEEK 5 — Round 6, 21 November
  { id: "r6m1", week: 5, date: "2026-11-21", home: "Scotland", away: "Japan" },
  { id: "r6m2", week: 5, date: "2026-11-21", home: "England", away: "New Zealand" },
  { id: "r6m3", week: 5, date: "2026-11-21", home: "Ireland", away: "South Africa" },
  { id: "r6m4", week: 5, date: "2026-11-21", home: "Italy", away: "Fiji" },
  { id: "r6m5", week: 5, date: "2026-11-21", home: "Wales", away: "Australia" },
  { id: "r6m6", week: 5, date: "2026-11-21", home: "France", away: "Argentina" },
  // WEEK 6 — Finals Weekend, 27-29 November (fixtures TBC based on standings)
  { id: "fm1", week: 6, date: "2026-11-27", home: "TBD", away: "TBD", label: "N6th vs S6th" },
  { id: "fm2", week: 6, date: "2026-11-27", home: "TBD", away: "TBD", label: "N5th vs S5th" },
  { id: "fm3", week: 6, date: "2026-11-28", home: "TBD", away: "TBD", label: "N4th vs S4th" },
  { id: "fm4", week: 6, date: "2026-11-28", home: "TBD", away: "TBD", label: "N3rd vs S3rd" },
  { id: "fm5", week: 6, date: "2026-11-29", home: "TBD", away: "TBD", label: "N2nd vs S2nd" },
  { id: "fm6", week: 6, date: "2026-11-29", home: "TBD", away: "TBD", label: "🏆 Grand Final" },
]

// ─── SCORING ─────────────────────────────────────────────────────────────────
// pred: { homeScore, awayScore, homeTries, awayTries }
// actual: { homeScore, awayScore, homeTries, awayTries }

export function scorePoints(pred, actual) {
  if (!pred || !actual) return 0
  const ph = parseInt(pred.homeScore), pa = parseInt(pred.awayScore)
  const ah = parseInt(actual.homeScore), aa = parseInt(actual.awayScore)
  const pht = parseInt(pred.homeTries), pat = parseInt(pred.awayTries)
  const aht = parseInt(actual.homeTries), aat = parseInt(actual.awayTries)

  if (isNaN(ph) || isNaN(pa) || isNaN(ah) || isNaN(aa)) return 0

  let pts = 0

  // Correct result (win/loss/draw) — 10pts
  const predResult = ph > pa ? "H" : pa > ph ? "A" : "D"
  const actualResult = ah > aa ? "H" : aa > ah ? "A" : "D"
  if (predResult === actualResult) pts += 10

  // Home team score — exact 5pts, within 1-3 = 2pts, within 4-7 = 1pt
  const homeDiff = Math.abs(ph - ah)
  if (homeDiff === 0) pts += 5
  else if (homeDiff <= 3) pts += 2
  else if (homeDiff <= 7) pts += 1

  // Away team score — exact 5pts, within 1-3 = 2pts, within 4-7 = 1pt
  const awayDiff = Math.abs(pa - aa)
  if (awayDiff === 0) pts += 5
  else if (awayDiff <= 3) pts += 2
  else if (awayDiff <= 7) pts += 1

  // Tries — 2pts per team for exact tries
  const triesAvailable = !isNaN(pht) && !isNaN(pat) && !isNaN(aht) && !isNaN(aat)
  if (triesAvailable) {
    if (pht === aht) pts += 2  // exact home tries
    if (pat === aat) pts += 2  // exact away tries
  }

  // Exact score both teams + exact tries both teams = 25pts total
  // 10 (result) + 5 (home exact) + 5 (away exact) + 2 (home tries) + 2 (away tries) = 24
  // Add 1 bonus to reach 25
  if (ph === ah && pa === aa && triesAvailable && pht === aht && pat === aat) {
    pts += 1
  }

  return pts
}

export function isPredictionOpen(matchDate) {
  // Lock at 6am BST (5am UTC) on match day
  const lockTime = new Date(matchDate + "T05:00:00Z")
  return new Date() < lockTime
}

export function isDeadlineSoon(matchDate) {
  const lockTime = new Date(matchDate + "T05:00:00Z")
  const now = new Date()
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  return now < lockTime && lockTime <= sevenDays
}

export function getResult(h, a) {
  if (h > a) return "H"
  if (a > h) return "A"
  return "D"
}

export const FLAG_MAP = {
  "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Ireland": "🇮🇪", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "France": "🇫🇷", "Italy": "🇮🇹",
  "New Zealand": "🇳🇿", "Australia": "🇦🇺", "South Africa": "🇿🇦",
  "Argentina": "🇦🇷", "Japan": "🇯🇵", "Fiji": "🇫🇯",
}

export function flag(name) { return FLAG_MAP[name] || "🏉" }
