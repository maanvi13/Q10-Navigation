/**
 * Biological kinetics and financial evaluation engine for Q10 Nav.
 * Implements FAO and UC Davis Arrhenius decay equations.
 */

// Calculate pre-transit residual shelf life (S_initial)
export function calculateResidualShelfLife(totalShelfLifeHours, harvestAgeDays) {
  const elapsedHours = harvestAgeDays * 24;
  const residual = totalShelfLifeHours - elapsedHours;
  return Math.max(4.0, residual);
}

// Model effective temperature considering departure hour, road surface, and route type
export function calculateEffectiveRouteTemp(baseAmbientTemp, departureHour, routeType = 'standard') {
  // Radiant asphalt solar factor (peaks around 13:00)
  // Sine curve from 06:00 (hour 6) to 18:00 (hour 18)
  let solarFactor = 0;
  if (departureHour >= 6 && departureHour <= 18) {
    solarFactor = Math.sin(((departureHour - 6) / 12) * Math.PI);
  }

  if (routeType === 'standard') {
    // Open highway black asphalt traps heat: adds up to +11.5°C radiant load at midday
    const asphaltHeatOffset = solarFactor * 11.5;
    return baseAmbientTemp + asphaltHeatOffset;
  } else {
    // Q10 Thermal-Safe Bypass: shaded foliage, rural canopy, lower traffic heat dump
    const canopyHeatOffset = solarFactor * 2.8;
    return baseAmbientTemp + canopyHeatOffset;
  }
}

// Calculate Arrhenius decay equivalent hours and spoilage percentage
export function calculateDecayMetrics({
  durationHours,
  effectiveTemp,
  tBase,
  q10Factor,
  sInitial
}) {
  // Arrhenius Q10 Decay Equation: Decay Equivalent Hours = t * Q10 ^ ((T - T_base) / 10)
  const exponent = (effectiveTemp - tBase) / 10;
  const thermalAccelerationRate = Math.pow(q10Factor, exponent);
  const decayEquivalentHours = durationHours * thermalAccelerationRate;

  // Spoilage percentage = min(100, (Decay Equivalent Hours / S_initial) * 100)
  const spoilagePercent = Math.min(100, (decayEquivalentHours / sInitial) * 100);

  return {
    thermalAccelerationRate: Number(thermalAccelerationRate.toFixed(2)),
    decayEquivalentHours: Number(decayEquivalentHours.toFixed(2)),
    spoilagePercent: Number(spoilagePercent.toFixed(1))
  };
}

// Calculate financial loss and preserved profit
export function calculateFinancialImpact({
  spoilagePercent,
  cargoWeightKg = 500,
  pricePerKg
}) {
  const totalCargoValue = cargoWeightKg * pricePerKg;
  const financialLoss = (spoilagePercent / 100) * totalCargoValue;
  const netRemainingValue = totalCargoValue - financialLoss;

  return {
    totalCargoValue: Math.round(totalCargoValue),
    financialLoss: Math.round(financialLoss),
    netRemainingValue: Math.round(netRemainingValue)
  };
}

// Comprehensive comparative evaluation between Standard and Q10 Safe route
export function evaluateRouteKinetics({
  crop,
  harvestAgeDays,
  departureHour,
  baseAmbientTemp,
  cargoWeightKg = 500,
  standardRouteData,
  q10RouteData
}) {
  const sInitial = calculateResidualShelfLife(crop.ambientShelfLife, harvestAgeDays);

  // Effective temps
  const standardTemp = calculateEffectiveRouteTemp(baseAmbientTemp, departureHour, 'standard');
  const q10Temp = calculateEffectiveRouteTemp(baseAmbientTemp, departureHour, 'q10-safe');

  // Standard route decay
  const standardDurationHours = standardRouteData.durationMinutes / 60;
  const standardDecay = calculateDecayMetrics({
    durationHours: standardDurationHours,
    effectiveTemp: standardTemp,
    tBase: crop.tBase,
    q10Factor: crop.q10,
    sInitial
  });
  const standardFinance = calculateFinancialImpact({
    spoilagePercent: standardDecay.spoilagePercent,
    cargoWeightKg,
    pricePerKg: crop.pricePerKg
  });

  // Q10 Safe route decay
  const q10DurationHours = q10RouteData.durationMinutes / 60;
  const q10Decay = calculateDecayMetrics({
    durationHours: q10DurationHours,
    effectiveTemp: q10Temp,
    tBase: crop.tBase,
    q10Factor: crop.q10,
    sInitial
  });
  const q10Finance = calculateFinancialImpact({
    spoilagePercent: q10Decay.spoilagePercent,
    cargoWeightKg,
    pricePerKg: crop.pricePerKg
  });

  // Wealth preserved
  const profitPreserved = Math.max(0, standardFinance.financialLoss - q10Finance.financialLoss);
  const spoilageReductionPercent = Number(Math.max(0, standardDecay.spoilagePercent - q10Decay.spoilagePercent).toFixed(1));

  return {
    sInitial: Number(sInitial.toFixed(1)),
    baseAmbientTemp: Number(baseAmbientTemp.toFixed(1)),
    standard: {
      route: standardRouteData,
      effectiveTemp: Number(standardTemp.toFixed(1)),
      decayEquivalentHours: standardDecay.decayEquivalentHours,
      spoilagePercent: standardDecay.spoilagePercent,
      financialLoss: standardFinance.financialLoss,
      accelerationRate: standardDecay.thermalAccelerationRate
    },
    q10Safe: {
      route: q10RouteData,
      effectiveTemp: Number(q10Temp.toFixed(1)),
      decayEquivalentHours: q10Decay.decayEquivalentHours,
      spoilagePercent: q10Decay.spoilagePercent,
      financialLoss: q10Finance.financialLoss,
      accelerationRate: q10Decay.thermalAccelerationRate
    },
    profitPreserved,
    spoilageReductionPercent
  };
}
