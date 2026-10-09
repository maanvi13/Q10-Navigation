import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { generateWaypointTelemetry } from '../utils/apiService';

export default function MapView({
  origin,
  destination,
  evaluation,
  isNavigating = false,
  onStopNavigation
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const animationFrameRef = useRef(null);
  const navMarkerRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Leaflet Map if not created yet
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([origin.coords.lat, origin.coords.lon], 12);

      // Primary Tile Layer: OpenStreetMap Standard Tiles (100% reliable free tile provider)
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Invalidate size after DOM mount to guarantee proper Leaflet canvas sizing
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);

    // Clear previous vector layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Polyline || layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    if (!evaluation) return () => clearTimeout(timer);

    const standardCoords = evaluation.standard.route.coordinates;
    const q10Coords = evaluation.q10Safe.route.coordinates;

    // 1. Render Route 1: Standard Highway Route (Dashed Crimson / Rose #e11d48)
    const standardPolyline = L.polyline(standardCoords, {
      color: '#f43f5e',
      weight: 6,
      opacity: 0.9,
      dashArray: '8, 12',
      lineCap: 'round'
    }).addTo(map);

    standardPolyline.bindPopup(`
      <div class="p-2 space-y-1 font-sans">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>
          <h4 class="font-bold text-rose-400 text-sm">Standard Highway Route</h4>
        </div>
        <p class="text-xs text-slate-300">Asphalt heat trap with zero thermal shading.</p>
        <div class="mt-2 text-xs grid grid-cols-2 gap-1 text-slate-200 bg-slate-900/80 p-2 rounded border border-rose-500/20 font-mono">
          <div>Distance: <b>${evaluation.standard.route.distanceKm} km</b></div>
          <div>Duration: <b>${evaluation.standard.route.durationMinutes} min</b></div>
          <div>Asphalt Temp: <b class="text-rose-400">${evaluation.standard.effectiveTemp}°C</b></div>
          <div>Spoilage: <b class="text-rose-400">${evaluation.standard.spoilagePercent}%</b></div>
        </div>
        <div class="text-xs text-rose-300 font-bold mt-1">Loss: ₹${evaluation.standard.financialLoss.toLocaleString('en-IN')}</div>
      </div>
    `);

    // 2. Render Route 2: Q10 Thermal Safe Route (Thick Vibrant Emerald #059669)
    const q10Polyline = L.polyline(q10Coords, {
      color: '#10b981',
      weight: 8,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    q10Polyline.bindPopup(`
      <div class="p-2 space-y-1 font-sans">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-emerald-500 inline-block animate-ping"></span>
          <h4 class="font-bold text-emerald-400 text-sm">Q10 Thermal Safe Bypass</h4>
        </div>
        <p class="text-xs text-slate-300">Canopy-shaded rural corridor preserving biological shelf life.</p>
        <div class="mt-2 text-xs grid grid-cols-2 gap-1 text-slate-200 bg-slate-900/80 p-2 rounded border border-emerald-500/20 font-mono">
          <div>Distance: <b>${evaluation.q10Safe.route.distanceKm} km</b></div>
          <div>Duration: <b>${evaluation.q10Safe.route.durationMinutes} min</b></div>
          <div>Canopy Temp: <b class="text-emerald-400">${evaluation.q10Safe.effectiveTemp}°C</b></div>
          <div>Spoilage: <b class="text-emerald-400">${evaluation.q10Safe.spoilagePercent}%</b></div>
        </div>
        <div class="text-xs text-emerald-300 font-bold mt-1">Wealth Preserved: +₹${evaluation.profitPreserved.toLocaleString('en-IN')}</div>
      </div>
    `);

    // 3. Generate Telemetry Waypoint Markers
    const standardWaypoints = generateWaypointTelemetry(standardCoords, evaluation.standard.effectiveTemp, 'Highway');
    const q10Waypoints = generateWaypointTelemetry(q10Coords, evaluation.q10Safe.effectiveTemp, 'Bypass');

    [...standardWaypoints, ...q10Waypoints].forEach((wp) => {
      const isCool = wp.type === 'cool';
      const bgClass = isCool ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-rose-950 border-rose-500 text-rose-300';
      const iconHtml = `
        <div class="flex items-center gap-1 px-2 py-1 rounded-full border shadow-lg backdrop-blur-md text-[11px] font-mono font-bold ${bgClass} whitespace-nowrap">
          <span>${isCool ? '🌿' : '🔥'}</span>
          <span>${wp.label}</span>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-temp-marker',
        iconSize: [90, 26],
        iconAnchor: [45, 13]
      });

      L.marker([wp.lat, wp.lon], { icon: customIcon }).addTo(map);
    });

    // 4. Origin & Destination Markers
    const originIconHtml = `
      <div class="relative flex items-center justify-center">
        <span class="absolute inline-flex h-8 w-8 rounded-full bg-emerald-400 opacity-40 animate-ping"></span>
        <div class="w-9 h-9 rounded-full bg-emerald-600 border-2 border-white text-white flex items-center justify-center shadow-xl font-bold text-sm">
          🏡
        </div>
      </div>
    `;

    const destIconHtml = `
      <div class="relative flex items-center justify-center">
        <span class="absolute inline-flex h-8 w-8 rounded-full bg-blue-400 opacity-40 animate-ping"></span>
        <div class="w-9 h-9 rounded-full bg-blue-600 border-2 border-white text-white flex items-center justify-center shadow-xl font-bold text-sm">
          🏭
        </div>
      </div>
    `;

    const originMarker = L.marker([origin.coords.lat, origin.coords.lon], {
      icon: L.divIcon({ html: originIconHtml, className: '', iconSize: [36, 36], iconAnchor: [18, 18] })
    }).addTo(map);
    originMarker.bindPopup(`<b class="text-emerald-400 text-xs">${origin.name}</b><br/><span class="text-[11px]">Farm Dispatch Point</span>`);

    const destMarker = L.marker([destination.coords.lat, destination.coords.lon], {
      icon: L.divIcon({ html: destIconHtml, className: '', iconSize: [36, 36], iconAnchor: [18, 18] })
    }).addTo(map);
    destMarker.bindPopup(`<b class="text-blue-400 text-xs">${destination.name}</b><br/><span class="text-[11px]">${destination.type}</span>`);

    // Fit Bounds across all coordinates
    const allCoords = [...standardCoords, ...q10Coords];
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
    }

    // Handle Live Navigation Simulation
    if (isNavigating && q10Coords.length > 0) {
      let progress = 0;
      const vehicleIconHtml = `
        <div class="w-10 h-10 rounded-full bg-emerald-500 border-2 border-white shadow-2xl flex items-center justify-center text-lg glow-emerald">
          🚛
        </div>
      `;

      navMarkerRef.current = L.marker(q10Coords[0], {
        icon: L.divIcon({ html: vehicleIconHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20] })
      }).addTo(map);

      const animateVehicle = () => {
        progress += 0.003;
        if (progress > 1) progress = 0;

        const indexFloat = progress * (q10Coords.length - 1);
        const idx = Math.floor(indexFloat);
        const nextIdx = Math.min(q10Coords.length - 1, idx + 1);
        const remainder = indexFloat - idx;

        const currentPos = q10Coords[idx];
        const nextPos = q10Coords[nextIdx];

        const lat = currentPos[0] + (nextPos[0] - currentPos[0]) * remainder;
        const lon = currentPos[1] + (nextPos[1] - currentPos[1]) * remainder;

        if (navMarkerRef.current) {
          navMarkerRef.current.setLatLng([lat, lon]);
        }

        animationFrameRef.current = requestAnimationFrame(animateVehicle);
      };

      animateVehicle();
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [origin, destination, evaluation, isNavigating]);

  return (
    <div className="relative w-full h-full min-h-[500px]">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" />
      
      {/* Map Legend Overlay */}
      <div className="absolute top-20 left-4 z-10 flex flex-col gap-2 p-3 glass-panel rounded-xl text-xs border border-slate-800 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="w-4 h-1.5 rounded bg-rose-500 border border-rose-300"></span>
          <span className="text-rose-200 font-medium">Highway Route (Asphalt Heat Trap)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-2 rounded bg-emerald-500 border border-emerald-300 glow-emerald"></span>
          <span className="text-emerald-300 font-bold">Q10 Thermal-Safe Bypass</span>
        </div>
      </div>
    </div>
  );
}
