/**
 * Document PDF des stratégies de course
 * Utilise @react-pdf/renderer — primitives PDF uniquement (pas de HTML/Tailwind)
 */

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { RaceStrategyReport, StrategyPlan, RaceStrategyId, RacePhase } from '@/types/raceStrategy.types'

// ─── Palette ──────────────────────────────────────────────────────────────────

const COLORS = {
  prudente:    '#16a34a',
  objectif:    '#ea580c',
  ambitieuse:  '#dc2626',
  text:        '#0f172a',
  muted:       '#64748b',
  border:      '#e2e8f0',
  bgLight:     '#f8fafc',
  bgHeader:    '#f1f5f9',
  white:       '#ffffff',
  riskHigh:    '#dc2626',
  riskMid:     '#d97706',
  riskLow:     '#16a34a',
  nutritionOk: '#16a34a',
  nutritionWarn:'#d97706',
  nutritionKo: '#dc2626',
}

const STRATEGY_LABEL: Record<RaceStrategyId, string> = {
  prudente:   'Prudente',
  objectif:   'Objectif',
  ambitieuse: 'Ambitieuse',
}

const STRATEGY_EMOJI: Record<RaceStrategyId, string> = {
  prudente:   '🟢',
  objectif:   '🟡',
  ambitieuse: '🔴',
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page:           { padding: 32, fontFamily: 'Helvetica', backgroundColor: COLORS.white, fontSize: 9, color: COLORS.text },
  footer:         { position: 'absolute', bottom: 16, left: 32, right: 32, fontSize: 7, color: COLORS.muted, textAlign: 'center' },

  // Header
  headerRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title:          { fontSize: 16, fontFamily: 'Helvetica-Bold', color: COLORS.text, marginBottom: 4 },
  subtitle:       { fontSize: 8, color: COLORS.muted },
  statsRow:       { flexDirection: 'row', gap: 16, marginTop: 6 },
  statItem:       { flexDirection: 'row', gap: 4 },
  statLabel:      { fontSize: 8, color: COLORS.muted },
  statValue:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLORS.text },
  statUp:         { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#c2410c' },
  statDown:       { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#0369a1' },

  // Section
  section:        { marginBottom: 16 },
  sectionTitle:   { fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.text, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border },

  // Table
  tableHeaderRow: { flexDirection: 'row', backgroundColor: COLORS.bgHeader, paddingVertical: 5, paddingHorizontal: 6 },
  tableRow:       { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tableRowAlt:    { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.bgLight },
  thCell:         { fontSize: 7, fontFamily: 'Helvetica-Bold', color: COLORS.muted },
  tdCell:         { fontSize: 8, color: COLORS.text },
  tdMono:         { fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLORS.text },
  tdMuted:        { fontSize: 8, color: COLORS.muted },

  // Stats strip
  statsStrip:     { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard:       { flex: 1, padding: 8, backgroundColor: COLORS.bgLight, borderRadius: 4, borderWidth: 1, borderColor: COLORS.border },
  statCardLabel:  { fontSize: 7, color: COLORS.muted, marginBottom: 2 },
  statCardValue:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.text },
  statCardUnit:   { fontSize: 7, color: COLORS.muted },

  // Risk zones
  riskBox:        { padding: 8, borderRadius: 4, borderWidth: 1, marginBottom: 6 },
  riskTitle:      { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  riskKms:        { fontSize: 7, color: COLORS.muted },

  // Nutrition
  nutritionBox:   { flexDirection: 'row', gap: 8, padding: 8, borderRadius: 4, borderWidth: 1 },
  nutritionText:  { fontSize: 8, color: COLORS.text, flex: 1 },

  // Stratégie active badge
  activeBadge:    { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 8 },
  activeBadgeTxt: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLORS.white },
})

// ─── Header parcours ──────────────────────────────────────────────────────────

function PdfHeader({ report, activeStrategyId }: { report: RaceStrategyReport; activeStrategyId: RaceStrategyId }) {
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  return (
    <View style={s.headerRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{report.trackName.slice(0, 60)}</Text>
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statValue}>{report.totalDistanceKm.toFixed(1)} km</Text>
          </View>
          <View style={s.statItem}>
            <Text style={s.statUp}>+{Math.round(report.totalElevationGain)} m D+</Text>
          </View>
          <View style={s.statItem}>
            <Text style={s.statDown}>-{Math.round(report.totalElevationLoss)} m D-</Text>
          </View>
        </View>
        <Text style={[s.subtitle, { marginTop: 6 }]}>
          Stratégie mise en avant : {STRATEGY_EMOJI[activeStrategyId]} {STRATEGY_LABEL[activeStrategyId]}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.subtitle}>Généré le {now}</Text>
        <Text style={[s.subtitle, { marginTop: 2 }]}>GPX Trail Predictor</Text>
      </View>
    </View>
  )
}

// ─── Tableau comparatif ───────────────────────────────────────────────────────

function PdfComparativeTable({ strategies, activeStrategyId }: { strategies: StrategyPlan[]; activeStrategyId: RaceStrategyId }) {
  const cols = [
    { label: 'Stratégie',       width: '22%' },
    { label: 'Temps total',     width: '18%' },
    { label: 'Allure moy.',     width: '15%' },
    { label: 'FC moy.',         width: '13%' },
    { label: 'Fatigue',         width: '12%' },
    { label: 'Calories',        width: '12%' },
    { label: 'Risque',          width: '8%' },
  ]

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Comparatif des stratégies</Text>
      {/* En-tête */}
      <View style={s.tableHeaderRow}>
        {cols.map((c) => (
          <Text key={c.label} style={[s.thCell, { width: c.width }]}>{c.label}</Text>
        ))}
      </View>
      {/* Lignes */}
      {strategies.map((plan, i) => {
        const isActive = plan.id === activeStrategyId
        const rowStyle = isActive ? s.tableRowAlt : (i % 2 === 0 ? s.tableRow : s.tableRowAlt)
        const riskColor = plan.blowupRisk === 'Élevé' ? COLORS.riskHigh : plan.blowupRisk === 'Modéré' ? COLORS.riskMid : COLORS.riskLow
        const stratColor = COLORS[plan.id]
        return (
          <View key={plan.id} style={rowStyle}>
            <View style={{ width: '22%', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stratColor }} />
              <Text style={[s.tdCell, { fontFamily: isActive ? 'Helvetica-Bold' : 'Helvetica' }]}>
                {STRATEGY_LABEL[plan.id]}{isActive ? ' ★' : ''}
              </Text>
            </View>
            <Text style={[s.tdMono, { width: '18%' }]}>{plan.totalTimeFormatted}</Text>
            <Text style={[s.tdCell, { width: '15%' }]}>{plan.avgPaceFormatted}</Text>
            <Text style={[s.tdCell, { width: '13%' }]}>{plan.avgHR} bpm</Text>
            <Text style={[s.tdCell, { width: '12%' }]}>{(plan.avgFatigue * 100).toFixed(1)}%</Text>
            <Text style={[s.tdCell, { width: '12%' }]}>{plan.totalCalories} kcal</Text>
            <Text style={[s.tdCell, { width: '8%', color: riskColor }]}>{plan.blowupRisk}</Text>
          </View>
        )
      })}
    </View>
  )
}

// ─── Stats strip ──────────────────────────────────────────────────────────────

function PdfStatsStrip({ plan }: { plan: StrategyPlan }) {
  const items = [
    { label: 'FC moyenne',  value: `${plan.avgHR}`,         unit: 'bpm'  },
    { label: 'FC max est.', value: `${plan.maxHREstimated}`, unit: 'bpm'  },
    { label: 'Calories',    value: `${plan.totalCalories}`,  unit: 'kcal' },
    ...(plan.nutrition ? [{ label: 'Déficit', value: `${plan.nutrition.deficitKcal}`, unit: 'kcal' }] : []),
  ]
  return (
    <View style={s.statsStrip}>
      {items.map(({ label, value, unit }) => (
        <View key={label} style={s.statCard}>
          <Text style={s.statCardLabel}>{label}</Text>
          <Text style={s.statCardValue}>{value} <Text style={s.statCardUnit}>{unit}</Text></Text>
        </View>
      ))}
    </View>
  )
}

// ─── Tableau des phases ───────────────────────────────────────────────────────

function PdfPhasesTable({ phases }: { phases: RacePhase[] }) {
  const cols = [
    { label: 'Phase',    width: '28%' },
    { label: 'Km',       width: '14%' },
    { label: 'D+',       width: '10%' },
    { label: 'D-',       width: '10%' },
    { label: 'Allure',   width: '15%' },
    { label: 'FC',       width: '11%' },
    { label: 'Cumul',    width: '12%' },
  ]

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Phases du parcours</Text>
      <View style={s.tableHeaderRow}>
        {cols.map((c) => (
          <Text key={c.label} style={[s.thCell, { width: c.width }]}>{c.label}</Text>
        ))}
      </View>
      {phases.map((phase, i) => (
        <View key={phase.index} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          <View style={{ width: '28%' }}>
            <Text style={[s.tdCell, {
              color: phase.riskLevel === 'élevé' ? COLORS.riskHigh : phase.riskLevel === 'modéré' ? COLORS.riskMid : COLORS.text,
            }]}>
              {phase.riskLevel === 'élevé' ? '⚠ ' : ''}{phase.label.slice(0, 22)}
            </Text>
          </View>
          <Text style={[s.tdMuted, { width: '14%' }]}>{phase.startKm}–{phase.endKm}</Text>
          <Text style={[s.tdCell, { width: '10%', color: '#c2410c' }]}>+{phase.elevationGain}m</Text>
          <Text style={[s.tdCell, { width: '10%', color: '#0369a1' }]}>-{phase.elevationLoss}m</Text>
          <Text style={[s.tdMono, { width: '15%' }]}>{phase.targetPaceFormatted}</Text>
          <Text style={[s.tdCell, { width: '11%' }]}>{phase.avgHR} bpm</Text>
          <Text style={[s.tdMuted, { width: '12%' }]}>{phase.cumulativeTimeFormatted}</Text>
        </View>
      ))}
    </View>
  )
}

// ─── Zones à surveiller ───────────────────────────────────────────────────────

function PdfRiskZones({ plan }: { plan: StrategyPlan }) {
  if (plan.riskZones.length === 0) return null

  const groupDefs = [
    { cause: 'fc-elevee'   as const, label: 'FC élevée (> 92% FCmax)',      color: COLORS.riskHigh, bg: '#fef2f2', border: '#fecaca' },
    { cause: 'fc-soutenue' as const, label: 'FC soutenue (> 87% FCmax)',     color: COLORS.riskMid,  bg: '#fffbeb', border: '#fde68a' },
    { cause: 'marche'      as const, label: 'Marche forcée (pente raide)',   color: COLORS.riskMid,  bg: '#fffbeb', border: '#fde68a' },
  ]
  const groups = groupDefs
    .map(g => ({ ...g, zones: plan.riskZones.filter(z => z.cause === g.cause) }))
    .filter(g => g.zones.length > 0)

  if (groups.length === 0) return null

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Zones à surveiller</Text>
      {groups.map((group) => {
        const totalKm = group.zones.reduce((sum, z) => sum + (z.endKm - z.startKm), 0)
        const avgHR = Math.round(group.zones.reduce((s, z) => s + z.avgHR, 0) / group.zones.length)
        return (
          <View key={group.cause} style={[s.riskBox, { backgroundColor: group.bg, borderColor: group.border, marginBottom: 6 }]}>
            <Text style={[s.riskTitle, { color: group.color }]}>
              {group.label} — {group.zones.length} zone{group.zones.length > 1 ? 's' : ''} · {totalKm.toFixed(1)} km · ~{avgHR} bpm
            </Text>
            <Text style={s.riskKms}>
              {group.zones.map(z => `km ${z.startKm.toFixed(1)}–${z.endKm.toFixed(1)}`).join('  ·  ')}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

// ─── Nutrition ────────────────────────────────────────────────────────────────

function PdfNutrition({ plan }: { plan: StrategyPlan }) {
  if (!plan.nutrition) return null
  const { nutrition } = plan
  const color = nutrition.icon === '✅' ? COLORS.nutritionOk : nutrition.icon === '⚠️' ? COLORS.nutritionWarn : COLORS.nutritionKo
  const bg    = nutrition.icon === '✅' ? '#f0fdf4' : nutrition.icon === '⚠️' ? '#fffbeb' : '#fef2f2'
  const border = nutrition.icon === '✅' ? '#bbf7d0' : nutrition.icon === '⚠️' ? '#fde68a' : '#fecaca'

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Nutrition</Text>
      <View style={[s.nutritionBox, { backgroundColor: bg, borderColor: border }]}>
        <Text style={{ fontSize: 10 }}>{nutrition.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.nutritionText, { fontFamily: 'Helvetica-Bold', color, marginBottom: 2 }]}>
            {nutrition.status}
          </Text>
          <Text style={s.nutritionText}>{nutrition.message}</Text>
        </View>
      </View>
    </View>
  )
}

// ─── Document principal ───────────────────────────────────────────────────────

export function StrategyPdfDocument({
  report,
  activeStrategyId,
}: {
  report: RaceStrategyReport
  activeStrategyId: RaceStrategyId
}) {
  const activePlan = report.strategies.find((s) => s.id === activeStrategyId) ?? report.strategies[0]!
  const activeColor = COLORS[activeStrategyId]

  return (
    <Document title={`${report.trackName} — Stratégie ${STRATEGY_LABEL[activeStrategyId]}`}>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <PdfHeader report={report} activeStrategyId={activeStrategyId} />

        {/* Tableau comparatif */}
        <PdfComparativeTable strategies={report.strategies} activeStrategyId={activeStrategyId} />

        {/* Stratégie active */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>
            Détail — Stratégie {STRATEGY_LABEL[activeStrategyId]}
          </Text>
          <View style={[s.activeBadge, { backgroundColor: activeColor }]}>
            <Text style={s.activeBadgeTxt}>
              {STRATEGY_EMOJI[activeStrategyId]} {activePlan.totalTimeFormatted} · {activePlan.avgPaceFormatted}
            </Text>
          </View>
          <PdfStatsStrip plan={activePlan} />
        </View>

        {/* Phases */}
        <PdfPhasesTable phases={activePlan.phases} />

        {/* Zones à risque */}
        <PdfRiskZones plan={activePlan} />

        {/* Nutrition */}
        <PdfNutrition plan={activePlan} />

        {/* Footer */}
        <Text style={s.footer} render={({ pageNumber, totalPages }) =>
          `GPX Trail Predictor — ${report.trackName} — Page ${pageNumber}/${totalPages}`
        } fixed />
      </Page>
    </Document>
  )
}
