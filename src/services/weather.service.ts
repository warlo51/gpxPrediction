/**
 * Service météo — récupère température / humidité / vent depuis Open-Meteo.
 *
 * API : https://api.open-meteo.com (gratuite, sans clé, CORS-friendly)
 * Aucune dépendance React — service pur.
 */

import type { WeatherApiResponse, WeatherData } from '@/types/weather.types'
import type { EnvironmentConditions } from '@/types'

// ── WMO weather codes → label ───────────────────────────────────────────────

const WMO_LABELS: Record<number, string> = {
  0: 'Ensoleillé',
  1: 'Principalement dégagé',
  2: 'Partiellement nuageux',
  3: 'Couvert',
  45: 'Brouillard',
  48: 'Brouillard givrant',
  51: 'Bruine légère',
  53: 'Bruine modérée',
  55: 'Bruine dense',
  61: 'Pluie légère',
  63: 'Pluie modérée',
  65: 'Pluie forte',
  71: 'Neige légère',
  73: 'Neige modérée',
  75: 'Neige forte',
  77: 'Grésil',
  80: 'Averses légères',
  81: 'Averses modérées',
  82: 'Averses violentes',
  95: 'Orage',
  96: 'Orage avec grêle',
  99: 'Orage avec forte grêle',
}

function wmoLabel(code: number): string {
  return WMO_LABELS[code] ?? 'Conditions inconnues'
}

// ── Mapping ──────────────────────────────────────────────────────────────────

function mapToWeatherData(raw: WeatherApiResponse): WeatherData {
  return {
    temperatureC: Math.round(raw.current_weather.temperature),
    humidityPct: Math.round(raw.hourly.relativehumidity_2m[0] ?? 50),
    windSpeedKmh: Math.round(raw.current_weather.windspeed),
    weatherCode: raw.current_weather.weathercode,
    weatherLabel: wmoLabel(raw.current_weather.weathercode),
    fetchedAt: new Date(),
  }
}

/** Convertit des données météo en conditions utilisables par la simulation */
export function weatherToEnvironment(data: WeatherData): EnvironmentConditions {
  return {
    temperatureC: data.temperatureC,
    humidityPct: data.humidityPct,
    windSpeedKmh: data.windSpeedKmh,
    weatherCode: data.weatherCode,
    weatherLabel: data.weatherLabel,
  }
}

// ── Fetch principal ──────────────────────────────────────────────────────────

/**
 * Récupère les conditions météo pour des coordonnées GPS.
 * Retourne `null` en cas d'erreur (réseau, coords invalides, API down).
 */
export async function fetchWeatherForCoords(
  lat: number,
  lon: number,
): Promise<WeatherData | null> {
  // Validation des coordonnées
  if (
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lon) || lon < -180 || lon > 180
  ) {
    console.warn('[Weather] Coordonnées GPS invalides')
    return null
  }

  const params = new URLSearchParams({
    latitude: lat.toFixed(6),
    longitude: lon.toFixed(6),
    current_weather: 'true',
    hourly: 'relativehumidity_2m',
    forecast_days: '1',
    timezone: 'auto',
  })

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)

    if (!res.ok) {
      console.warn(`[Weather] API error: ${res.status}`)
      return null
    }

    const raw = (await res.json()) as WeatherApiResponse
    const data = mapToWeatherData(raw)

    if (import.meta.env.DEV) {
      console.debug('[Weather] Fetched:', {
        temperatureC: data.temperatureC,
        humidityPct: data.humidityPct,
        windSpeedKmh: data.windSpeedKmh,
        weatherLabel: data.weatherLabel,
      })
    }

    return data
  } catch (err) {
    console.warn('[Weather] Fetch failed:', (err as Error).message)
    return null
  }
}
