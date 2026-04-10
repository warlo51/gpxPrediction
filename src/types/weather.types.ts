/**
 * Types liés aux données météo (API Open-Meteo)
 */

/** Réponse brute de l'API Open-Meteo (champs utilisés) */
export type WeatherApiResponse = {
  current_weather: {
    /** Température en °C */
    temperature: number
    /** Vitesse du vent en km/h */
    windspeed: number
    /** Code météo WMO */
    weathercode: number
  }
  hourly: {
    /** Humidité relative en % — tableau par heure, index 0 = heure courante */
    relativehumidity_2m: number[]
  }
  daily: {
    time: string[]
    temperature_2m_mean: number[]
    windspeed_10m_max: number[]
    weathercode: number[]
    relative_humidity_2m_mean: number[]
  }
}

/** Données météo enrichies après mapping depuis l'API (météo actuelle) */
export type WeatherData = {
  temperatureC: number
  humidityPct: number
  windSpeedKmh: number
  weatherCode: number
  /** Label lisible du code WMO (ex: "Ensoleillé", "Pluie modérée") */
  weatherLabel: string
  fetchedAt: Date
}

/** Prévision météo pour un jour donné */
export type WeatherForecastDay = {
  /** Date ISO (YYYY-MM-DD) */
  date: string
  /** Offset par rapport à aujourd'hui (0 = aujourd'hui, 1 = demain, …) */
  dayOffset: number
  temperatureC: number
  humidityPct: number
  windSpeedKmh: number
  weatherCode: number
  weatherLabel: string
}

/** Prévisions météo complètes (J+0 à J+7) */
export type WeatherForecast = {
  days: WeatherForecastDay[]
  fetchedAt: Date
}
