import { useState, useCallback } from 'react'
import { fetchWeatherForCoords, weatherToEnvironment } from '@/services/weather.service'
import type { WeatherData } from '@/types/weather.types'
import type { EnvironmentConditions } from '@/types'

// ── Cache sessionStorage (TTL 30 min) ───────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000

function getCacheKey(lat: number, lon: number): string {
  return `weather_${lat.toFixed(2)}_${lon.toFixed(2)}`
}

function readCache(key: string): WeatherData | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data: WeatherData; cachedAt: number }
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(key)
      return null
    }
    return { ...parsed.data, fetchedAt: new Date(parsed.data.fetchedAt) }
  } catch {
    return null
  }
}

function writeCache(key: string, data: WeatherData): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now() }))
  } catch {
    // sessionStorage indisponible (mode privé, quota dépassé) — on ignore
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type UseWeatherResult = {
  data: WeatherData | null
  isLoading: boolean
  error: string | null
  /** Déclenche le fetch météo pour les coordonnées données */
  fetch: (lat: number, lon: number) => Promise<EnvironmentConditions | null>
}

/**
 * Hook météo — récupère les conditions depuis Open-Meteo pour un point GPS.
 * Déclenchement manuel uniquement (pas de useEffect réactif).
 * Cache sessionStorage 30 min pour éviter les appels redondants.
 */
export function useWeather(): UseWeatherResult {
  const [data, setData] = useState<WeatherData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async (
    lat: number,
    lon: number,
  ): Promise<EnvironmentConditions | null> => {
    setIsLoading(true)
    setError(null)

    // Lecture cache
    const cacheKey = getCacheKey(lat, lon)
    const cached = readCache(cacheKey)
    if (cached) {
      setData(cached)
      setIsLoading(false)
      return weatherToEnvironment(cached)
    }

    const result = await fetchWeatherForCoords(lat, lon)

    if (result) {
      writeCache(cacheKey, result)
      setData(result)
      setIsLoading(false)
      return weatherToEnvironment(result)
    }

    setError('weather_fetch_failed')
    setIsLoading(false)
    return null
  }, [])

  return { data, isLoading, error, fetch }
}
