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
  ReferenceLine,
} from 'recharts'
import type { GpxTrack, SegmentType } from '@/types'
import { useAppStore } from '@/stores/appStore'

// ─── Couleurs par type de segment ────────────────────────────────────────────

const SEGMENT_COLORS: Record<SegmentType, string> = {
  flat: '#94a3b8',
  uphill: '#f97316',
  steep_uphill: '#ef4444',
  downhill: '#38bdf8',
  steep_downhill: '#6366f1',
}

const SEGMENT_LABELS: Record<SegmentType, string> = {
  flat: 'Plat',
  uphill: 'Montée',
  steep_uphill: 'Montée raide',
  downhill: 'Descente',
  steep_downhill: 'Descente raide',
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
  if (!active || !payload?.length) return null
  const d = payload[0]!.payload

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm shadow-xl">
      <div className="text-slate-400 mb-1">
        📍 <span className="text-white font-semibold">{d.distanceKm.toFixed(2)} km</span>
      </div>
      <div className="text-slate-400">
        ↕️ Altitude :{' '}
        <span className="text-white font-semibold">{Math.round(d.altitude)} m</span>
      </div>
      <div className="text-slate-400">
        📐 Pente :{' '}
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
        {SEGMENT_LABELS[d.segmentType]}
      </div>
    </div>
  )
}

// ─── Légende ─────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 justify-center mt-3">
      {(Object.keys(SEGMENT_COLORS) as SegmentType[]).map((type) => (
        <div key={type} className="flex items-center gap-1.5 text-xs text-slate-400">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: SEGMENT_COLORS[type] }}
          />
          {SEGMENT_LABELS[type]}
        </div>
      ))}
    </div>
  )
}

// ─── Composant principal ─────────────────────────────────────────────────────

export function ElevationChart({ track }: ElevationChartProps) {
  const { hoveredSegmentId, setHoveredSegmentId } = useAppStore()
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

  // Lignes de référence pour les jonctions de segments
  const segmentBoundaries = track.segments.slice(0, -1).map(
    (seg) => seg.cumulativeDistance / 1000,
  )

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
          color="text-orange-400"
        />
        <StatCard
          icon="⬇️"
          label="Dénivelé -"
          value={`${Math.round(track.totalElevationLoss)} m`}
          color="text-blue-400"
        />
        <StatCard
          icon="🏔️"
          label="Altitude max"
          value={`${Math.round(track.maxElevation)} m`}
          color="text-emerald-400"
        />
      </div>

      <div className="mt-4 glass rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1 h-5 rounded-full bg-violet-500 inline-block" />
          <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wide">
            Détail des segments ({track.segments.length})
          </h3>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="altGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="distanceKm"
              tickFormatter={(v: number) => `${v.toFixed(0)} km`}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#334155' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minAlt, maxAlt]}
              tickFormatter={(v: number) => `${v} m`}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#334155' }}
              tickLine={false}
              width={55}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Lignes de jonction entre segments */}
            {segmentBoundaries.map((km) => (
              <ReferenceLine
                key={km}
                x={km}
                stroke="#334155"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            ))}

            <Area
              type="monotone"
              dataKey="altitude"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#altGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#818cf8', stroke: '#312e81', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>

        <Legend />
      </div>

      {/* Tableau des segments */}
      <div className="mt-4 bg-slate-800/60 rounded-2xl p-4">
        <h3 className="text-slate-300 font-semibold mb-3 text-sm uppercase tracking-wide">
          Détail des segments ({track.segments.length})
        </h3>

        {/* Cartes mobile */}
        <div className="flex flex-col gap-2 sm:hidden">
          {track.segments.map((seg) => (
            <div
              key={seg.id}
              onTouchStart={() => setHoveredSegmentId(seg.id)}
              onTouchEnd={() => setHoveredSegmentId(null)}
              className={[
                'rounded-xl p-3 border transition-colors',
                hoveredSegmentId === seg.id ? 'border-indigo-500/50 bg-indigo-900/10' : 'border-slate-700 bg-slate-900/40',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: `${SEGMENT_COLORS[seg.type]}20`, color: SEGMENT_COLORS[seg.type] }}
                >
                  {SEGMENT_LABELS[seg.type]}
                </span>
                <span className="text-slate-600 text-xs">#{seg.index + 1}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div>
                  <div className="text-slate-500">Distance</div>
                  <div className="text-white font-medium">{(seg.distance / 1000).toFixed(2)} km</div>
                </div>
                <div>
                  <div className="text-slate-500">Pente</div>
                  <div className="font-semibold" style={{ color: SEGMENT_COLORS[seg.type] }}>{seg.avgGrade.toFixed(1)} %</div>
                </div>
                <div>
                  <div className="text-slate-500">D+</div>
                  <div className="text-orange-400 font-medium">+{Math.round(seg.elevationGain)} m</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tableau desktop */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-xs text-slate-400">
            <thead>
              <tr className="text-slate-500 border-b border-white/6">
                <th className="text-left pb-2 pr-4">#</th>
                <th className="text-left pb-2 pr-4">Type</th>
                <th className="text-right pb-2 pr-4">Distance</th>
                <th className="text-right pb-2 pr-4">Pente moy.</th>
                <th className="text-right pb-2 pr-4">D+</th>
                <th className="text-right pb-2">D-</th>
              </tr>
            </thead>
            <tbody>
              {track.segments.map((seg) => (
                <tr
                  key={seg.id}
                  onMouseEnter={() => setHoveredSegmentId(seg.id)}
                  onMouseLeave={() => setHoveredSegmentId(null)}
                  className={[
                    'border-b border-white/4 transition-colors cursor-pointer',
                    hoveredSegmentId === seg.id ? 'bg-indigo-900/20' : 'hover:bg-white/3',
                  ].join(' ')}
                >
                  <td className="py-1.5 pr-4 text-slate-600">{seg.index + 1}</td>
                  <td className="py-1.5 pr-4">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: `${SEGMENT_COLORS[seg.type]}20`, color: SEGMENT_COLORS[seg.type] }}
                    >
                      {SEGMENT_LABELS[seg.type]}
                    </span>
                  </td>
                  <td className="py-1.5 pr-4 text-right">{(seg.distance / 1000).toFixed(2)} km</td>
                  <td className="py-1.5 pr-4 text-right font-semibold" style={{ color: SEGMENT_COLORS[seg.type] }}>
                    {seg.avgGrade.toFixed(1)} %
                  </td>
                  <td className="py-1.5 pr-4 text-right text-orange-400">+{Math.round(seg.elevationGain)} m</td>
                  <td className="py-1.5 text-right text-blue-400">-{Math.round(seg.elevationLoss)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon, label, value, color = 'text-white',
}: {
  icon: string; label: string; value: string; color?: string
}) {
  return (
    <div className="glass rounded-xl p-3 text-center hover:scale-[1.02] transition-transform duration-200">
      <div className="text-xl sm:text-2xl mb-1">{icon}</div>
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div className={`font-bold text-sm sm:text-base ${color}`}>{value}</div>
    </div>
  )
}
