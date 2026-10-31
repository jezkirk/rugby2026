import { useState, useEffect, useRef } from "react"
import { supabase } from "./supabase"
import {
  PLAYERS, MATCHES, WEEK_LABELS, TOURNAMENT,
  scorePoints, isPredictionOpen, isDeadlineSoon, flag, FLAG_MAP
} from "./data"

// ─── ESPN LIVE SYNC ───────────────────────────────────────────────────────────
const ESPN_LEAGUE = 17567 // Nations Championship
const ESPN_URL = `https://site.api.espn.com/apis/site/v2/sports/rugby/${ESPN_LEAGUE}/scoreboard`

const ESPN_NAME_MAP = {
  "New Zealand": "New Zealand", "All Blacks": "New Zealand",
  "Australia": "Australia", "Wallabies": "Australia",
  "South Africa": "South Africa", "Springboks": "South Africa",
  "Argentina": "Argentina", "Pumas": "Argentina",
  "Japan": "Japan", "Brave Blossoms": "Japan",
  "Fiji": "Fiji", "Flying Fijians": "Fiji",
  "England": "England", "Ireland": "Ireland",
  "Scotland": "Scotland", "Wales": "Wales",
  "France": "France", "Italy": "Italy",
}

function normTeam(t) {
  if (!t) return t
  return ESPN_NAME_MAP[t] || t
}

// Parse ESPN scoring plays → try scorer lists
function countTries(competition, homeId, awayId) {
  const plays = competition?.details || competition?.scoringPlays || competition?.plays || []
  let homeCount = 0, awayCount = 0
  const homeScorers = [], awayScorers = []

  for (let i = 0; i < plays.length; i++) {
    const p = plays[i]
    const typeText = (p.type?.text || p.scoringType?.displayName || "").toLowerCase()
    if (!typeText.includes("try") && !typeText.includes("penalty try")) continue

    const isPenaltyTry = typeText.includes("penalty try")
    const teamId = String(p.team?.id || "")
    const isHome = teamId === String(homeId)
    const isAway = teamId === String(awayId)
    if (!isHome && !isAway) continue

    const athleteName = isPenaltyTry
      ? "Penalty Try"
      : (p.athletes?.[0]?.athlete?.displayName || p.athlete?.displayName || "Unknown")
    const min = p.clock?.displayValue || p.period?.displayValue || ""

    let conv = false
    for (let j = i + 1; j < Math.min(i + 3, plays.length); j++) {
      const np = plays[j]
      const nt = (np.type?.text || np.scoringType?.displayName || "").toLowerCase()
      const nTeam = String(np.team?.id || "")
      if ((nt.includes("conver") || nt.includes("conversion")) && nTeam === teamId) { conv = true; break }
      if (nt.includes("try") || nt.includes("drop") || nt.includes("penalty goal")) break
    }

    const scorer = { name: athleteName, min, conv }
    if (isHome) { homeCount++; homeScorers.push(scorer) }
    else { awayCount++; awayScorers.push(scorer) }
  }
  return { homeCount, awayCount, homeScorers, awayScorers }
}

// Pull ESPN scoreboard and update results state + Supabase
async function syncFromEspn(setResults) {
  try {
    const r = await fetch(ESPN_URL)
    if (!r.ok) return false
    const data = await r.json()
    const events = data.events || []
    if (!events.length) return false

    let changed = false
    for (const ev of events) {
      const comp = ev.competitions?.[0]
      if (!comp) continue
      const homeComp = comp.competitors?.find(c => c.homeAway === "home")
      const awayComp = comp.competitors?.find(c => c.homeAway === "away")
      if (!homeComp || !awayComp) continue

      const homeTeam = normTeam(homeComp.team?.displayName || homeComp.team?.name)
      const awayTeam = normTeam(awayComp.team?.displayName || awayComp.team?.name)
      const match = MATCHES.find(m => normTeam(m.home) === homeTeam && normTeam(m.away) === awayTeam)
      if (!match) continue

      const status = comp.status?.type?.name || ""
      const completed = comp.status?.type?.completed || false
      const inProgress = status === "STATUS_IN_PROGRESS" || status === "STATUS_HALFTIME"
      if (!inProgress && !completed) continue

      const homeScore = parseInt(homeComp.score) || 0
      const awayScore = parseInt(awayComp.score) || 0
      const homeId = homeComp.team?.id
      const awayId = awayComp.team?.id
      const { homeCount, awayCount, homeScorers, awayScorers } = countTries(comp, homeId, awayId)

      await supabase.from("rugby_results").upsert({
        match_key: `${match.home}|${match.away}`,
        home_team: match.home,
        away_team: match.away,
        home_score: homeScore,
        away_score: awayScore,
        home_tries: homeCount,
        away_tries: awayCount,
        home_scorers: homeScorers.length ? homeScorers : null,
        away_scorers: awayScorers.length ? awayScorers : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "match_key" })

      setResults(prev => ({
        ...prev,
        [`${match.home}|${match.away}`]: {
          homeScore, awayScore,
          homeTries: homeCount, awayTries: awayCount,
          homeScorers, awayScorers,
        }
      }))
      changed = true
    }
    return changed
  } catch { return false }
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  root: { minHeight: "100vh", background: "#07080f", color: "#e2e8f0", fontFamily: "'Outfit', sans-serif", maxWidth: 600, margin: "0 auto", paddingBottom: 40 },
  hero: { background: "linear-gradient(135deg, #0f1624 0%, #1a0a2e 50%, #0a1a0a 100%)", padding: "32px 24px 28px", textAlign: "center", borderBottom: "1px solid #1e293b" },
  heroIcon: { fontSize: 48, marginBottom: 8, display: "block" },
  title: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, lineHeight: 1.0, letterSpacing: 3, color: "#fff", margin: 0 },
  titleAccent: { color: "#f59e0b" },
  subtitle: { marginTop: 8, color: "#64748b", fontSize: 13, letterSpacing: 2 },
  pageTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, lineHeight: 1.1, letterSpacing: 3, color: "#fff", margin: 0 },
  section: { padding: "20px 20px 0" },
  sectionTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2, color: "#f59e0b", marginBottom: 12 },
  scoreboard: { display: "flex", gap: 10, padding: "16px 20px 0" },
  scoreCard: { flex: 1, borderRadius: 12, padding: "14px 10px", textAlign: "center", background: "#0d1117", border: "1px solid #1e293b" },
  scoreCard0: { background: "linear-gradient(135deg,#1e3a5f,#0f2a4a)", border: "1px solid #2563eb44" },
  scoreCard1: { background: "linear-gradient(135deg,#3a1e1e,#2a0f0f)", border: "1px solid #dc262644" },
  scoreCard2: { background: "linear-gradient(135deg,#1e3a1e,#0f2a0f)", border: "1px solid #22c55e44" },
  playerName: { fontSize: 13, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 },
  bigNum: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 42, lineHeight: 1, color: "#fff", marginTop: 2 },
  smallLabel: { fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 2 },
  weekTabs: { display: "flex", gap: 6, padding: "14px 20px 8px", overflowX: "auto", flexWrap: "wrap" },
  weekTab: { padding: "6px 12px", borderRadius: 20, border: "1px solid #1e293b", background: "#0f1624", color: "#64748b", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
  weekTabActive: { background: "#1e3a5f", border: "1px solid #2563eb", color: "#93c5fd" },
  weekTabAvail: { border: "1px solid #f59e0b55" },
  matchList: { padding: "0 20px" },
  matchCard: { background: "#0d1117", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px", marginBottom: 10 },
  matchCardSoon: { borderColor: "#f59e0b44", background: "#0d100c" },
  matchCardLocked: { opacity: 0.65, borderColor: "#0f172a" },
  matchCardLive: { borderColor: "#22c55e88", background: "#071209" },
  matchMeta: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" },
  badge: { background: "#1e293b", color: "#94a3b8", fontSize: 10, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  badgeAmber: { background: "#3a2a00", color: "#f59e0b", fontSize: 10, padding: "2px 6px", borderRadius: 4 },
  badgeGreen: { background: "#1a3a1a", color: "#4ade80", fontSize: 10, padding: "2px 6px", borderRadius: 4 },
  badgeRed: { background: "#3a1a1a", color: "#f87171", fontSize: 10, padding: "2px 6px", borderRadius: 4 },
  badgeLive: { background: "#14532d", color: "#4ade80", fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 700 },
  matchDate: { color: "#475569", fontSize: 11 },
  teamRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  teamName: { fontSize: 13, fontWeight: 600, color: "#cbd5e1" },
  scoreInputGroup: { display: "flex", alignItems: "center", gap: 4 },
  scoreInput: { width: 38, height: 34, textAlign: "center", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#fff", fontSize: 15, fontWeight: 700 },
  scoreInputLocked: { background: "#111827", border: "1px solid #1e293b", color: "#64748b" },
  scoreSep: { color: "#475569", fontWeight: 700, fontSize: 14 },
  triesLabel: { fontSize: 10, color: "#64748b", textAlign: "center", marginTop: 2 },
  inputCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  predRow: { display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" },
  predItem: { fontSize: 11, color: "#64748b" },
  predScore: { color: "#e2e8f0", fontWeight: 600 },
  predPts: { fontWeight: 700, marginLeft: 4 },
  lbRow: { background: "#0d1117", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px", marginBottom: 8 },
  lbRowTop: { background: "linear-gradient(135deg,#1a1200,#0a0a0a)", border: "1px solid #f59e0b77" },
  lbTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  rankBadge: { width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, background: "#1e293b", color: "#94a3b8", flexShrink: 0 },
  rankBadgeLead: { background: "#f59e0b", color: "#000" },
  lbName: { flex: 1, fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 1, color: "#fff" },
  lbScore: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#f59e0b" },
  lbScoreLabel: { fontSize: 10, color: "#64748b", textAlign: "right" },
  weekRow: { background: "#0d1117", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 },
  weekRowLabel: { fontSize: 12, color: "#94a3b8" },
  weekRowScores: { display: "flex", gap: 10 },
  weekPts: { fontSize: 13, color: "#64748b" },
  weekPtsLead: { color: "#f59e0b", fontWeight: 700 },
  // Round navigation
  roundNav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 4px" },
  roundNavBtn: { background: "#0f1624", border: "1px solid #1e293b", color: "#94a3b8", borderRadius: 8, width: 38, height: 38, fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, flexShrink: 0 },
  roundNavBtnDisabled: { opacity: 0.25, cursor: "default", pointerEvents: "none" },
  roundNavLabel: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 2, color: "#f59e0b", textAlign: "center", flex: 1, padding: "0 8px" },
  // Try scorers inline
  scorersRow: { display: "flex", gap: 4, marginTop: 6, paddingTop: 6, borderTop: "1px solid #1e293b22" },
  scorersCol: { flex: 1, minWidth: 0 },
  scorerItem: { fontSize: 10, color: "#64748b", lineHeight: 1.6, display: "flex", alignItems: "center", gap: 3, overflow: "hidden" },
  scorerName: { color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  scorerMin: { color: "#475569", flexShrink: 0 },
  scorerConv: { color: "#f59e0b", fontSize: 9, flexShrink: 0 },
  rulesBox: { background: "#0d1117", border: "1px solid #f59e0b33", borderRadius: 10, padding: 16, marginTop: 16 },
  rulesTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, color: "#f59e0b", marginBottom: 12 },
  rulesGrid: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: 13 },
  rulesPts: { background: "#1e293b", color: "#f59e0b", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: 12, textAlign: "center", alignSelf: "center" },
  rulesText: { color: "#64748b", alignSelf: "center" },
  btnPrimary: { background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#000", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, fontSize: 18, padding: "12px 32px", borderRadius: 8, border: "none", cursor: "pointer", width: "100%" },
  btnSmall: { background: "transparent", color: "#64748b", border: "1px solid #1e293b", padding: "8px 20px", borderRadius: 6, fontSize: 13, cursor: "pointer" },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a3a1a", color: "#4ade80", border: "1px solid #22c55e44", padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600, zIndex: 999, whiteSpace: "nowrap", pointerEvents: "none" },
}

function GS() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;600;700&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:#07080f}
      input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
      input[type=number]{-moz-appearance:textfield}
      ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#111}::-webkit-scrollbar-thumb{background:#333}
    `}</style>
  )
}

function Toast({ msg }) {
  if (!msg) return null
  return <div style={S.toast}>{msg}</div>
}

// ─── TRY SCORERS INLINE ───────────────────────────────────────────────────────
function TryScorers({ homeScorers, awayScorers }) {
  const hs = homeScorers || []
  const as_ = awayScorers || []
  if (!hs.length && !as_.length) return null
  return (
    <div style={S.scorersRow}>
      <div style={S.scorersCol}>
        {hs.map((s, i) => (
          <div key={i} style={S.scorerItem}>
            <span>🏉</span>
            <span style={S.scorerName}>{s.name}</span>
            {s.min ? <span style={S.scorerMin}>{s.min}'</span> : null}
            {s.conv ? <span style={S.scorerConv}>✓</span> : null}
          </div>
        ))}
      </div>
      <div style={{ width: 1, background: "#1e293b22", flexShrink: 0 }} />
      <div style={{ ...S.scorersCol, textAlign: "right" }}>
        {as_.map((s, i) => (
          <div key={i} style={{ ...S.scorerItem, justifyContent: "flex-end" }}>
            {s.conv ? <span style={S.scorerConv}>✓</span> : null}
            {s.min ? <span style={S.scorerMin}>{s.min}'</span> : null}
            <span style={S.scorerName}>{s.name}</span>
            <span>🏉</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function scoreBreakdown(pred, actual) {
  if (!pred || !actual) return null
  const ph = parseInt(pred.homeScore), pa = parseInt(pred.awayScore)
  const ah = parseInt(actual.homeScore), aa = parseInt(actual.awayScore)
  const pht = parseInt(pred.homeTries), pat = parseInt(pred.awayTries)
  const aht = parseInt(actual.homeTries), aat = parseInt(actual.awayTries)
  if (isNaN(ph) || isNaN(pa) || isNaN(ah) || isNaN(aa)) return null
  const triesAvailable = !isNaN(pht) && !isNaN(pat) && !isNaN(aht) && !isNaN(aat)
  if (ph === ah && pa === aa && triesAvailable && pht === aht && pat === aat) {
    return [{ label: "🎯 Exact!", pts: 30 }]
  }
  const parts = []
  const predResult = ph > pa ? "H" : pa > ph ? "A" : "D"
  const actualResult = ah > aa ? "H" : aa > ah ? "A" : "D"
  if (predResult === actualResult) parts.push({ label: "Result", pts: 10 })
  const homeDiff = Math.abs(ph - ah)
  if (homeDiff === 0) parts.push({ label: "Home score", pts: 5 })
  else if (homeDiff <= 3) parts.push({ label: "Home ±1-3", pts: 2 })
  else if (homeDiff <= 7) parts.push({ label: "Home ±4-7", pts: 1 })
  const awayDiff = Math.abs(pa - aa)
  if (awayDiff === 0) parts.push({ label: "Away score", pts: 5 })
  else if (awayDiff <= 3) parts.push({ label: "Away ±1-3", pts: 2 })
  else if (awayDiff <= 7) parts.push({ label: "Away ±4-7", pts: 1 })
  if (triesAvailable) {
    if (pht === aht) parts.push({ label: "Home tries", pts: 2 })
    if (pat === aat) parts.push({ label: "Away tries", pts: 2 })
  }
  return parts
}

async function loadPredictions(player) {
  const { data } = await supabase.from("rugby_predictions").select("*").eq("player", player)
  const map = {}
  if (data) data.forEach(r => {
    map[r.match_id] = {
      homeScore: r.home_score, awayScore: r.away_score,
      homeTries: r.home_tries, awayTries: r.away_tries,
    }
  })
  return map
}

async function savePrediction(player, matchId, pred) {
  await supabase.from("rugby_predictions").upsert({
    player, match_id: matchId,
    home_score: pred.homeScore != null ? parseInt(pred.homeScore) : null,
    away_score: pred.awayScore != null ? parseInt(pred.awayScore) : null,
    home_tries: pred.homeTries != null ? parseInt(pred.homeTries) : null,
    away_tries: pred.awayTries != null ? parseInt(pred.awayTries) : null,
  }, { onConflict: "player,match_id" })
}

async function loadResults() {
  const { data } = await supabase.from("rugby_results").select("*")
  const map = {}
  if (data) data.forEach(r => {
    map[`${r.home_team}|${r.away_team}`] = {
      homeScore: r.home_score, awayScore: r.away_score,
      homeTries: r.home_tries, awayTries: r.away_tries,
      homeScorers: r.home_scorers || null,
      awayScorers: r.away_scorers || null,
    }
  })
  return map
}

async function saveResult(home, away, result) {
  await supabase.from("rugby_results").upsert({
    match_key: `${home}|${away}`,
    home_team: home, away_team: away,
    home_score: parseInt(result.homeScore),
    away_score: parseInt(result.awayScore),
    home_tries: result.homeTries != null ? parseInt(result.homeTries) : null,
    away_tries: result.awayTries != null ? parseInt(result.awayTries) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "match_key" })
}

function getMatchResult(match, results) {
  return results[`${match.home}|${match.away}`] || null
}

function getTotalScores(allPreds, results) {
  const scores = {}
  PLAYERS.forEach(p => { scores[p] = 0 })
  MATCHES.forEach(m => {
    const actual = getMatchResult(m, results)
    if (!actual || actual.homeScore == null) return
    PLAYERS.forEach(p => {
      const pred = allPreds[p]?.[m.id]
      if (pred) scores[p] += scorePoints(pred, actual)
    })
  })
  return scores
}

function getWeekScores(week, allPreds, results) {
  const scores = {}
  PLAYERS.forEach(p => { scores[p] = 0 })
  MATCHES.filter(m => m.week === week).forEach(m => {
    const actual = getMatchResult(m, results)
    if (!actual || actual.homeScore == null) return
    PLAYERS.forEach(p => {
      const pred = allPreds[p]?.[m.id]
      if (pred) scores[p] += scorePoints(pred, actual)
    })
  })
  return scores
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState("home")
  const [activePlayer, setActivePlayer] = useState(null)
  const [activeWeek, setActiveWeek] = useState(1)
  const [resultWeek, setResultWeek] = useState(1)
  const [allPreds, setAllPreds] = useState({})
  const [playerPreds, setPlayerPreds] = useState({})
  const [results, setResults] = useState({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState("")
  const [localResults, setLocalResults] = useState({})
  const [historyWeek, setHistoryWeek] = useState(1)
  const [roundOffset, setRoundOffset] = useState(0)
  const [liveActive, setLiveActive] = useState(false)
  const polling = useRef(false)
  const lastPoll = useRef(0)
  const resultsRef = useRef(results)

  useEffect(() => { resultsRef.current = results }, [results])

  const weeks = [...new Set(MATCHES.map(m => m.week))]

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 2500) }

  async function refresh() {
    const [res, ...predArrays] = await Promise.all([
      loadResults(),
      ...PLAYERS.map(p => loadPredictions(p))
    ])
    setResults(res)
    const preds = {}
    PLAYERS.forEach((p, i) => { preds[p] = predArrays[i] })
    setAllPreds(preds)
  }

  // Which week index should show "live" (first week not yet fully past)
  const liveWeekIndex = (() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    for (let i = 0; i < weeks.length; i++) {
      const weekMatches = MATCHES.filter(m => m.week === weeks[i])
      const lastDate = weekMatches.map(m => m.date).sort().reverse()[0]
      if (lastDate >= todayStr) return i
    }
    return weeks.length - 1
  })()

  const clampedIndex = Math.min(Math.max(liveWeekIndex + roundOffset, 0), weeks.length - 1)
  const shownWeek = weeks[clampedIndex]
  const canGoPrev = clampedIndex > 0
  const canGoNext = clampedIndex < weeks.length - 1

  // Is any match currently in the live window?
  function anyMatchInPlay() {
    const now = Date.now()
    return MATCHES.some(m => {
      if (m.kickoff === "TBC") return false
      const [h, mn] = m.kickoff.split(":").map(Number)
      const month = parseInt(m.date.split("-")[1])
      const bstOffset = (month >= 3 && month <= 10) ? 1 : 0
      const koUtc = new Date(`${m.date}T${String(h).padStart(2,"0")}:${String(mn).padStart(2,"0")}:00Z`)
      koUtc.setUTCHours(koUtc.getUTCHours() - bstOffset)
      const ko = koUtc.getTime()
      return now >= ko - 60000 && now < ko + 3 * 3600000
    })
  }

  // Determine if a single match is in its live window
  function matchIsLive(m) {
    if (m.kickoff === "TBC") return false
    const [h, mn] = m.kickoff.split(":").map(Number)
    const month = parseInt(m.date.split("-")[1])
    const bstOffset = (month >= 3 && month <= 10) ? 1 : 0
    const koUtc = new Date(`${m.date}T${String(h).padStart(2,"0")}:${String(mn).padStart(2,"0")}:00Z`)
    koUtc.setUTCHours(koUtc.getUTCHours() - bstOffset)
    const ko = koUtc.getTime()
    const now = Date.now()
    return now >= ko && now < ko + 3 * 3600000
  }

  async function maybeSync(force) {
    if (polling.current || document.hidden) return
    if (!force && !anyMatchInPlay()) return
    if (!force && Date.now() - lastPoll.current < 85000) return
    polling.current = true
    try {
      await syncFromEspn(setResults)
      lastPoll.current = Date.now()
      setLiveActive(anyMatchInPlay())
    } catch { }
    polling.current = false
  }

  useEffect(() => {
    const now = new Date()
    const current = MATCHES.find(m => new Date(m.date + "T05:00:00Z") > now)
    if (current) { setActiveWeek(current.week); setResultWeek(current.week) }
    refresh()
  }, [])

  useEffect(() => {
    const id = setInterval(() => maybeSync(false), 30000)
    const onShow = () => { if (!document.hidden) maybeSync(anyMatchInPlay()) }
    document.addEventListener("visibilitychange", onShow)
    window.addEventListener("focus", onShow)
    maybeSync(true)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onShow)
      window.removeEventListener("focus", onShow)
    }
  }, [])

  const availableWeeks = weeks.filter(w =>
    MATCHES.filter(m => m.week === w).some(m => isPredictionOpen(m.date))
  )

  async function openPredict(player) {
    setActivePlayer(player)
    setPlayerPreds({ ...allPreds[player] })
    const now = new Date()
    const current = MATCHES.find(m => new Date(m.date + "T05:00:00Z") > now)
    if (current) setActiveWeek(current.week)
    setView("predict")
  }

  async function handleSavePreds(localPreds) {
    setSaving(true)
    const saves = []
    for (const [matchId, pred] of Object.entries(localPreds)) {
      if (pred.homeScore != null && pred.awayScore != null &&
          pred.homeScore !== "" && pred.awayScore !== "") {
        saves.push(savePrediction(activePlayer, matchId, pred))
      }
    }
    await Promise.all(saves)
    setAllPreds(prev => ({ ...prev, [activePlayer]: localPreds }))
    setSaving(false)
    showToast("Predictions saved ✓")
    setTimeout(() => setView("home"), 800)
  }

  const totalScores = getTotalScores(allPreds, results)

  const STARTING_WEEKS_WON = { "Jez": 1, "Stu": 1, "Olly": 0 }
  const weeksWon = {}
  PLAYERS.forEach(p => { weeksWon[p] = STARTING_WEEKS_WON[p] || 0 })
  weeks.forEach(w => {
    const weekMatches = MATCHES.filter(m => m.week === w)
    const allDone = weekMatches.every(m => getMatchResult(m, results)?.homeScore != null)
    if (!allDone) return
    const ws = getWeekScores(w, allPreds, results)
    const best = Math.max(...PLAYERS.map(p => ws[p]))
    const winners = PLAYERS.filter(p => ws[p] === best)
    if (winners.length === 1) weeksWon[winners[0]]++
  })

  // ── PREDICT VIEW ──
  if (view === "predict") {
    const weekMatches = MATCHES.filter(m => m.week === activeWeek)
    const anyOpen = weekMatches.some(m => isPredictionOpen(m.date))

    function setPred(matchId, field, val) {
      setPlayerPreds(prev => ({ ...prev, [matchId]: { ...prev[matchId], [field]: val } }))
    }

    return (
      <div style={S.root}>
        <GS />
        <div style={S.hero}>
          <h2 style={S.pageTitle}>🏉 {activePlayer.toUpperCase()}'S<br />PREDICTIONS</h2>
          <p style={S.subtitle}>Predictions lock at 6am BST on match day</p>
        </div>
        <div style={S.weekTabs}>
          {weeks.map(w => (
            <button key={w}
              style={{ ...S.weekTab, ...(w === activeWeek ? S.weekTabActive : {}), ...(availableWeeks.includes(w) ? S.weekTabAvail : {}) }}
              onClick={() => setActiveWeek(w)}>
              {WEEK_LABELS[w]?.split("·")[0].trim()}
            </button>
          ))}
        </div>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <span style={{ color: "#aaa", fontSize: 13 }}>{WEEK_LABELS[activeWeek]}</span>
        </div>
        <div style={S.matchList}>
          {weekMatches.map(m => {
            const open = isPredictionOpen(m.date)
            const soon = isDeadlineSoon(m.date)
            const actual = getMatchResult(m, results)
            const pred = playerPreds[m.id] || {}
            const pts = actual?.homeScore != null ? scorePoints(pred, actual) : null
            return (
              <div key={m.id} style={{ ...S.matchCard, ...(!open ? S.matchCardLocked : {}), ...(soon ? S.matchCardSoon : {}) }}>
                <div style={S.matchMeta}>
                  <span style={S.matchDate}>{m.date}</span>
                  {m.label && <span style={S.badge}>{m.label}</span>}
                  {soon && open && <span style={S.badgeAmber}>🔔 Soon!</span>}
                  {!open && <span style={S.badge}>🔒 Locked</span>}
                  {pts !== null && <span style={pts > 0 ? S.badgeGreen : S.badge}>+{pts}pts</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#cbd5e1" }}>{flag(m.home)} {m.home}</div>
                  <div style={S.scoreInputGroup}>
                    <div style={S.inputCol}>
                      <input type="number" min="0" max="200"
                        style={{ ...S.scoreInput, ...(!open ? S.scoreInputLocked : {}) }}
                        value={pred.homeScore ?? ""} onChange={e => open && setPred(m.id, "homeScore", e.target.value)}
                        readOnly={!open} placeholder="?" />
                      <div style={S.triesLabel}>score</div>
                    </div>
                    <span style={S.scoreSep}>–</span>
                    <div style={S.inputCol}>
                      <input type="number" min="0" max="200"
                        style={{ ...S.scoreInput, ...(!open ? S.scoreInputLocked : {}) }}
                        value={pred.awayScore ?? ""} onChange={e => open && setPred(m.id, "awayScore", e.target.value)}
                        readOnly={!open} placeholder="?" />
                      <div style={S.triesLabel}>score</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#cbd5e1", textAlign: "right" }}>{m.away} {flag(m.away)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, fontSize: 11, color: "#64748b" }}>tries</div>
                  <div style={S.scoreInputGroup}>
                    <div style={S.inputCol}>
                      <input type="number" min="0" max="30"
                        style={{ ...S.scoreInput, width: 34, height: 30, fontSize: 13, ...(!open ? S.scoreInputLocked : {}) }}
                        value={pred.homeTries ?? ""} onChange={e => open && setPred(m.id, "homeTries", e.target.value)}
                        readOnly={!open} placeholder="?" />
                      <div style={S.triesLabel}>tries</div>
                    </div>
                    <span style={{ ...S.scoreSep, fontSize: 12 }}>–</span>
                    <div style={S.inputCol}>
                      <input type="number" min="0" max="30"
                        style={{ ...S.scoreInput, width: 34, height: 30, fontSize: 13, ...(!open ? S.scoreInputLocked : {}) }}
                        value={pred.awayTries ?? ""} onChange={e => open && setPred(m.id, "awayTries", e.target.value)}
                        readOnly={!open} placeholder="?" />
                      <div style={S.triesLabel}>tries</div>
                    </div>
                  </div>
                  <div style={{ flex: 1 }} />
                </div>
                {actual?.homeScore != null && (
                  <div style={{ fontSize: 12, marginTop: 6, color: "#64748b" }}>
                    Actual: <strong style={{ color: "#e2e8f0" }}>{actual.homeScore}–{actual.awayScore}</strong>
                    {actual.homeTries != null && <span> ({actual.homeTries}–{actual.awayTries} tries)</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {anyOpen && (
          <div style={{ padding: "16px 20px 8px" }}>
            <button style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }}
              onClick={() => handleSavePreds(playerPreds)} disabled={saving}>
              {saving ? "Saving…" : "💾 Save All Predictions"}
            </button>
          </div>
        )}
        <div style={{ textAlign: "center", padding: "12px 20px" }}>
          <button style={S.btnSmall} onClick={() => setView("home")}>← Back to Home</button>
        </div>
        <Toast msg={toast} />
      </div>
    )
  }

  // ── HISTORY VIEW ──
  if (view === "history") {
    const completedWeeks = weeks.filter(w =>
      MATCHES.filter(m => m.week === w).some(m => getMatchResult(m, results)?.homeScore != null)
    )
    const colStyle = { flex: 1, textAlign: "center", minWidth: 0 }
    const headerStyle = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 0" }
    const cellStyle = { fontSize: 11, color: "#94a3b8", padding: "3px 2px", lineHeight: 1.4 }
    const ptsStyle = { fontSize: 10, fontWeight: 700 }

    return (
      <div style={S.root}>
        <GS />
        <div style={S.hero}>
          <h2 style={S.pageTitle}>📖 HISTORY</h2>
          <p style={S.subtitle}>Past rounds — results & predictions</p>
        </div>
        <div style={S.weekTabs}>
          {completedWeeks.map(w => (
            <button key={w} style={{ ...S.weekTab, ...(w === historyWeek ? S.weekTabActive : {}) }}
              onClick={() => setHistoryWeek(w)}>
              {WEEK_LABELS[w]?.split("·")[0].trim()}
            </button>
          ))}
        </div>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <span style={{ color: "#aaa", fontSize: 13 }}>{WEEK_LABELS[historyWeek]}</span>
        </div>
        <div style={{ padding: "0 20px" }}>
          {MATCHES.filter(m => m.week === historyWeek).map(m => {
            const actual = getMatchResult(m, results)
            const hasResult = actual?.homeScore != null
            return (
              <div key={m.id} style={{ ...S.matchCard, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, borderBottom: "1px solid #1e293b", paddingBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", flex: 1 }}>{flag(m.home)} {m.home}</span>
                  {hasResult ? (
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "#f59e0b" }}>
                      {actual.homeScore}{actual.homeTries != null ? `(${actual.homeTries}T)` : ""} – {actual.awayScore}{actual.awayTries != null ? `(${actual.awayTries}T)` : ""}
                    </span>
                  ) : (
                    <span style={{ color: "#334155", fontSize: 13 }}>No result</span>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", flex: 1, textAlign: "right" }}>{m.away} {flag(m.away)}</span>
                </div>
                {hasResult && <TryScorers homeScorers={actual.homeScorers} awayScorers={actual.awayScorers} />}
                <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                  {PLAYERS.map(p => {
                    const pred = allPreds[p]?.[m.id]
                    const pts = hasResult && pred ? scorePoints(pred, actual) : null
                    const breakdown = hasResult && pred ? scoreBreakdown(pred, actual) : null
                    return (
                      <div key={p} style={colStyle}>
                        <div style={headerStyle}>{p}</div>
                        {pred ? (
                          <>
                            <div style={cellStyle}>{pred.homeScore}{pred.homeTries != null ? `(${pred.homeTries}T)` : ""}–{pred.awayScore}{pred.awayTries != null ? `(${pred.awayTries}T)` : ""}</div>
                            {pts !== null && <div style={{ ...ptsStyle, color: pts > 0 ? "#4ade80" : "#64748b" }}>+{pts}pts</div>}
                            {breakdown && breakdown.map((b, i) => (
                              <div key={i} style={{ fontSize: 9, color: "#475569", lineHeight: 1.4 }}>{b.label}: +{b.pts}</div>
                            ))}
                          </>
                        ) : (
                          <div style={{ ...cellStyle, color: "#334155" }}>–</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ textAlign: "center", padding: "16px 20px" }}>
          <button style={S.btnSmall} onClick={() => setView("home")}>← Back to Home</button>
        </div>
        <Toast msg={toast} />
      </div>
    )
  }

  // ── RESULTS VIEW ──
  if (view === "results") {
    const weekMatches = MATCHES.filter(m => m.week === resultWeek)

    function setLocal(matchId, field, val) {
      setLocalResults(prev => ({ ...prev, [matchId]: { ...prev[matchId], [field]: val } }))
    }

    async function saveAll() {
      for (const m of weekMatches) {
        const local = localResults[m.id]
        if (!local) continue
        if (local.homeScore != null && local.awayScore != null &&
            local.homeScore !== "" && local.awayScore !== "") {
          await saveResult(m.home, m.away, local)
          setResults(prev => ({ ...prev, [`${m.home}|${m.away}`]: local }))
        }
      }
      setLocalResults({})
      showToast("Results saved ✓")
    }

    return (
      <div style={S.root}>
        <GS />
        <div style={S.hero}>
          <h2 style={S.pageTitle}>📋 ENTER RESULTS</h2>
          <p style={S.subtitle}>Enter final scores and tries per team</p>
        </div>
        <div style={S.weekTabs}>
          {weeks.map(w => (
            <button key={w} style={{ ...S.weekTab, ...(w === resultWeek ? S.weekTabActive : {}) }}
              onClick={() => setResultWeek(w)}>
              {WEEK_LABELS[w]?.split("·")[0].trim()}
            </button>
          ))}
        </div>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <span style={{ color: "#aaa", fontSize: 13 }}>{WEEK_LABELS[resultWeek]}</span>
        </div>
        <div style={S.matchList}>
          {weekMatches.map(m => {
            const existing = getMatchResult(m, results)
            const local = localResults[m.id] || {}
            const hs = local.homeScore !== undefined ? local.homeScore : (existing?.homeScore ?? "")
            const as_ = local.awayScore !== undefined ? local.awayScore : (existing?.awayScore ?? "")
            const ht = local.homeTries !== undefined ? local.homeTries : (existing?.homeTries ?? "")
            const at = local.awayTries !== undefined ? local.awayTries : (existing?.awayTries ?? "")
            return (
              <div key={m.id} style={S.matchCard}>
                <div style={S.matchMeta}>
                  <span style={S.matchDate}>{m.date}</span>
                  {m.label && <span style={S.badge}>{m.label}</span>}
                  {existing?.homeScore != null && <span style={S.badgeGreen}>✓ Saved</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#cbd5e1" }}>{flag(m.home)} {m.home}</div>
                  <div style={S.scoreInputGroup}>
                    <div style={S.inputCol}>
                      <input type="number" min="0" max="200" style={S.scoreInput}
                        value={hs} onChange={e => setLocal(m.id, "homeScore", e.target.value)} placeholder="?" />
                      <div style={S.triesLabel}>score</div>
                    </div>
                    <span style={S.scoreSep}>–</span>
                    <div style={S.inputCol}>
                      <input type="number" min="0" max="200" style={S.scoreInput}
                        value={as_} onChange={e => setLocal(m.id, "awayScore", e.target.value)} placeholder="?" />
                      <div style={S.triesLabel}>score</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#cbd5e1", textAlign: "right" }}>{m.away} {flag(m.away)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, fontSize: 11, color: "#64748b" }}>tries</div>
                  <div style={S.scoreInputGroup}>
                    <div style={S.inputCol}>
                      <input type="number" min="0" max="30"
                        style={{ ...S.scoreInput, width: 34, height: 30, fontSize: 13 }}
                        value={ht} onChange={e => setLocal(m.id, "homeTries", e.target.value)} placeholder="?" />
                      <div style={S.triesLabel}>tries</div>
                    </div>
                    <span style={{ ...S.scoreSep, fontSize: 12 }}>–</span>
                    <div style={S.inputCol}>
                      <input type="number" min="0" max="30"
                        style={{ ...S.scoreInput, width: 34, height: 30, fontSize: 13 }}
                        value={at} onChange={e => setLocal(m.id, "awayTries", e.target.value)} placeholder="?" />
                      <div style={S.triesLabel}>tries</div>
                    </div>
                  </div>
                  <div style={{ flex: 1 }} />
                </div>
                <div style={S.predRow}>
                  {PLAYERS.map(p => {
                    const pred = allPreds[p]?.[m.id]
                    if (!pred) return null
                    const actual = existing || (localResults[m.id]?.homeScore != null ? {
                      homeScore: localResults[m.id].homeScore, awayScore: localResults[m.id].awayScore,
                      homeTries: localResults[m.id].homeTries, awayTries: localResults[m.id].awayTries,
                    } : null)
                    const pts = actual?.homeScore != null ? scorePoints(pred, actual) : null
                    return (
                      <div key={p} style={S.predItem}>
                        <span>{p}: </span>
                        <span style={S.predScore}>{pred.homeScore}–{pred.awayScore}</span>
                        {pred.homeTries != null && <span style={{ color: "#64748b" }}> ({pred.homeTries}–{pred.awayTries}T)</span>}
                        {pts !== null && <span style={{ ...S.predPts, color: pts > 0 ? "#4ade80" : "#f87171" }}>+{pts}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: "16px 20px 8px" }}>
          <button style={S.btnPrimary} onClick={saveAll}>💾 Save Results</button>
        </div>
        <div style={{ textAlign: "center", padding: "8px 20px" }}>
          <button style={S.btnSmall} onClick={() => setView("home")}>← Back to Home</button>
        </div>
        <Toast msg={toast} />
      </div>
    )
  }

  // ── LEADERBOARD VIEW ──
  if (view === "leaderboard") {
    return (
      <div style={S.root}>
        <GS />
        <div style={S.hero}>
          <h2 style={S.pageTitle}>🏆 LEADERBOARD</h2>
          <p style={S.subtitle}>{TOURNAMENT.name}</p>
        </div>
        <div style={{ padding: "16px 20px 0" }}>
          {[...PLAYERS].sort((a, b) => totalScores[b] - totalScores[a]).map((p, i) => (
            <div key={p} style={{ ...S.lbRow, ...(i === 0 ? S.lbRowTop : {}) }}>
              <div style={S.lbTop}>
                <div style={{ ...S.rankBadge, ...(i === 0 ? S.rankBadgeLead : {}) }}>{i + 1}</div>
                <div style={S.lbName}>{p}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={S.lbScore}>{totalScores[p] || 0}</div>
                  <div style={S.lbScoreLabel}>total pts</div>
                </div>
              </div>
              {weeks.map(w => {
                const ws = getWeekScores(w, allPreds, results)
                const hasAny = MATCHES.filter(m => m.week === w).some(m => getMatchResult(m, results)?.homeScore != null)
                if (!hasAny) return null
                return (
                  <div key={w} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", paddingTop: 4, borderTop: "1px solid #1e293b", marginTop: 4 }}>
                    <span>{WEEK_LABELS[w]}</span>
                    <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{ws[p]} pts</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", padding: "16px 20px" }}>
          <button style={S.btnSmall} onClick={() => setView("home")}>← Back</button>
        </div>
      </div>
    )
  }

  // ── HOME ──
  const playerColors = [S.scoreCard0, S.scoreCard1, S.scoreCard2]
  const colStyle = { flex: 1, textAlign: "center", minWidth: 0 }
  const headerStyle = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 0" }
  const cellStyle = { fontSize: 11, color: "#94a3b8", padding: "3px 2px", lineHeight: 1.4 }
  const ptsStyle = { fontSize: 10, fontWeight: 700 }

  const shownMatches = MATCHES.filter(m => m.week === shownWeek)
  const allNextPredsIn = shownMatches.length > 0 &&
    shownMatches.every(m => PLAYERS.every(p => allPreds[p]?.[m.id]?.homeScore != null))

  function HomeMatchCard({ m }) {
    const actual = getMatchResult(m, results)
    const hasResult = actual?.homeScore != null
    const isLive = matchIsLive(m)

    return (
      <div style={{ ...S.matchCard, marginBottom: 8, ...(isLive ? S.matchCardLive : {}) }}>
        {/* Match header row: teams + score */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, borderBottom: "1px solid #1e293b", paddingBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", flex: 1 }}>{flag(m.home)} {m.home}</span>
          {hasResult ? (
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: isLive ? "#4ade80" : "#f59e0b" }}>
              {actual.homeScore}{actual.homeTries != null ? `(${actual.homeTries}T)` : ""} – {actual.awayScore}{actual.awayTries != null ? `(${actual.awayTries}T)` : ""}
            </span>
          ) : (
            <span style={{ color: "#334155", fontSize: 11, textAlign: "center", lineHeight: 1.4 }}>
              {m.kickoff !== "TBC" ? (
                <><span style={{ display: "block", fontSize: 10, color: "#334155" }}>{m.date}</span>{m.kickoff}</>
              ) : "vs"}
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", flex: 1, textAlign: "right" }}>{m.away} {flag(m.away)}</span>
        </div>

        {/* Try scorers — inline, shown when data available */}
        {hasResult && <TryScorers homeScorers={actual.homeScorers} awayScorers={actual.awayScorers} />}

        {/* Prediction columns */}
        <div style={{ display: "flex", gap: 4, marginTop: hasResult && (actual.homeScorers?.length || actual.awayScorers?.length) ? 8 : 0 }}>
          {PLAYERS.map(p => {
            const pred = allPreds[p]?.[m.id]
            const hasPred = pred?.homeScore != null
            const pts = hasResult && hasPred ? scorePoints(pred, actual) : null
            const breakdown = hasResult && hasPred ? scoreBreakdown(pred, actual) : null
            return (
              <div key={p} style={colStyle}>
                <div style={headerStyle}>{p}</div>
                {hasResult && hasPred ? (
                  <>
                    <div style={cellStyle}>{pred.homeScore}{pred.homeTries != null ? `(${pred.homeTries}T)` : ""}–{pred.awayScore}{pred.awayTries != null ? `(${pred.awayTries}T)` : ""}</div>
                    <div style={{ ...ptsStyle, color: pts > 0 ? "#4ade80" : "#64748b" }}>+{pts}pts</div>
                    {breakdown && breakdown.map((b, i) => (
                      <div key={i} style={{ fontSize: 9, color: "#475569", lineHeight: 1.4 }}>{b.label}: +{b.pts}</div>
                    ))}
                  </>
                ) : allNextPredsIn && hasPred ? (
                  <div style={cellStyle}>{pred.homeScore}{pred.homeTries != null ? `(${pred.homeTries}T)` : ""}–{pred.awayScore}{pred.awayTries != null ? `(${pred.awayTries}T)` : ""}</div>
                ) : hasPred ? (
                  <div style={{ ...cellStyle, color: "#f59e0b" }}>hidden</div>
                ) : (
                  <div style={{ ...cellStyle, color: "#f87171" }}>pending</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={S.root}>
      <GS />
      <div style={{ textAlign: "center", padding: "24px 20px 16px", borderBottom: "1px solid #1e293b" }}>
        <img src="/logo.png" alt="Nations Championship 2026"
          style={{ maxWidth: "100%", height: "auto", maxHeight: 120, objectFit: "contain" }} />
        {liveActive && (
          <div style={{ marginTop: 8 }}>
            <span style={S.badgeLive}>● LIVE</span>
          </div>
        )}
      </div>

      {/* Weeks won scoreboard */}
      <div style={S.scoreboard}>
        {PLAYERS.map((p, i) => (
          <div key={p} style={{ ...S.scoreCard, ...playerColors[i] }}>
            <div style={S.playerName}>{p}</div>
            <div style={S.bigNum}>{weeksWon[p] || 0}</div>
            <div style={S.smallLabel}>weeks won</div>
          </div>
        ))}
      </div>

      {/* Week-by-week points summary */}
      {(() => {
        const scoredWeeks = weeks.filter(w =>
          MATCHES.filter(m => m.week === w).some(m => getMatchResult(m, results)?.homeScore != null)
        )
        if (scoredWeeks.length === 0) return null
        const maxTotal = Math.max(...PLAYERS.map(p => totalScores[p] || 0))
        return (
          <div style={S.section}>
            <div style={S.sectionTitle}>Points</div>
            <div style={{ ...S.weekRow, background: "#1a1200", border: "1px solid #f59e0b44", marginBottom: 4 }}>
              <div style={{ ...S.weekRowLabel, fontWeight: 700, color: "#f59e0b" }}>Total</div>
              <div style={S.weekRowScores}>
                {PLAYERS.map(p => (
                  <span key={p} style={{ ...S.weekPts, fontWeight: 700, ...(totalScores[p] === maxTotal && maxTotal > 0 ? S.weekPtsLead : { color: "#e2e8f0" }) }}>
                    {p}: {totalScores[p] || 0}
                  </span>
                ))}
              </div>
            </div>
            {scoredWeeks.map(w => {
              const ws = getWeekScores(w, allPreds, results)
              const maxScore = Math.max(...PLAYERS.map(p => ws[p]))
              if (maxScore === 0) return null
              return (
                <div key={w} style={S.weekRow}>
                  <div style={S.weekRowLabel}>{WEEK_LABELS[w]}</div>
                  <div style={S.weekRowScores}>
                    {PLAYERS.map(p => (
                      <span key={p} style={{ ...S.weekPts, ...(ws[p] === maxScore && maxScore > 0 ? S.weekPtsLead : {}) }}>
                        {p}: {ws[p] || 0}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ── ROUND NAVIGATION ── */}
      <div style={{ marginTop: 20 }}>
        <div style={S.roundNav}>
          <button
            style={{ ...S.roundNavBtn, ...(!canGoPrev ? S.roundNavBtnDisabled : {}) }}
            onClick={() => canGoPrev && setRoundOffset(roundOffset - 1)}
          >‹</button>
          <div style={S.roundNavLabel}>{WEEK_LABELS[shownWeek]}</div>
          <button
            style={{ ...S.roundNavBtn, ...(!canGoNext ? S.roundNavBtnDisabled : {}) }}
            onClick={() => canGoNext && setRoundOffset(roundOffset + 1)}
          >›</button>
        </div>

        <div style={{ textAlign: "center", fontSize: 12, color: allNextPredsIn ? "#4ade80" : "#64748b", padding: "4px 20px 10px" }}>
          {allNextPredsIn
            ? "✅ All predictions in — good luck!"
            : `Predictions hidden until all players submit`}
        </div>

        <div style={{ padding: "0 20px" }}>
          {shownMatches.map(m => <HomeMatchCard key={m.id} m={m} />)}
        </div>
      </div>

      {/* Action buttons */}
      <div style={S.section}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          {PLAYERS.map(p => (
            <button key={p}
              style={{ background: "#0f1624", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 8px", cursor: "pointer", textAlign: "center", color: "#e2e8f0", width: "100%" }}
              onClick={() => openPredict(p)}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>🏉</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, color: "#fff" }}>{p}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Predictions</div>
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <button
            style={{ background: "#1a1200", border: "1px solid #f59e0b44", borderRadius: 12, padding: "16px 8px", cursor: "pointer", textAlign: "center", color: "#e2e8f0" }}
            onClick={() => setView("leaderboard")}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>🏆</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, color: "#fff" }}>Leaderboard</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Full breakdown</div>
          </button>
          <button
            style={{ background: "#0a1a0a", border: "1px solid #22c55e44", borderRadius: 12, padding: "16px 8px", cursor: "pointer", textAlign: "center", color: "#e2e8f0" }}
            onClick={() => setView("results")}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>📋</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, color: "#fff" }}>Results</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Enter scores</div>
          </button>
          <button
            style={{ background: "#0a0a1a", border: "1px solid #6366f144", borderRadius: 12, padding: "16px 8px", cursor: "pointer", textAlign: "center", color: "#e2e8f0" }}
            onClick={() => {
              const completed = weeks.filter(w =>
                MATCHES.filter(m => m.week === w).some(m => getMatchResult(m, results)?.homeScore != null)
              )
              if (completed.length > 0) setHistoryWeek(completed[completed.length - 1])
              setView("history")
            }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>📖</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, color: "#fff" }}>History</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Past rounds</div>
          </button>
        </div>
      </div>

      {/* Scoring rules */}
      <div style={{ padding: "0 20px" }}>
        <div style={S.rulesBox}>
          <div style={S.rulesTitle}>📐 SCORING RULES</div>
          <div style={S.rulesGrid}>
            <div style={S.rulesPts}>30</div>
            <div style={S.rulesText}>Exact score + exact tries (both teams) — replaces all other points</div>
            <div style={S.rulesPts}>10</div>
            <div style={S.rulesText}>Correct result (win / loss / draw)</div>
            <div style={S.rulesPts}>5</div>
            <div style={S.rulesText}>Exact score per team</div>
            <div style={S.rulesPts}>2</div>
            <div style={S.rulesText}>Team score within 1–3 points</div>
            <div style={S.rulesPts}>1</div>
            <div style={S.rulesText}>Team score within 4–7 points</div>
            <div style={S.rulesPts}>2</div>
            <div style={S.rulesText}>Exact tries per team</div>
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 10 }}>Score and tries points apply per team. Max 25pts per match without exact bonus.</div>
        </div>
      </div>

      <Toast msg={toast} />
    </div>
  )
}
