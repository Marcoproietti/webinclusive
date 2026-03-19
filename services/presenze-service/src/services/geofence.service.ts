// ─────────────────────────────────────────────────────────
// src/services/geofence.service.ts
// Verifica che il check-in avvenga entro il raggio
// configurato dall'indirizzo del beneficiario
// ─────────────────────────────────────────────────────────

import { env } from '../config/env.js'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface GeofenceResult {
  ok:            boolean
  distanceMeters: number
  radiusMeters:  number
}

export class GeofenceService {

  // ── Formula Haversine (distanza in metri tra due coordinate) ──

  distanceMeters(a: GeoPoint, b: GeoPoint): number {
    const R    = 6_371_000  // raggio Terra in metri
    const φ1   = (a.lat * Math.PI) / 180
    const φ2   = (b.lat * Math.PI) / 180
    const Δφ   = ((b.lat - a.lat) * Math.PI) / 180
    const Δλ   = ((b.lng - a.lng) * Math.PI) / 180

    const sinΔφ = Math.sin(Δφ / 2)
    const sinΔλ = Math.sin(Δλ / 2)

    const a2 =
      sinΔφ * sinΔφ +
      Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ

    const c = 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2))
    return Math.round(R * c)
  }

  // ── Verifica geofence ──────────────────────────────────

  check(
    operatorPos:   GeoPoint,
    beneficiaryPos: GeoPoint,
    radiusOverride?: number
  ): GeofenceResult {
    const radius   = radiusOverride ?? env.GEOFENCE_RADIUS_METERS
    const distance = this.distanceMeters(operatorPos, beneficiaryPos)

    return {
      ok:             distance <= radius,
      distanceMeters: distance,
      radiusMeters:   radius,
    }
  }

  // ── Geocoding indirizzo → coordinate (stub) ───────────
  // In produzione integrare con OpenStreetMap Nominatim (free)
  // o Google Maps Geocoding API

  async geocodeAddress(address: string): Promise<GeoPoint | null> {
    // Indirizzo è cifrato nel DB → deve essere decifrato prima di chiamare questo
    // Chiamata a Nominatim (gratuito, no API key necessaria)
    try {
      const encoded = encodeURIComponent(address)
      const url     = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`
      const res     = await fetch(url, {
        headers: { 'User-Agent': 'WEB.INCLUSIVE/1.0' },
      })
      const data: any[] = await res.json()
      if (!data.length) return null
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      }
    } catch {
      return null
    }
  }
}

export const geofenceService = new GeofenceService()
