import { useState, useCallback } from 'react'
import { fetchWeatherForecast, forecastDayToEnvironment } from '@/services/weather.service'
import type { WeatherForecast, WeatherForecastDay } from '@/types/weather.types'
import type { EnvironmentConditions } from '@/types'

// ── Cache sessionStorage (TTL 30 min) ───────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000

function getCacheKey(lat: number, lon: number): string {
  return `weather_forecast_${lat.toFixed(2)}_${lon.toFixed(2)}`
}

function readCache(key: string): WeatherForecast | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data: WeatherForecast; cachedAt: number }
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(key)
      return null
    }
    return { ...parsed.data, fetchedAt: new Date(parsed.data.fetchedAt) }
  } catch {
    return null
  }
}

function writeCache(key: string, data: WeatherForecast): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now() }))
  } catch {
    // sessionStorage indisponible (mode privé, quota dépassé) — on ignore
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type UseWeatherResult = {
  forecast: WeatherForecast | null
  selectedDay: WeatherForecastDay | null
  selectedDayOffset: number
  isLoading: boolean
  error: string | null
  /** Récupère les prévisions 7 jours pour les coordonnées données */
  fetchForecast: (lat: number, lon: number) => Promise<EnvironmentConditions | null>
  /** Sélectionne un jour de prévision (0 = aujourd'hui, 7 = J+7) */
  selectDay: (dayOffset: number) => EnvironmentConditions | null
}

/**
 * Hook météo — récupère les prévisions J+0 à J+7 depuis Open-Meteo.
 * Déclenchement manuel uniquement (pas de useEffect réactif).
 * Cache sessionStorage 30 min pour éviter les appels redondants.
 */
export function useWeather(): UseWeatherResult {
  const [forecast, setForecast] = useState<WeatherForecast | null>(null)
  const [selectedDayOffset, setSelectedDayOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedDay = forecast?.days[selectedDayOffset] ?? null

  const fetchForecastCb = useCallback(async (
    lat: number,
    lon: number,
  ): Promise<EnvironmentConditions | null> => {
    setIsLoading(true)
    setError(null)

    // Lecture cache
    const cacheKey = getCacheKey(lat, lon)
    const cached = readCache(cacheKey)
    if (cached) {
      setForecast(cached)
      setSelectedDayOffset(0)
      setIsLoading(false)
      return forecastDayToEnvironment(cached.days[0])
    }

    const result = await fetchWeatherForecast(lat, lon)

    if (result && result.days.length > 0) {
      writeCache(cacheKey, result)
      setForecast(result)
      setSelectedDayOffset(0)
      setIsLoading(false)
      return forecastDayToEnvironment(result.days[0])
    }

    setError('weather_fetch_failed')
    setIsLoading(false)
    return null
  }, [])

  const selectDay = useCallback((dayOffset: number): EnvironmentConditions | null => {
    if (!forecast) return null
    const day = forecast.days[dayOffset]
    if (!day) return null
    setSelectedDayOffset(dayOffset)
    return forecastDayToEnvironment(day)
  }, [forecast])

  return {
    forecast,
    selectedDay,
    selectedDayOffset,
    isLoading,
    error,
    fetchForecast: fetchForecastCb,
    selectDay,
  }
}
