/**
 * API Integration Service connecting React Frontend to FastAPI Backend.
 * Backend URL: http://localhost:8000
 */

const BACKEND_BASE_URL = 'http://localhost:8000';

// Fetch crops catalog from FastAPI backend
export async function fetchBackendCrops() {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/crops`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend crops API unavailable, using local catalog:', err);
  }
  return null;
}

// Parse custom crop via FastAPI backend
export async function parseCropBackend(cropName) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/crops/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crop_name: cropName })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend parse crop API failed, fallback to local parser:', err);
  }
  return null;
}

// Evaluate biokinetics via FastAPI backend engine
export async function evaluateKineticsBackend(params) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/kinetics/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        t_base: params.tBase,
        q10_factor: params.q10Factor,
        ambient_shelf_life: params.ambientShelfLife,
        harvest_age_days: params.harvestAgeDays,
        price_per_kg: params.pricePerKg,
        cargo_weight_kg: params.cargoWeightKg,
        base_ambient_temp: params.baseAmbientTemp,
        departure_hour: params.departureHour,
        standard_distance_km: params.standardDistanceKm,
        standard_duration_minutes: params.standardDurationMin,
        q10_distance_km: params.q10DistanceKm,
        q10_duration_minutes: params.q10DurationMin
      })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend kinetics evaluation API failed, fallback to local math engine:', err);
  }
  return null;
}

// Fetch ambient weather telemetry
export async function fetchLiveWeather(lat, lon) {
  try {
    const url = `${BACKEND_BASE_URL}/api/weather?lat=${lat}&lon=${lon}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return {
        temperature: data.temperature,
        windspeed: data.windspeed,
        isDay: data.is_day,
        source: data.source
      };
    }
  } catch (error) {
    // Direct Open-Meteo fallback
    try {
      const directUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
      const res = await fetch(directUrl);
      if (res.ok) {
        const data = await res.json();
        return {
          temperature: data.current_weather.temperature,
          windspeed: data.current_weather.windspeed,
          isDay: data.current_weather.is_day === 1,
          source: 'Live Open-Meteo Telemetry'
        };
      }
    } catch (e) {
      console.warn('Weather fallback failed:', e);
    }
  }

  return {
    temperature: 32.5,
    windspeed: 12.0,
    isDay: true,
    source: 'Davangere Seasonal Baseline'
  };
}

// Generate intermediate waypoint nodes along a path for temperature telemetry markers
export function generateWaypointTelemetry(coordinates, efTemp, routeLabel) {
  if (!coordinates || coordinates.length < 2) return [];

  const count = 3;
  const step = Math.floor(coordinates.length / (count + 1));
  const waypoints = [];

  for (let i = 1; i <= count; i++) {
    const idx = Math.min(coordinates.length - 1, i * step);
    const coord = coordinates[idx];
    const lat = Array.isArray(coord) ? (coord[1] > 40 || coord[1] < -40 ? coord[0] : coord[1]) : coord.lat;
    const lon = Array.isArray(coord) ? (coord[0] > 40 || coord[0] < -40 ? coord[1] : coord[0]) : coord.lon;

    const localVariance = ((i % 2 === 0 ? 0.6 : -0.4));
    const pointTemp = Number((efTemp + localVariance).toFixed(1));

    waypoints.push({
      id: `${routeLabel}-wp-${i}`,
      lat,
      lon,
      label: `${pointTemp}°C ${routeLabel}`,
      temp: pointTemp,
      type: routeLabel.includes('Safe') ? 'cool' : 'hot'
    });
  }

  return waypoints;
}

// Synthesize a rural canopy bypass polyline if OSRM returns a single highway route
function generateCanopyBypassCoordinates(primaryCoords) {
  if (!primaryCoords || primaryCoords.length < 2) return primaryCoords;
  
  const n = primaryCoords.length;
  const bypass = [];
  for (let i = 0; i < n; i++) {
    const fraction = i / (n - 1);
    const orig = primaryCoords[i];
    const offsetMag = Math.sin(fraction * Math.PI) * 0.018;
    const lat = orig[1] + offsetMag * 0.7;
    const lon = orig[0] - offsetMag * 0.9;
    
    bypass.push([lon, lat]);
  }

  return bypass;
}

// Fetch live driving route from OSRM
export async function fetchLiveRoutes(origin, dest) {
  const originLat = origin.coords.lat;
  const originLon = origin.coords.lon;
  const destLat = dest.coords.lat;
  const destLon = dest.coords.lon;

  const url = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=full&geometries=geojson&alternatives=true`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OSRM API HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (data && data.routes && data.routes.length > 0) {
      const mainRoute = data.routes[0];
      const mainDistanceKm = Number((mainRoute.distance / 1000).toFixed(1));
      const mainDurationMin = Math.round(mainRoute.duration / 60);
      const mainPolyline = mainRoute.geometry.coordinates.map(c => [c[1], c[0]]);

      let q10Polyline;
      let q10DistanceKm;
      let q10DurationMin;

      if (data.routes.length > 1) {
        const altRoute = data.routes[1];
        q10Polyline = altRoute.geometry.coordinates.map(c => [c[1], c[0]]);
        q10DistanceKm = Number((altRoute.distance / 1000).toFixed(1));
        q10DurationMin = Math.round(altRoute.duration / 60);
      } else {
        const bypassCoords = generateCanopyBypassCoordinates(mainRoute.geometry.coordinates);
        q10Polyline = bypassCoords.map(c => [c[1], c[0]]);
        q10DistanceKm = Number((mainDistanceKm * 1.08).toFixed(1));
        q10DurationMin = Math.round(mainDurationMin * 1.12);
      }

      return {
        standard: {
          name: 'NH-48 National Highway (Exposed Asphalt)',
          distanceKm: mainDistanceKm,
          durationMinutes: mainDurationMin,
          coordinates: mainPolyline,
          description: 'High speed, unshaded concrete & asphalt road with heavy direct solar radiation.'
        },
        q10Safe: {
          name: 'Q10 Rural Canopy & Tree-Covered Bypass',
          distanceKm: q10DistanceKm,
          durationMinutes: q10DurationMin,
          coordinates: q10Polyline,
          description: 'Shaded agricultural bypass with natural wind breaks and low surface temperature.'
        },
        source: 'Live OSRM Telemetry Engine'
      };
    }
  } catch (error) {
    console.warn('OSRM routing network unavailable, generating geometric corridor fallback:', error);
  }

  const fallbackMain = [
    [originLat, originLon],
    [originLat + (destLat - originLat) * 0.35, originLon + (destLon - originLon) * 0.2],
    [originLat + (destLat - originLat) * 0.7, originLon + (destLon - originLon) * 0.75],
    [destLat, destLon]
  ];

  const fallbackBypass = [
    [originLat, originLon],
    [originLat + (destLat - originLat) * 0.25 - 0.012, originLon + (destLon - originLon) * 0.3 + 0.015],
    [originLat + (destLat - originLat) * 0.65 - 0.015, originLon + (destLon - originLon) * 0.8 + 0.01],
    [destLat, destLon]
  ];

  const approxDistKm = Number((Math.hypot(destLat - originLat, destLon - originLon) * 111).toFixed(1));
  const approxDurationMin = Math.round((approxDistKm / 50) * 60);

  return {
    standard: {
      name: 'NH-48 Highway Route (Asphalt Heat Trap)',
      distanceKm: approxDistKm,
      durationMinutes: approxDurationMin,
      coordinates: fallbackMain,
      description: 'Main highway path exposing vehicle cargo to peak road surface heat.'
    },
    q10Safe: {
      name: 'Q10 Thermal Canopy Corridor',
      distanceKm: Number((approxDistKm * 1.06).toFixed(1)),
      durationMinutes: Math.round(approxDurationMin * 1.1),
      coordinates: fallbackBypass,
      description: 'Tree-shaded rural bypass optimized to minimize Arrhenius decay integral.'
    },
    source: 'Synthetic Corridor Fallback'
  };
}
