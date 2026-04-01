/**
 * Vue 3D du tracé GPX — rendu Three.js via react-three-fiber
 * Affiche le parcours en 3D avec exagération verticale et coloration par segment.
 */

import { useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Line, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { GpxTrack, GpxSegment, SegmentType } from '@/types'

// ─── Config ──────────────────────────────────────────────────────────────────

const SEGMENT_COLORS: Record<SegmentType, string> = {
  flat: '#94a3b8',
  uphill: '#f97316',
  steep_uphill: '#ef4444',
  downhill: '#38bdf8',
  steep_downhill: '#6366f1',
}

const ELEVATION_EXAGGERATION = 2.5

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert lat/lon/elevation to local 3D coords (meters, centered) */
function toLocal(
  lat: number,
  lon: number,
  elevation: number,
  center: { lat: number; lon: number; elev: number },
  scale: number,
): [number, number, number] {
  const R = 6371000
  const dLat = (lat - center.lat) * (Math.PI / 180) * R
  const dLon = (lon - center.lon) * (Math.PI / 180) * R * Math.cos(center.lat * Math.PI / 180)
  const dElev = (elevation - center.elev) * ELEVATION_EXAGGERATION
  return [dLon * scale, dElev * scale, -dLat * scale]
}

// ─── Ground grid ─────────────────────────────────────────────────────────────

function GroundGrid({ size }: { size: number }) {
  return (
    <gridHelper
      args={[size * 2.4, 24, '#1e293b', '#111827']}
      position={[0, -0.01, 0]}
    />
  )
}

// ─── Segment line ────────────────────────────────────────────────────────────

function SegmentLine({
  segment,
  center,
  scale,
}: {
  segment: GpxSegment
  center: { lat: number; lon: number; elev: number }
  scale: number
}) {
  const points = useMemo(
    () => segment.points.map(p => toLocal(p.lat, p.lon, p.elevation, center, scale)),
    [segment, center, scale],
  )

  if (points.length < 2) return null

  return (
    <Line
      points={points}
      color={SEGMENT_COLORS[segment.type]}
      lineWidth={3}
      transparent
      opacity={0.9}
    />
  )
}

// ─── Start/End markers ───────────────────────────────────────────────────────

function Marker({
  position,
  color,
  label,
}: {
  position: [number, number, number]
  color: string
  label: string
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      <Text
        position={[0, 0.7, 0]}
        fontSize={0.3}
        color={color}
        anchorX="center"
        anchorY="bottom"
        font={undefined}
      >
        {label}
      </Text>
    </group>
  )
}

// ─── Subtle auto-rotation ────────────────────────────────────────────────────

function AutoRotate({ speed = 0.1 }: { speed?: number }) {
  const controlsRef = useRef<{ getAzimuthalAngle: () => number; autoRotate: boolean; autoRotateSpeed: number } | null>(null)
  return (
    <OrbitControls
      ref={controlsRef as React.RefObject<never>}
      autoRotate
      autoRotateSpeed={speed}
      enableDamping
      dampingFactor={0.05}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI / 2.2}
    />
  )
}

// ─── Elevation "curtain" (filled area below the track) ───────────────────────

function ElevationCurtain({
  track,
  center,
  scale,
  baseY,
}: {
  track: GpxTrack
  center: { lat: number; lon: number; elev: number }
  scale: number
  baseY: number
}) {
  const geometry = useMemo(() => {
    const pts = track.points
    if (pts.length < 2) return null

    const vertices: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    const minElev = track.minElevation
    const range = track.maxElevation - minElev || 1

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!
      const [x, y, z] = toLocal(p.lat, p.lon, p.elevation, center, scale)

      // Top vertex
      vertices.push(x, y, z)
      // Bottom vertex (on ground)
      vertices.push(x, baseY, z)

      // Color gradient based on elevation
      const t = (p.elevation - minElev) / range
      const color = new THREE.Color().setHSL(0.08 - t * 0.08, 0.9, 0.4 + t * 0.2)
      colors.push(color.r, color.g, color.b)
      colors.push(color.r * 0.3, color.g * 0.3, color.b * 0.3)

      if (i < pts.length - 1) {
        const base = i * 2
        indices.push(base, base + 1, base + 2)
        indices.push(base + 1, base + 3, base + 2)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [track, center, scale, baseY])

  if (!geometry) return null

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        transparent
        opacity={0.35}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

// ─── Scene content ───────────────────────────────────────────────────────────

function SceneContent({ track }: { track: GpxTrack }) {
  // Compute center and scale
  const { center, scale, size, startPos, endPos } = useMemo(() => {
    const pts = track.points
    const latMin = Math.min(...pts.map(p => p.lat))
    const latMax = Math.max(...pts.map(p => p.lat))
    const lonMin = Math.min(...pts.map(p => p.lon))
    const lonMax = Math.max(...pts.map(p => p.lon))

    const c = {
      lat: (latMin + latMax) / 2,
      lon: (lonMin + lonMax) / 2,
      elev: track.minElevation,
    }

    // Compute bounding box in local coords to determine scale
    const R = 6371000
    const spanLat = (latMax - latMin) * (Math.PI / 180) * R
    const spanLon = (lonMax - lonMin) * (Math.PI / 180) * R * Math.cos(c.lat * Math.PI / 180)
    const maxSpan = Math.max(spanLat, spanLon, 1)
    const sc = 10 / maxSpan // normalize to ~10 units across

    const sz = 10
    const first = pts[0]!
    const last = pts[pts.length - 1]!

    return {
      center: c,
      scale: sc,
      size: sz,
      startPos: toLocal(first.lat, first.lon, first.elevation, c, sc),
      endPos: toLocal(last.lat, last.lon, last.elevation, c, sc),
    }
  }, [track])

  // Base Y for the curtain (slightly below lowest point)
  const baseY = -0.2

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} />
      <pointLight position={[-5, 10, -5]} intensity={0.3} color="#6366f1" />

      <GroundGrid size={size} />

      <ElevationCurtain track={track} center={center} scale={scale} baseY={baseY} />

      {track.segments.map(seg => (
        <SegmentLine key={seg.id} segment={seg} center={center} scale={scale} />
      ))}

      <Marker position={startPos} color="#22c55e" label="Start" />
      <Marker position={endPos} color="#ef4444" label="Finish" />

      <AutoRotate speed={0.15} />
    </>
  )
}

// ─── Composant exporté ───────────────────────────────────────────────────────

interface Track3DViewProps {
  track: GpxTrack
  height?: string
}

export function Track3DView({ track, height = '400px' }: Track3DViewProps) {
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
          <span>Cliquer + glisser pour tourner</span>
          <span>Molette pour zoomer</span>
        </div>
      </div>
      <div style={{ height }} className="bg-[#070d1a]">
        <Canvas
          camera={{ position: [8, 6, 8], fov: 50, near: 0.1, far: 200 }}
          gl={{ antialias: true, alpha: true }}
        >
          <SceneContent track={track} />
        </Canvas>
      </div>
      {/* Legend */}
      <div className="px-4 py-3 border-t border-white/6 flex flex-wrap gap-3">
        {(Object.keys(SEGMENT_COLORS) as SegmentType[]).map(type => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="inline-block w-4 h-1.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[type] }} />
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
          Exagération verticale ×{ELEVATION_EXAGGERATION}
        </span>
      </div>
    </div>
  )
}
