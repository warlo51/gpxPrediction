/**
 * Graphique du profil altimétrique du parcours
 * Affiche l'altitude en fonction de la distance, colorisé par type de segment.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import type { GpxTrack, SegmentType } from '@/types'

// ─── Couleurs par type de segment ────────────────────────────────────────────

const SEGMENT_COLORS: Record<SegmentType, string> = {
  flat: '#94a3b8',
  uphill: '#f97316',
  steep_uphill: '#ef4444',
  downhill: '#38bdf8',
  steep_downhill: '#6366f1',
}

const SEGMENT_LABEL_KEYS: Record<SegmentType, string> = {
  flat: 'elevation.flat',
  uphill: 'elevation.uphill',
  steep_uphill: 'elevation.steepUphill',
  downhill: 'elevation.downhill',
  steep_downhill: 'elevation.steepDownhill',
}

// ─── Types internes ──────────────────────────────────────────────────────────

type ChartPoint = {
  /** Distance en km */
  distanceKm: number
  /** Altitude en m */
  altitude: number
  /** Type de segment */
  segmentType: SegmentType
  /** Pente en % */
  grade: number
}

type ElevationChartProps = {
  track: GpxTrack
}

// ─── Tooltip personnalisé ────────────────────────────────────────────────────

type TooltipPayloadItem = {
  payload: ChartPoint
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
}) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  const d = payload[0]!.payload

  return (
    <div className="rounded-xl px-4 py-3 text-sm shadow-xl"
         style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
      <div className="text-[#64748b] mb-1">
        📍 <span className="text-[#1a2033] font-semibold">{d.distanceKm.toFixed(2)} km</span>
      </div>
      <div className="text-[#64748b]">
        ↕️ {t('elevation.altitude')} :{' '}
        <span className="text-[#1a2033] font-semibold">{Math.round(d.altitude)} m</span>
      </div>
      <div className="text-[#64748b]">
        📐 {t('elevation.grade')} :{' '}
        <span
          className="font-semibold"
          style={{ color: SEGMENT_COLORS[d.segmentType] }}
        >
          {d.grade.toFixed(1)} %
        </span>
      </div>
      <div
        className="mt-1 text-xs font-medium"
        style={{ color: SEGMENT_COLORS[d.segmentType] }}
      >
        {t(SEGMENT_LABEL_KEYS[d.segmentType])}
      </div>
    </div>
  )
}

// ─── Légende ─────────────────────────────────────────────────────────────────

function Legend() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-3 justify-center mt-3">
      {(Object.keys(SEGMENT_COLORS) as SegmentType[]).map((type) => (
        <div key={type} className="flex items-center gap-1.5 text-xs text-[#64748b]">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: SEGMENT_COLORS[type] }}
          />
          {t(SEGMENT_LABEL_KEYS[type])}
        </div>
      ))}
    </div>
  )
}

// ─── Composant principal ─────────────────────────────────────────────────────

export function ElevationChart({ track }: ElevationChartProps) {
  // Construire les points du graphique depuis les segments
  const data: ChartPoint[] = []

  for (const seg of track.segments) {
    for (let i = 0; i < seg.points.length; i++) {
      const pt = seg.points[i]!
      // Distance cumulée depuis le début (en km)
      const distM = i === 0
        ? seg.cumulativeDistance - seg.distance
        : seg.cumulativeDistance - seg.distance +
          (seg.distance * i) / Math.max(seg.points.length - 1, 1)

      // Éviter les doublons au raccord entre segments
      const distKm = distM / 1000
      if (data.length > 0 && Math.abs(data[data.length - 1]!.distanceKm - distKm) < 0.001) {
        continue
      }

      data.push({
        distanceKm: distKm,
        altitude: pt.elevation,
        segmentType: seg.type,
        grade: seg.avgGrade,
      })
    }
  }

  const minAlt = Math.floor(track.minElevation / 50) * 50
  const maxAlt = Math.ceil(track.maxElevation / 50) * 50

  return (
    <div className="w-full">
      {/* Stats rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <StatCard
          icon="📏"
          label="Distance totale"
          value={`${(track.totalDistance / 1000).toFixed(1)} km`}
        />
        <StatCard
          icon="⬆️"
          label="Dénivelé +"
          value={`${Math.round(track.totalElevationGain)} m`}
          color="text-orange-600"
        />
        <StatCard
          icon="⬇️"
          label="Dénivelé -"
          value={`${Math.round(track.totalElevationLoss)} m`}
          color="text-sky-700"
        />
        <StatCard
          icon="🏔️"
          label="Altitude max"
          value={`${Math.round(track.maxElevation)} m`}
          color="text-emerald-700"
        />
      </div>

      <div className="mt-4 rounded-2xl p-4 sm:p-5"
           style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1 h-5 rounded-full bg-[#ff6d00] inline-block" />
          <h3 className="text-[#1a2033] font-semibold text-sm uppercase tracking-wide">
            Détail des segments ({track.segments.length})
          </h3>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="altGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff6d00" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#ff6d00" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="distanceKm"
              tickFormatter={(v: number) => `${v.toFixed(0)} km`}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minAlt, maxAlt]}
              tickFormatter={(v: number) => `${v} m`}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              width={55}
            />
            <Tooltip content={<CustomTooltip />} />

            <Area
              type="monotone"
              dataKey="altitude"
              stroke="#ff6d00"
              strokeWidth={2}
              fill="url(#altGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#ff6d00', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>

        <Legend />
      </div>

    </div>
  )
}

function StatCard({
  icon, label, value, color = 'text-[#1a2033]',
}: {
  icon: string; label: string; value: string; color?: string
}) {
  return (
    <div className="rounded-xl p-3 text-center hover:scale-[1.02] transition-transform duration-200"
         style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <div className="text-xl sm:text-2xl mb-1">{icon}</div>
      <div className="text-[#64748b] text-xs mb-1">{label}</div>
      <div className={`font-bold text-sm sm:text-base ${color}`}>{value}</div>
    </div>
  )
}
