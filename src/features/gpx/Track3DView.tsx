/**
 * Vue 3D du tracé GPX — rendu MapLibre GL JS sur fond satellite avec terrain 3D
 * Tuiles satellite + DEM fournies par MapTiler (free tier sans carte bleue).
 * Le parcours est drapé sur le relief réel et coloré par type de segment.
 */

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GpxTrack, SegmentType } from '@/types'

// ─── Config ──────────────────────────────────────────────────────────────────

const SEGMENT_COLORS: Record<SegmentType, string> = {
  flat: '#94a3b8',
  uphill: '#f97316',
  steep_uphill: '#ef4444',
  downhill: '#38bdf8',
  steep_downhill: '#6366f1',
}

const TERRAIN_EXAGGERATION = 1.5
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined

// ─── Component ───────────────────────────────────────────────────────────────

interface Track3DViewProps {
  track: GpxTrack
  height?: string
}

export function Track3DView({ track, height = '400px' }: Track3DViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    if (!MAPTILER_KEY) return

    // Compute initial center from track points
    const lons = track.points.map(p => p.lon)
    const lats = track.points.map(p => p.lat)
    const center: [number, number] = [
      (Math.min(...lons) + Math.max(...lons)) / 2,
      (Math.min(...lats) + Math.max(...lats)) / 2,
    ]

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
      center,
      zoom: 12,
      pitch: 70,
      bearing: 0,
    })

    mapRef.current = map

    map.on('load', () => {
      // ── Source DEM (terrain 3D) ──
      if (!map.getSource('terrain-dem')) {
        map.addSource('terrain-dem', {
          type: 'raster-dem',
          url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
          tileSize: 256,
        })
      }
      map.setTerrain({ source: 'terrain-dem', exaggeration: TERRAIN_EXAGGERATION })

      // ── Sky / atmosphère ──
      map.setSky({
        'sky-color': '#1e293b',
        'horizon-color': '#475569',
        'fog-color': '#0f172a',
        'sky-horizon-blend': 0.5,
        'horizon-fog-blend': 0.5,
        'fog-ground-blend': 0.5,
      })

      // ── Source GeoJSON : un LineString par segment ──
      const features = track.segments
        .filter(seg => seg.points.length >= 2)
        .map(seg => ({
          type: 'Feature' as const,
          properties: { type: seg.type },
          geometry: {
            type: 'LineString' as const,
            coordinates: seg.points.map(p => [p.lon, p.lat] as [number, number]),
          },
        }))

      if (!map.getSource('track')) {
        map.addSource('track', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        })
      }

      // Halo blanc sous le tracé pour la lisibilité
      if (!map.getLayer('track-halo')) {
        map.addLayer({
          id: 'track-halo',
          type: 'line',
          source: 'track',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 7,
            'line-opacity': 0.35,
          },
        })
      }

      // Tracé coloré par type de segment
      if (!map.getLayer('track-line')) {
        map.addLayer({
          id: 'track-line',
          type: 'line',
          source: 'track',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-width': 4,
            'line-color': [
              'match',
              ['get', 'type'],
              'flat', SEGMENT_COLORS.flat,
              'uphill', SEGMENT_COLORS.uphill,
              'steep_uphill', SEGMENT_COLORS.steep_uphill,
              'downhill', SEGMENT_COLORS.downhill,
              'steep_downhill', SEGMENT_COLORS.steep_downhill,
              '#ffffff',
            ],
          },
        })
      }

      // ── Markers Start / Finish ──
      const first = track.points[0]
      const last = track.points[track.points.length - 1]
      if (first) {
        new maplibregl.Marker({ color: '#22c55e' })
          .setLngLat([first.lon, first.lat])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setText('Départ'))
          .addTo(map)
      }
      if (last) {
        new maplibregl.Marker({ color: '#ef4444' })
          .setLngLat([last.lon, last.lat])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setText('Arrivée'))
          .addTo(map)
      }

      // ── Recadrer la caméra sur le tracé ──
      const bounds = new maplibregl.LngLatBounds()
      for (const p of track.points) bounds.extend([p.lon, p.lat])
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        pitch: 65,
        bearing: 0,
        duration: 0,
      })
    })

    map.on('error', e => {
      console.error('[Track3DView] MapLibre error:', e)
    })

    // Controls
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')
    map.addControl(
      new maplibregl.TerrainControl({ source: 'terrain-dem', exaggeration: TERRAIN_EXAGGERATION }),
      'top-right',
    )

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [track])

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-violet-500 inline-block" />
          <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
            Vue 3D du parcours
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span>Clic gauche pour déplacer</span>
          <span>Clic droit pour pivoter</span>
          <span>Molette pour zoomer</span>
        </div>
      </div>
      <div style={{ height }} className="relative bg-[#070d1a]">
        {!MAPTILER_KEY ? (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6">
            <div className="text-slate-400 text-sm max-w-md">
              <p className="text-amber-400 font-medium mb-2">Vue 3D indisponible</p>
              <p>
                Clé MapTiler manquante. Ajoutez{' '}
                <code className="text-violet-300">VITE_MAPTILER_KEY</code> dans votre fichier{' '}
                <code className="text-violet-300">.env</code>.
              </p>
              <p className="text-xs text-slate-500 mt-3">
                Compte gratuit (sans carte bleue) sur{' '}
                <a
                  href="https://www.maptiler.com/cloud/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-violet-400"
                >
                  maptiler.com/cloud
                </a>
                .
              </p>
            </div>
          </div>
        ) : (
          <div ref={containerRef} className="w-full h-full" />
        )}
      </div>
      {/* Legend */}
      <div className="px-4 py-3 border-t border-white/6 flex flex-wrap gap-3">
        {(Object.keys(SEGMENT_COLORS) as SegmentType[]).map(type => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span
              className="inline-block w-4 h-1.5 rounded-full"
              style={{ backgroundColor: SEGMENT_COLORS[type] }}
            />
            {{
              flat: 'Plat',
              uphill: 'Montée',
              steep_uphill: 'Montée raide',
              downhill: 'Descente',
              steep_downhill: 'Descente raide',
            }[type]}
          </div>
        ))}
        <span className="ml-auto text-[10px] text-slate-600">
          Terrain ×{TERRAIN_EXAGGERATION}
        </span>
      </div>
    </div>
  )
}
