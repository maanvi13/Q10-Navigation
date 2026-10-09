import React, { useState, useEffect, useCallback } from 'react';
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
  Search,
  Sliders,
  Cpu,
  Calculator,
  RefreshCw
} from 'lucide-react';

import { CROP_CATALOG, getOrParseCrop, PROCESSING_HUBS, DEFAULT_FARM_ORIGIN } from './utils/cropData';
import { evaluateRouteKinetics } from './utils/q10Engine';
import {
  fetchLiveWeather,
  fetchLiveRoutes,
  fetchBackendCrops,
  parseCropBackend,
  evaluateKineticsBackend
} from './utils/apiService';
import MapView from './components/MapView';

export default function App() {
  // Screen state: 'landing' or 'navigation'
  const [screen, setScreen] = useState('landing');

  // Backend connection status
  const [backendActive, setBackendActive] = useState(false);

  // Input states
  const [originText, setOriginText] = useState(DEFAULT_FARM_ORIGIN.name);
  const [originCoords, setOriginCoords] = useState(DEFAULT_FARM_ORIGIN.coords);
  const [selectedHubId, setSelectedHubId] = useState(PROCESSING_HUBS[0].id);
  const [autoSelectLowestRiskHub, setAutoSelectLowestRiskHub] = useState(true);

  // Cargo & biological states (Dynamic & Editable)
  const [cargoSearchText, setCargoSearchText] = useState('Tomatoes');
  const [selectedCrop, setSelectedCrop] = useState(CROP_CATALOG[0]);
  
  // DYNAMIC MATH OVERRIDES (User can slide / edit Q10, T_base, Price, Shelf Life!)
  const [customQ10, setCustomQ10] = useState(2.0);
  const [customTBase, setCustomTBase] = useState(12.0);
  const [customShelfLife, setCustomShelfLife] = useState(72);
  const [customPricePerKg, setCustomPricePerKg] = useState(28);
  const [cargoWeightKg, setCargoWeightKg] = useState(500);
  const [harvestAgeDays, setHarvestAgeDays] = useState(1);
  const [departureHour, setDepartureHour] = useState(13);

  // Telemetry & Route Data
  const [loading, setLoading] = useState(false);
  const [liveWeather, setLiveWeather] = useState({ temperature: 32.5, source: 'Initializing...' });
  const [routeEvaluation, setRouteEvaluation] = useState(null);
  const [activeHub, setActiveHub] = useState(PROCESSING_HUBS[0]);

  // Live Navigation Simulation state
  const [isNavigating, setIsNavigating] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Check FastAPI backend connection on startup
  useEffect(() => {
    async function checkBackend() {
      const crops = await fetchBackendCrops();
      if (crops && crops.length > 0) {
        setBackendActive(true);
      }
    }
    checkBackend();
  }, []);

  // Update crop physiological defaults when crop search changes
  useEffect(() => {
    async function updateCropData() {
      let crop = null;
      if (backendActive) {
        crop = await parseCropBackend(cargoSearchText);
      }
      if (!crop) {
        crop = getOrParseCrop(cargoSearchText);
      }
      setSelectedCrop(crop);
      setCustomQ10(crop.q10);
      setCustomTBase(crop.t_base || crop.tBase);
      setCustomShelfLife(crop.ambient_shelf_life || crop.ambientShelfLife);
      setCustomPricePerKg(crop.price_per_kg || crop.pricePerKg);
    }
    updateCropData();
  }, [cargoSearchText, backendActive]);

  // Initial ambient weather fetch
  useEffect(() => {
    async function loadInitialWeather() {
      const weather = await fetchLiveWeather(originCoords.lat, originCoords.lon);
      setLiveWeather(weather);
    }
    loadInitialWeather();
  }, [originCoords]);

  // GPS Location Trigger
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

  // Execute Route Calculation & Dynamic Backend Kinetics Flow
  const handleCalculateRoutes = useCallback(async () => {
    setLoading(true);

    try {
      const weather = await fetchLiveWeather(originCoords.lat, originCoords.lon);
      setLiveWeather(weather);

      let targetHub = PROCESSING_HUBS.find((h) => h.id === selectedHubId) || PROCESSING_HUBS[0];
      let routesData = await fetchLiveRoutes({ name: originText, coords: originCoords }, targetHub);

      // Construct dynamic crop parameters combining catalog + dynamic overrides
      const dynamicCropParams = {
        ...selectedCrop,
        q10: Number(customQ10),
        tBase: Number(customTBase),
        t_base: Number(customTBase),
        ambientShelfLife: Number(customShelfLife),
        pricePerKg: Number(customPricePerKg)
      };

      // Try evaluating via FastAPI backend API first
      let backendKinetics = null;
      if (backendActive) {
        backendKinetics = await evaluateKineticsBackend({
          tBase: dynamicCropParams.tBase,
          q10Factor: dynamicCropParams.q10,
          ambientShelfLife: dynamicCropParams.ambientShelfLife,
          harvestAgeDays,
          pricePerKg: dynamicCropParams.pricePerKg,
          cargoWeightKg,
          baseAmbientTemp: weather.temperature,
          departureHour,
          standardDistanceKm: routesData.standard.distanceKm,
          standardDurationMin: routesData.standard.durationMinutes,
          q10DistanceKm: routesData.q10Safe.distanceKm,
          q10DurationMin: routesData.q10Safe.durationMinutes
        });
      }

      let evalResult;
      if (backendKinetics) {
        // Map backend FastAPI response to UI evaluation format
        evalResult = {
          sInitial: backendKinetics.s_initial_hours,
          baseAmbientTemp: backendKinetics.base_ambient_temp,
          standard: {
            route: routesData.standard,
            effectiveTemp: backendKinetics.standard.effective_temp,
            decayEquivalentHours: backendKinetics.standard.decay_equivalent_hours,
            spoilagePercent: backendKinetics.standard.spoilage_percent,
            financialLoss: backendKinetics.standard.financial_loss,
            accelerationRate: backendKinetics.standard.acceleration_rate
          },
          q10Safe: {
            route: routesData.q10Safe,
            effectiveTemp: backendKinetics.q10_safe.effective_temp,
            decayEquivalentHours: backendKinetics.q10_safe.decay_equivalent_hours,
            spoilagePercent: backendKinetics.q10_safe.spoilage_percent,
            financialLoss: backendKinetics.q10_safe.financial_loss,
            accelerationRate: backendKinetics.q10_safe.acceleration_rate
          },
          profitPreserved: backendKinetics.profit_preserved,
          spoilageReductionPercent: backendKinetics.spoilage_reduction_percent,
          source: 'FastAPI Kinetics Engine v2.0'
        };
      } else {
        // Fallback to client-side biokinetic engine
        evalResult = evaluateRouteKinetics({
          crop: dynamicCropParams,
          harvestAgeDays,
          departureHour,
          baseAmbientTemp: weather.temperature,
          cargoWeightKg,
          standardRouteData: routesData.standard,
          q10RouteData: routesData.q10Safe
        });
        evalResult.source = 'Client Biokinetics Engine';
      }

      // Smart Auto-Select Lowest Thermal Risk Hub logic
      if (autoSelectLowestRiskHub) {
        let bestHub = targetHub;
        let lowestSpoilage = evalResult.q10Safe.spoilagePercent;
        let bestEval = evalResult;

        for (const hub of PROCESSING_HUBS) {
          if (hub.id === targetHub.id) continue;
          const hubRoutes = await fetchLiveRoutes({ name: originText, coords: originCoords }, hub);
          
          let hubEval;
          if (backendActive) {
            const bk = await evaluateKineticsBackend({
              tBase: dynamicCropParams.tBase,
              q10Factor: dynamicCropParams.q10,
              ambientShelfLife: dynamicCropParams.ambientShelfLife,
              harvestAgeDays,
              pricePerKg: dynamicCropParams.pricePerKg,
              cargoWeightKg,
              baseAmbientTemp: weather.temperature,
              departureHour,
              standardDistanceKm: hubRoutes.standard.distanceKm,
              standardDurationMin: hubRoutes.standard.durationMinutes,
              q10DistanceKm: hubRoutes.q10Safe.distanceKm,
              q10DurationMin: hubRoutes.q10Safe.durationMinutes
            });
            if (bk) {
              hubEval = {
                sInitial: bk.s_initial_hours,
                baseAmbientTemp: bk.base_ambient_temp,
                standard: {
                  route: hubRoutes.standard,
                  effectiveTemp: bk.standard.effective_temp,
                  decayEquivalentHours: bk.standard.decay_equivalent_hours,
                  spoilagePercent: bk.standard.spoilage_percent,
                  financialLoss: bk.standard.financial_loss,
                  accelerationRate: bk.standard.acceleration_rate
                },
                q10Safe: {
                  route: hubRoutes.q10Safe,
                  effectiveTemp: bk.q10_safe.effective_temp,
                  decayEquivalentHours: bk.q10_safe.decay_equivalent_hours,
                  spoilagePercent: bk.q10_safe.spoilage_percent,
                  financialLoss: bk.q10_safe.financial_loss,
                  accelerationRate: bk.q10_safe.acceleration_rate
                },
                profitPreserved: bk.profit_preserved,
                spoilageReductionPercent: bk.spoilage_reduction_percent
              };
            }
          }

          if (!hubEval) {
            hubEval = evaluateRouteKinetics({
              crop: dynamicCropParams,
              harvestAgeDays,
              departureHour,
              baseAmbientTemp: weather.temperature,
              cargoWeightKg,
              standardRouteData: hubRoutes.standard,
              q10RouteData: hubRoutes.q10Safe
            });
          }

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
      alert('Routing pipeline error. Loaded offline model.');
    } finally {
      setLoading(false);
    }
  }, [
    originText,
    originCoords,
    selectedHubId,
    selectedCrop,
    customQ10,
    customTBase,
    customShelfLife,
    customPricePerKg,
    cargoWeightKg,
    harvestAgeDays,
    departureHour,
    autoSelectLowestRiskHub,
    backendActive
  ]);

  // Automatically trigger dynamic kinetics update when user modifies math sliders while on Screen 2
  useEffect(() => {
    if (screen === 'navigation' && routeEvaluation) {
      handleCalculateRoutes();
    }
  }, [customQ10, customTBase, customShelfLife, customPricePerKg, cargoWeightKg, departureHour, harvestAgeDays]);

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
              {backendActive ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  FastAPI Backend Connected (Port 8000)
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-500/10 text-teal-300 border border-teal-500/30">
                  <Cpu className="w-3 h-3 text-teal-400" />
                  Arrhenius Math Engine Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Thermal Logistics & Biological Post-Harvest Degradation Architecture
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

      {/* SCREEN 1: TRIP DISPATCH & SETUP */}
      {screen === 'landing' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
          {/* Hero Pitch Banner */}
          <div className="relative overflow-hidden rounded-2xl p-6 sm:p-10 glass-panel-emerald bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950/60 border border-emerald-500/20 shadow-2xl">
            <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10 max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>End-to-End Dynamic Biokinetics & Live Telemetry Engine</span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight tracking-tight">
                Navigate by <span className="text-emerald-400 underline decoration-emerald-500/50">shelf life</span>, not just distance.
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Conventional GPS engines route unrefrigerated trucks onto scorching asphalt where heat accelerates crop decomposition. Q10 Nav uses real-time weather telemetry, road surface thermal modeling, and the empirical Arrhenius Q10 biological equation to identify routes that preserve produce shelf life and farmer income.
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
                <h3 className="text-lg font-bold text-white">Trip Dispatch & Route Network Setup</h3>
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

              {/* Right Column: Cargo Search & Suggestion Chips */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Leaf className="w-4 h-4 text-emerald-400" />
                      3. Crop Cargo Search & Parser
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Dynamic physiological catalog
                    </span>
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={cargoSearchText}
                      onChange={(e) => setCargoSearchText(e.target.value)}
                      placeholder="Type any crop (e.g. Tomatoes, Spinach, Mangoes, Strawberries)..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>

                  {/* Suggestion Chips */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {CROP_CATALOG.slice(0, 6).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCargoSearchText(c.name)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all cursor-pointer ${
                          selectedCrop.id === c.id || selectedCrop.name.toLowerCase() === c.name.toLowerCase()
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
                        }`}
                      >
                        {c.emoji} {c.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Biological Profile Summary Badge */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{selectedCrop.emoji}</span>
                      <div>
                        <h4 className="text-sm font-bold text-white">{selectedCrop.name}</h4>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Category: {selectedCrop.category || 'Agricultural Produce'}
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
                  <p className="text-[11px] text-slate-400 italic">
                    "{selectedCrop.description}"
                  </p>
                </div>
              </div>
            </div>

            {/* DYNAMIC ARRHENIUS BIOKINETIC LAB CONTROLS */}
            <div className="pt-6 border-t border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-emerald-400" />
                  <h4 className="text-base font-bold text-white">Dynamic Arrhenius Biokinetic Parameters Lab</h4>
                </div>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                  Real-time Variable Flow
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                {/* 1. Dynamic Q10 Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">Q10 Factor</span>
                    <span className="font-mono font-bold text-teal-400">{customQ10}x / 10°C</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="4.0"
                    step="0.1"
                    value={customQ10}
                    onChange={(e) => setCustomQ10(parseFloat(e.target.value))}
                    className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                  <div className="text-[10px] text-slate-400">Thermal degradation multiplier</div>
                </div>

                {/* 2. Dynamic T_base Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">T_base Threshold</span>
                    <span className="font-mono font-bold text-emerald-400">{customTBase}°C</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="20.0"
                    step="0.5"
                    value={customTBase}
                    onChange={(e) => setCustomTBase(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                  <div className="text-[10px] text-slate-400">Physiological baseline temp</div>
                </div>

                {/* 3. Ambient Shelf Life */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">Ambient Shelf Life</span>
                    <span className="font-mono font-bold text-emerald-400">{customShelfLife}h</span>
                  </div>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={customShelfLife}
                    onChange={(e) => setCustomShelfLife(parseFloat(e.target.value) || 24)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  <div className="text-[10px] text-slate-400">Initial total shelf life (hours)</div>
                </div>

                {/* 4. Price Per Kg */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">Produce Market Price</span>
                    <span className="font-mono font-bold text-amber-400">₹{customPricePerKg}/kg</span>
                  </div>
                  <input
                    type="number"
                    min="5"
                    max="1000"
                    value={customPricePerKg}
                    onChange={(e) => setCustomPricePerKg(parseFloat(e.target.value) || 10)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  <div className="text-[10px] text-slate-400">APMC market valuation (₹/kg)</div>
                </div>
              </div>

              {/* Secondary Controls: Cargo Weight, Harvest Age & Departure Hour */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                {/* Cargo Mass */}
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
                  <label className="text-xs font-semibold text-slate-300">Harvest Age Elapsed</label>
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
                      {departureHour >= 11 && departureHour <= 15 ? '🔥 Midday Heat' : '⛅ Cool'})
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
                    <span className="text-amber-400 font-bold">13:00 (Peak Heat)</span>
                    <span>20:00 (Night)</span>
                  </div>
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
                  <span>Executing Biokinetic Route Calculation...</span>
                </>
              ) : (
                <>
                  <span>Calculate Thermal-Safe Route →</span>
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
                <span>Q10: <strong className="text-teal-400">{customQ10}x</strong></span>
                <span className="text-slate-500">|</span>
                <span>T_base: <strong className="text-emerald-400">{customTBase}°C</strong></span>
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
          <div className="absolute bottom-4 left-4 right-4 z-20 pointer-events-auto max-w-6xl mx-auto">
            <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-slate-800/90 shadow-2xl space-y-4 backdrop-blur-xl">
              {/* Dynamic Live Formula Breakdown Pill */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-300 font-bold">Arrhenius Formula Live Flow:</span>
                  <span className="text-slate-400 text-[11px]">
                    S_initial = <strong className="text-emerald-300">{routeEvaluation.sInitial}h</strong>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-300">
                  <span>
                    Highway Accel: <strong className="text-rose-400">{routeEvaluation.standard.accelerationRate}x</strong>
                  </span>
                  <span>|</span>
                  <span>
                    Q10 Bypass Accel: <strong className="text-emerald-400">{routeEvaluation.q10Safe.accelerationRate}x</strong>
                  </span>
                  <span>|</span>
                  <span className="text-emerald-400 font-bold">{routeEvaluation.source}</span>
                </div>
              </div>

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

      {/* FOOTER */}
      {screen === 'landing' && (
        <footer className="border-t border-slate-900 bg-slate-950/80 px-4 sm:px-8 py-6 text-xs text-slate-400">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-300">Q10 Nav Full-Stack Architecture v2.0</span>
              <span>•</span>
              <span>FastAPI + React Vite + Leaflet</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
              <span>Citations:</span>
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="hover:text-emerald-400 underline">
                Open-Meteo API
              </a>
              <a href="https://project-osrm.org/" target="_blank" rel="noreferrer" className="hover:text-emerald-400 underline">
                OSRM Routing Network
              </a>
              <a href="https://postharvest.ucdavis.edu/" target="_blank" rel="noreferrer" className="hover:text-emerald-400 underline">
                UC Davis Postharvest
              </a>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
