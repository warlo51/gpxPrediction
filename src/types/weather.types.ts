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
}

/** Données météo enrichies après mapping depuis l'API */
export type WeatherData = {
  temperatureC: number
  humidityPct: number
  windSpeedKmh: number
  weatherCode: number
  /** Label lisible du code WMO (ex: "Ensoleillé", "Pluie modérée") */
  weatherLabel: string
  fetchedAt: Date
}
