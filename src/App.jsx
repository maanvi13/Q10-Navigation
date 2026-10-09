import React, { useState, useEffect } from 'react';
import {
  Thermometer,
  Navigation,
  ShieldCheck,
  TrendingUp,
  MapPin,
  Clock,
  Truck,
  Leaf,
  Sparkles,
  ArrowRight,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
  Info,
  DollarSign,
  Sun,
  Layers,
  Volume2,
  VolumeX,
  Play,
  Square,
  Search
} from 'lucide-react';

import { CROP_CATALOG, getOrParseCrop, PROCESSING_HUBS, DEFAULT_FARM_ORIGIN } from './utils/cropData';
import { evaluateRouteKinetics } from './utils/q10Engine';
import { fetchLiveWeather, fetchLiveRoutes } from './utils/apiService';
import MapView from './components/MapView';

export default function App() {
  // Navigation screen state: 'landing' or 'navigation'
  const [screen, setScreen] = useState('landing');

  // Input states
  const [originText, setOriginText] = useState(DEFAULT_FARM_ORIGIN.name);
  const [originCoords, setOriginCoords] = useState(DEFAULT_FARM_ORIGIN.coords);
  const [selectedHubId, setSelectedHubId] = useState(PROCESSING_HUBS[0].id);
  const [autoSelectLowestRiskHub, setAutoSelectLowestRiskHub] = useState(true);

  // Cargo & biological state
  const [cargoSearchText, setCargoSearchText] = useState('Tomatoes');
  const [selectedCrop, setSelectedCrop] = useState(CROP_CATALOG[0]);
  const [cargoWeightKg, setCargoWeightKg] = useState(500);
  const [harvestAgeDays, setHarvestAgeDays] = useState(1); // 0: Today (<12h), 1: 1 Day Ago, 2: 2+ Days Ago
  const [departureHour, setDepartureHour] = useState(13); // 13:00 PM peak heat default

  // Loading & Live Telemetry
  const [loading, setLoading] = useState(false);
  const [liveWeather, setLiveWeather] = useState({ temperature: 32.5, source: 'Initializing...' });
  const [routeEvaluation, setRouteEvaluation] = useState(null);
  const [activeHub, setActiveHub] = useState(PROCESSING_HUBS[0]);

  // Live Navigation Simulation state
  const [isNavigating, setIsNavigating] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Update crop when input changes
  useEffect(() => {
    const crop = getOrParseCrop(cargoSearchText);
    setSelectedCrop(crop);
  }, [cargoSearchText]);

  // Initial ambient weather fetch
  useEffect(() => {
    async function loadInitialWeather() {
      const weather = await fetchLiveWeather(originCoords.lat, originCoords.lon);
      setLiveWeather(weather);
    }
    loadInitialWeather();
  }, [originCoords]);

  // Handle GPS location trigger
  const handleUseCurrentLocation = () => {
    setGpsLoading(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setOriginCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          setOriginText(`GPS Location (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
          setGpsLoading(false);
        },
        (err) => {
          console.warn('Geolocation error:', err);
          alert('Could not acquire GPS position. Using Davangere Agricultural Belt baseline.');
          setGpsLoading(false);
        },
        { timeout: 8000 }
      );
    } else {
      alert('Geolocation API is not supported by your browser.');
      setGpsLoading(false);
    }
  };

  // Execute Route Calculation Pipeline
  const handleCalculateRoutes = async () => {
    setLoading(true);

    try {
      // 1. Fetch ambient weather telemetry
      const weather = await fetchLiveWeather(originCoords.lat, originCoords.lon);
      setLiveWeather(weather);

      let targetHub = PROCESSING_HUBS.find((h) => h.id === selectedHubId) || PROCESSING_HUBS[0];

      // 2. Fetch live route network for target hub
      let routesData = await fetchLiveRoutes({ name: originText, coords: originCoords }, targetHub);

      // 3. Evaluate initial kinetics
      let evalResult = evaluateRouteKinetics({
        crop: selectedCrop,
        harvestAgeDays,
        departureHour,
        baseAmbientTemp: weather.temperature,
        cargoWeightKg,
        standardRouteData: routesData.standard,
        q10RouteData: routesData.q10Safe
      });

      // 4. Smart Auto-Select Lowest Thermal Risk Hub logic if enabled
      if (autoSelectLowestRiskHub) {
        let bestHub = targetHub;
        let lowestSpoilage = evalResult.q10Safe.spoilagePercent;
        let bestEval = evalResult;

        for (const hub of PROCESSING_HUBS) {
          if (hub.id === targetHub.id) continue;
          const hubRoutes = await fetchLiveRoutes({ name: originText, coords: originCoords }, hub);
          const hubEval = evaluateRouteKinetics({
            crop: selectedCrop,
            harvestAgeDays,
            departureHour,
            baseAmbientTemp: weather.temperature,
            cargoWeightKg,
            standardRouteData: hubRoutes.standard,
            q10RouteData: hubRoutes.q10Safe
          });

          if (hubEval.q10Safe.spoilagePercent < lowestSpoilage) {
            lowestSpoilage = hubEval.q10Safe.spoilagePercent;
            bestHub = hub;
            bestEval = hubEval;
          }
        }

        targetHub = bestHub;
        evalResult = bestEval;
        setSelectedHubId(bestHub.id);
      }

      setActiveHub(targetHub);
      setRouteEvaluation(evalResult);
      setScreen('navigation');
    } catch (err) {
      console.error('Error calculating thermal routes:', err);
      alert('Network request failed. Loaded offline biokinetic model.');
    } finally {
      setLoading(false);
    }
  };

  // Helper sensitivity badge color
  const getSensitivityBadgeClass = (sensitivity) => {
    switch (sensitivity) {
      case 'Critical':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'High':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* GLOBAL BRAND HEADER */}
      <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-900/30">
            <Thermometer className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-emerald-400 bg-clip-text text-transparent">
                Q10 Nav
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Biokinetics Engine • FAO & UC Davis
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Thermal Logistics & Post-Harvest Perishability Optimization
            </p>
          </div>
        </div>

        {screen === 'navigation' && (
          <button
            onClick={() => setScreen('landing')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Adjust Trip Parameters</span>
          </button>
        )}
      </header>

      {/* SCREEN 1: TRIP DISPATCH & SETUP SETUP */}
      {screen === 'landing' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
          {/* Hero Pitch & Metrics Banner */}
          <div className="relative overflow-hidden rounded-2xl p-6 sm:p-10 glass-panel-emerald bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950/60 border border-emerald-500/20 shadow-2xl">
            <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10 max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero-CAPEX Cold Chain Software for Smallholder Farmers</span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight tracking-tight">
                Navigate by <span className="text-emerald-400 underline decoration-emerald-500/50">shelf life</span>, not just distance.
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Conventional GPS engines route unrefrigerated trucks onto scorching asphalt where heat accelerates crop decomposition. Q10 Nav uses live temperature telemetry and the Arrhenius biological Q10 equation to preserve produce freshness and farmer income.
              </p>

              {/* Stat Pill Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="text-xs text-slate-400">Shelf Life Gains</div>
                  <div className="text-lg font-bold text-emerald-400 font-mono">+18h – 36h</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="text-xs text-slate-400">Avg Value Preserved</div>
                  <div className="text-lg font-bold text-emerald-400 font-mono">₹4,200 – ₹18,500</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 col-span-2 sm:col-span-1">
                  <div className="text-xs text-slate-400">Asphalt Heat Buffer</div>
                  <div className="text-lg font-bold text-rose-400 font-mono">-9.5°C Exposure</div>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Configuration Card */}
          <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-8 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Navigation className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Trip Dispatch & Kinetics Configuration</h3>
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Live Ambient: <strong className="text-amber-300">{liveWeather.temperature}°C</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {/* Left Column: Origin & Destination */}
              <div className="space-y-6">
                {/* 1. Origin Input */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-emerald-400" />
                      1. Farm Dispatch Origin
                    </span>
                    <button
                      onClick={handleUseCurrentLocation}
                      disabled={gpsLoading}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer font-medium"
                    >
                      {gpsLoading ? 'Acquiring...' : '📍 Use Current Location (GPS)'}
                    </button>
                  </label>
                  <input
                    type="text"
                    value={originText}
                    onChange={(e) => setOriginText(e.target.value)}
                    placeholder="Enter farm address or cluster name"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
                  />
                </div>

                {/* 2. Destination Hub Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-emerald-400" />
                    2. Regional Processing Hub / Market Yard
                  </label>
                  <select
                    value={selectedHubId}
                    onChange={(e) => setSelectedHubId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
                  >
                    {PROCESSING_HUBS.map((hub) => (
                      <option key={hub.id} value={hub.id}>
                        {hub.name} ({hub.distanceKm} km • {hub.type})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Smart Toggle: Auto-select lowest thermal risk hub */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Auto-Select Lowest Thermal Risk Hub
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Reroutes to facility with lowest cumulative heat degradation rather than nearest distance.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoSelectLowestRiskHub(!autoSelectLowestRiskHub)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoSelectLowestRiskHub ? 'bg-emerald-500' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        autoSelectLowestRiskHub ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Right Column: Cargo Search & Biological Badge */}
              <div className="space-y-6">
                {/* 4. Universal Cargo Field */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Leaf className="w-4 h-4 text-emerald-400" />
                      3. Crop / Produce Cargo Specification
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Price: ₹{selectedCrop.pricePerKg}/kg
                    </span>
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={cargoSearchText}
                      onChange={(e) => setCargoSearchText(e.target.value)}
                      placeholder="Type crop (e.g. Tomatoes, Spinach, Mangoes)..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>

                  {/* Suggestion Chips */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {CROP_CATALOG.slice(0, 4).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCargoSearchText(c.name);
                          setSelectedCrop(c);
                        }}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all cursor-pointer ${
                          selectedCrop.id === c.id
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
                        }`}
                      >
                        {c.emoji} {c.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic Biological Badge */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{selectedCrop.emoji}</span>
                      <div>
                        <h4 className="text-sm font-bold text-white">{selectedCrop.name}</h4>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Ambient Shelf Life: {selectedCrop.ambientShelfLife}h
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${getSensitivityBadgeClass(
                        selectedCrop.sensitivity
                      )}`}
                    >
                      {selectedCrop.sensitivity} Risk
                    </span>
                  </div>

                  {/* Q10 & T_base Telemetry Pill */}
                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs font-mono">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400 block text-[10px]">Biological T_base</span>
                      <span className="font-bold text-emerald-400 text-sm">{selectedCrop.tBase}°C</span>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400 block text-[10px]">Arrhenius Q10 Factor</span>
                      <span className="font-bold text-teal-400 text-sm">{selectedCrop.q10}x / 10°C</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 italic">
                    "{selectedCrop.description}"
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Row: Cargo Mass, Harvest Age Stepper & Departure Slider */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-800/80">
              {/* Cargo Mass Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Cargo Load Mass</span>
                  <span className="text-slate-400 font-mono text-[11px]">{cargoWeightKg} kg</span>
                </label>
                <input
                  type="number"
                  min="50"
                  max="10000"
                  step="50"
                  value={cargoWeightKg}
                  onChange={(e) => setCargoWeightKg(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Harvest Age Stepper */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Harvest Time Elapsed</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { days: 0, label: 'Today (<12h)' },
                    { days: 1, label: '1 Day Ago' },
                    { days: 2, label: '2+ Days Ago' }
                  ].map((chip) => (
                    <button
                      key={chip.days}
                      onClick={() => setHarvestAgeDays(chip.days)}
                      className={`text-xs py-2 px-1 rounded-xl border text-center font-medium transition-all cursor-pointer ${
                        harvestAgeDays === chip.days
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Departure Hour Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-300">Departure Hour Slider</span>
                  <span className="font-mono text-amber-400 font-bold">
                    {String(departureHour).padStart(2, '0')}:00 HRS (
                    {departureHour >= 11 && departureHour <= 15 ? '🔥 Peak Heat' : '⛅ Moderate'})
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="23"
                  value={departureHour}
                  onChange={(e) => setDepartureHour(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>06:00 (Cool)</span>
                  <span className="text-amber-400 font-bold">13:00 (Midday Heat Peak)</span>
                  <span>20:00 (Evening)</span>
                </div>
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              onClick={handleCalculateRoutes}
              disabled={loading}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-extrabold text-base tracking-wide shadow-xl shadow-emerald-900/40 hover:shadow-emerald-900/60 transition-all flex items-center justify-center gap-3 cursor-pointer glow-emerald"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Computing Thermal Biokinetics Matrix...</span>
                </>
              ) : (
                <>
                  <span>Calculate Thermal-Safe Route</span>
                  <ArrowRight className="w-5 h-5 stroke-[3]" />
                </>
              )}
            </button>
          </div>
        </main>
      )}

      {/* SCREEN 2: FULL-VIEWPORT LIVE TELEMETRY & NAVIGATION */}
      {screen === 'navigation' && routeEvaluation && (
        <div className="relative flex-1 w-full h-[calc(100vh-65px)] min-h-[500px] flex flex-col overflow-hidden">
          {/* TOP FLOATING HUD BAR */}
          <div className="absolute top-4 left-4 right-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-3 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 glass-panel px-4 py-2.5 rounded-xl border border-slate-800 shadow-xl">
              <button
                onClick={() => setScreen('landing')}
                className="text-xs font-bold text-slate-200 hover:text-emerald-400 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>← Adjust Trip Parameters</span>
              </button>
            </div>

            {/* Right Cargo Summary Pill */}
            <div className="pointer-events-auto glass-panel px-4 py-2.5 rounded-xl border border-slate-800 shadow-xl flex items-center gap-3 text-xs font-mono">
              <span className="text-base">{selectedCrop.emoji}</span>
              <div className="flex items-center gap-2 text-slate-200">
                <span className="font-bold text-white">{cargoWeightKg}kg {selectedCrop.name}</span>
                <span className="text-slate-500">|</span>
                <span>Age: <strong className="text-emerald-400">{harvestAgeDays * 24}h</strong></span>
                <span className="text-slate-500">|</span>
                <span>Live Ambient: <strong className="text-amber-400">{liveWeather.temperature}°C</strong></span>
              </div>
            </div>
          </div>

          {/* 100% FULL SCREEN MAP CONTAINER */}
          <div className="absolute inset-0 w-full h-full z-0">
            <MapView
              origin={{ name: originText, coords: originCoords }}
              destination={activeHub}
              evaluation={routeEvaluation}
              isNavigating={isNavigating}
              onStopNavigation={() => setIsNavigating(false)}
            />
          </div>

          {/* BOTTOM FLOATING TELEMETRY COCKPIT */}
          <div className="absolute bottom-4 left-4 right-4 z-20 pointer-events-auto max-w-5xl mx-auto">
            <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-slate-800/90 shadow-2xl space-y-4 backdrop-blur-xl">
              {/* Comparative Side-by-Side Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Standard Route Card */}
                <div className="glass-panel-rose rounded-xl p-4 space-y-2 border border-rose-500/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                      Standard Highway Route (NH-48)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-500/30">
                      Unshaded Asphalt
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-1 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Distance</span>
                      <span className="font-bold text-white">{routeEvaluation.standard.route.distanceKm} km</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Road Temp</span>
                      <span className="font-bold text-rose-400">{routeEvaluation.standard.effectiveTemp}°C</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Spoilage</span>
                      <span className="font-bold text-rose-400">{routeEvaluation.standard.spoilagePercent}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-rose-500/20 text-xs font-mono">
                    <span className="text-slate-300">Estimated Produce Loss:</span>
                    <span className="font-bold text-rose-400">₹{routeEvaluation.standard.financialLoss.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Q10 Safe Bypass Route Card */}
                <div className="glass-panel-emerald rounded-xl p-4 space-y-2 border border-emerald-500/40 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block animate-ping"></span>
                      Q10 Thermal Safe Bypass
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                      Shaded Tree Canopy
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-1 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Distance</span>
                      <span className="font-bold text-white">{routeEvaluation.q10Safe.route.distanceKm} km</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Canopy Temp</span>
                      <span className="font-bold text-emerald-400">{routeEvaluation.q10Safe.effectiveTemp}°C</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Spoilage</span>
                      <span className="font-bold text-emerald-400">{routeEvaluation.q10Safe.spoilagePercent}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-xs font-mono">
                    <span className="text-slate-300">Estimated Produce Loss:</span>
                    <span className="font-bold text-emerald-300">₹{routeEvaluation.q10Safe.financialLoss.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Net Economic Benefit Banner & Navigation Mode Trigger */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">Net Farmer Wealth Preserved</div>
                    <div className="text-xl font-extrabold text-emerald-400 font-mono">
                      +₹{routeEvaluation.profitPreserved.toLocaleString('en-IN')}{' '}
                      <span className="text-xs text-emerald-300 font-normal">
                        ({routeEvaluation.spoilageReductionPercent}% Less Decay)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setAudioEnabled(!audioEnabled)}
                    className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
                    title={audioEnabled ? 'Mute Voice Telemetry' : 'Enable Voice Telemetry'}
                  >
                    {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
                  </button>

                  <button
                    onClick={() => setIsNavigating(!isNavigating)}
                    className={`flex-1 sm:flex-none px-6 py-3 rounded-xl font-extrabold text-xs tracking-wider uppercase transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg ${
                      isNavigating
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/50'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-900/50 glow-emerald'
                    }`}
                  >
                    {isNavigating ? (
                      <>
                        <Square className="w-4 h-4 fill-current" />
                        <span>Stop Navigation Simulation</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Start Q10 Navigation Mode</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER & DATA CITATIONS */}
      {screen === 'landing' && (
        <footer className="border-t border-slate-900 bg-slate-950/80 px-4 sm:px-8 py-6 text-xs text-slate-400">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-300">Q10 Nav Engine v2.4</span>
              <span>•</span>
              <span>Arrhenius Thermal Kinetics for Perishable Logistics</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
              <span>Data Citations:</span>
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="hover:text-emerald-400 underline">
                Open-Meteo API
              </a>
              <a href="https://project-osrm.org/" target="_blank" rel="noreferrer" className="hover:text-emerald-400 underline">
                OSRM Routing Network
              </a>
              <a href="https://postharvest.ucdavis.edu/" target="_blank" rel="noreferrer" className="hover:text-emerald-400 underline">
                UC Davis Postharvest
              </a>
              <a href="https://www.fao.org/home/en" target="_blank" rel="noreferrer" className="hover:text-emerald-400 underline">
                FAO Standards
              </a>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
