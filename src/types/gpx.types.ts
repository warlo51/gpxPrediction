/**
 * Types liés aux données GPX brutes et traitées
 */

/** Un point GPS brut issu du fichier GPX */
export type GpxPoint = {
  lat: number
  lon: number
  elevation: number
  /** Timestamp Unix en secondes (optionnel selon le fichier GPX) */
  time?: number
}

/** Type de segment selon la pente */
export type SegmentType = 'flat' | 'uphill' | 'downhill' | 'steep_uphill' | 'steep_downhill'

/** Un segment du parcours après segmentation intelligente */
export type GpxSegment = {
  id: string
  index: number
  startPoint: GpxPoint
  endPoint: GpxPoint
  points: GpxPoint[]
  /** Distance du segment en mètres */
  distance: number
  /** Dénivelé positif en mètres */
  elevationGain: number
  /** Dénivelé négatif en mètres (valeur positive) */
  elevationLoss: number
  /** Pente moyenne en % */
  avgGrade: number
  /** Pente max en % */
  maxGrade: number
  type: SegmentType
  /** Cumul distance depuis le départ en mètres */
  cumulativeDistance: number
  /** Cumul D+ depuis le départ en mètres */
  cumulativeElevationGain: number
}

/** Le tracé GPX complet après traitement */
export type GpxTrack = {
  name: string
  /** Distance totale en mètres */
  totalDistance: number
  /** Dénivelé positif total en mètres */
  totalElevationGain: number
  /** Dénivelé négatif total en mètres */
  totalElevationLoss: number
  /** Altitude min en mètres */
  minElevation: number
  /** Altitude max en mètres */
  maxElevation: number
  points: GpxPoint[]
  segments: GpxSegment[]
}
