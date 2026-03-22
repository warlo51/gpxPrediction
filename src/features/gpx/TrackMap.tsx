/**
 * Carte interactive Leaflet du tracé GPX
 * - Colorisation des segments par type de terrain
 * - Popup au survol avec infos du segment
 * - Synchronisation avec le graphique altimétrique (hover)
 */

import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import { useAppStore } from '@/stores/appStore'
import type { GpxTrack, GpxSegment, SegmentType } from '@/types'

// ─── Couleurs par type de segment (cohérentes avec ElevationChart) ────────────

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

// ─── Helper : contenu du popup ────────────────────────────────────────────────

function buildPopupHtml(seg: GpxSegment): string {
  const gradeColor =
    seg.avgGrade > 5 ? '#f97316' : seg.avgGrade < -5 ? '#38bdf8' : '#94a3b8'
  return `
    <div style="min-width:160px">
      <div style="font-weight:700;color:${SEGMENT_COLORS[seg.type]};margin-bottom:6px">
        ${SEGMENT_LABELS[seg.type]}
      </div>
      <div style="color:#94a3b8;font-size:11px;line-height:1.8">
        📏 Distance : <strong style="color:#f1f5f9">${(seg.distance / 1000).toFixed(2)} km</strong><br/>
        📐 Pente moy. : <strong style="color:${gradeColor}">${seg.avgGrade.toFixed(1)} %</strong><br/>
        ⬆️ D+ : <strong style="color:#f97316">+${Math.round(seg.elevationGain)} m</strong><br/>
        ⬇️ D- : <strong style="color:#38bdf8">-${Math.round(seg.elevationLoss)} m</strong><br/>
        📍 Cumul : <strong style="color:#f1f5f9">${(seg.cumulativeDistance / 1000).toFixed(1)} km</strong>
      </div>
    </div>
  `
}

// ─── Types props ──────────────────────────────────────────────────────────────

type TrackMapProps = {
  track: GpxTrack
  /** Hauteur CSS de la carte (défaut : 420px) */
  height?: string
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function TrackMap({ track, height = '320px' }: TrackMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const polylinesRef = useRef<Map<string, L.Polyline>>(new Map())
  const markersRef = useRef<{ start: L.Marker | null; end: L.Marker | null }>({
    start: null,
    end: null,
  })

  const { hoveredSegmentId, setHoveredSegmentId } = useAppStore()

  // ── Initialisation de la carte ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
    })

    // Tuiles OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(map)

    // Attribution discrète
    L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Dessin du tracé ──────────────────────────────────────────────────────────
  const drawTrack = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    // Nettoyage des polylines et marqueurs précédents
    polylinesRef.current.forEach((pl) => pl.remove())
    polylinesRef.current.clear()
    markersRef.current.start?.remove()
    markersRef.current.end?.remove()

    const allBounds: L.LatLngTuple[] = []

    // Dessin de chaque segment
    for (const seg of track.segments) {
      const latlngs: L.LatLngTuple[] = seg.points.map((p) => [p.lat, p.lon])
      allBounds.push(...latlngs)

      const polyline = L.polyline(latlngs, {
        color: SEGMENT_COLORS[seg.type],
        weight: 4,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
      })

      // Popup au clic
      polyline.bindPopup(buildPopupHtml(seg), { maxWidth: 220 })

      // Highlight au survol
      polyline.on('mouseover', () => {
        setHoveredSegmentId(seg.id)
        polyline.setStyle({ weight: 7, opacity: 1 })
      })
      polyline.on('mouseout', () => {
        setHoveredSegmentId(null)
        polyline.setStyle({ weight: 4, opacity: 0.85 })
      })

      polyline.addTo(map)
      polylinesRef.current.set(seg.id, polyline)
    }

    // Marqueurs départ / arrivée
    const firstPoint = track.points[0]
    const lastPoint = track.points[track.points.length - 1]

    if (firstPoint) {
      markersRef.current.start = L.marker([firstPoint.lat, firstPoint.lon], {
        icon: createPinIcon('🟢', 'Départ'),
      })
        .bindPopup('<strong style="color:#22c55e">🟢 Départ</strong>')
        .addTo(map)
    }

    if (lastPoint) {
      markersRef.current.end = L.marker([lastPoint.lat, lastPoint.lon], {
        icon: createPinIcon('🔴', 'Arrivée'),
      })
        .bindPopup('<strong style="color:#ef4444">🔴 Arrivée</strong>')
        .addTo(map)
    }

    // Centrer la carte sur le tracé
    if (allBounds.length > 0) {
      map.fitBounds(L.latLngBounds(allBounds), { padding: [32, 32] })
    }
  }, [track, setHoveredSegmentId])

  useEffect(() => {
    drawTrack()
  }, [drawTrack])

  // ── Synchronisation hover externe → highlight sur la carte ──────────────────
  useEffect(() => {
    polylinesRef.current.forEach((polyline, segId) => {
      if (segId === hoveredSegmentId) {
        polyline.setStyle({ weight: 7, opacity: 1 })
        polyline.bringToFront()
      } else {
        polyline.setStyle({ weight: 4, opacity: 0.85 })
      }
    })
  }, [hoveredSegmentId])

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* En-tête */}
      <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-emerald-500 inline-block" />
          <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
            Carte du parcours
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500/80 ring-2 ring-emerald-500/20" />
            Départ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500/80 ring-2 ring-red-500/20" />
            Arrivée
          </span>
        </div>
      </div>

      {/* Carte */}
      <div
        ref={mapContainerRef}
        style={{ height }}
        className="w-full sm:h-[420px]"
      />

      {/* Légende segments */}
      <div className="px-4 py-3 border-t border-white/6 grid grid-cols-3 sm:flex sm:flex-wrap gap-2 sm:gap-3">
        {(Object.keys(SEGMENT_COLORS) as SegmentType[]).map((type) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span
              className="inline-block w-4 h-1.5 rounded-full"
              style={{ backgroundColor: SEGMENT_COLORS[type] }}
            />
            {SEGMENT_LABELS[type]}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Icône personnalisée (emoji pin) ─────────────────────────────────────────

function createPinIcon(emoji: string, label: string): L.DivIcon {
  return L.divIcon({
    html: `
      <div title="${label}" style="
        font-size: 22px;
        line-height: 1;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));
        cursor: pointer;
      ">${emoji}</div>
    `,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  })
}
