// Crop physiological catalog based on FAO & UC Davis postharvest standards

export const CROP_CATALOG = [
  {
    id: 'tomatoes',
    name: 'Tomatoes',
    emoji: '🍅',
    tBase: 12.0,
    q10: 2.0,
    ambientShelfLife: 72, // hours
    pricePerKg: 28,
    sensitivity: 'Medium', // Medium, High, Critical
    category: 'Vegetable / Fruit',
    description: 'Chilling sensitive below 10°C, rapid respiratory decay above 25°C.'
  },
  {
    id: 'spinach',
    name: 'Spinach / Tender Greens',
    emoji: '🥬',
    tBase: 4.0,
    q10: 2.6,
    ambientShelfLife: 28,
    pricePerKg: 35,
    sensitivity: 'Critical',
    category: 'Leafy Green',
    description: 'Extremely high respiration rate; wilts rapidly under direct solar heat.'
  },
  {
    id: 'mangoes',
    name: 'Alphonso Mangoes',
    emoji: '🥭',
    tBase: 13.0,
    q10: 1.8,
    ambientShelfLife: 96,
    pricePerKg: 85,
    sensitivity: 'Medium',
    category: 'Tropical Fruit',
    description: 'High commercial value; heat stress causes rapid flesh softening and rot.'
  },
  {
    id: 'marigold',
    name: 'Marigold / Cut Flowers',
    emoji: '🌼',
    tBase: 4.5,
    q10: 2.8,
    ambientShelfLife: 20,
    pricePerKg: 60,
    sensitivity: 'Critical',
    category: 'Floriculture',
    description: 'Rapid petal transpiration; severe market discount for heat wilting.'
  },
  {
    id: 'bananas',
    name: 'Bananas',
    emoji: '🍌',
    tBase: 13.5,
    q10: 2.1,
    ambientShelfLife: 84,
    pricePerKg: 22,
    sensitivity: 'Medium',
    category: 'Climacteric Fruit',
    description: 'Ethylene surge triggered by elevated temperatures accelerates ripening.'
  },
  {
    id: 'capsicum',
    name: 'Capsicum (Bell Peppers)',
    emoji: '🫑',
    tBase: 7.5,
    q10: 2.2,
    ambientShelfLife: 64,
    pricePerKg: 42,
    sensitivity: 'High',
    category: 'Vegetable',
    description: 'Prone to moisture loss and sunscald degradation on open vehicles.'
  }
];

// Fallback dynamic parser for arbitrary user input (e.g. "Strawberries", "Grapes", "Potatoes")
export function getOrParseCrop(input) {
  if (!input || typeof input !== 'string') {
    return CROP_CATALOG[0]; // Default Tomatoes
  }

  const query = input.trim().toLowerCase();
  
  // Direct or partial match search
  const found = CROP_CATALOG.find(c => 
    c.name.toLowerCase().includes(query) || 
    c.id.toLowerCase().includes(query)
  );

  if (found) return found;

  // Keyword heuristic parser for custom crops
  if (query.includes('berry') || query.includes('strawberry') || query.includes('leaf') || query.includes('herb') || query.includes('flower')) {
    return {
      id: 'custom-' + query,
      name: input,
      emoji: '🌿',
      tBase: 3.5,
      q10: 2.7,
      ambientShelfLife: 36,
      pricePerKg: 110,
      sensitivity: 'Critical',
      category: 'Perishable Specialty',
      description: 'Inferred delicate physiological profile based on FAO tissue criteria.'
    };
  }

  if (query.includes('apple') || query.includes('citrus') || query.includes('orange') || query.includes('lemon') || query.includes('onion') || query.includes('potato')) {
    return {
      id: 'custom-' + query,
      name: input,
      emoji: '📦',
      tBase: 8.0,
      q10: 1.6,
      ambientShelfLife: 144,
      pricePerKg: 30,
      sensitivity: 'Low-Medium',
      category: 'Durable Produce',
      description: 'Inferred sturdy physiological profile with moderate Q10 decay coefficient.'
    };
  }

  // Generic fallback
  return {
    id: 'custom-' + query,
    name: input,
    emoji: '🌾',
    tBase: 9.0,
    q10: 2.1,
    ambientShelfLife: 60,
    pricePerKg: 40,
    sensitivity: 'Medium',
    category: 'Agricultural Produce',
    description: 'Estimated biological parameters derived from Arrhenius produce baseline.'
  };
}

// Processing Hub Catalog
export const PROCESSING_HUBS = [
  {
    id: 'davangere-apmc',
    name: 'Davangere APMC Central Yard',
    coords: { lat: 14.4820, lon: 75.9180 },
    distanceKm: 14.2,
    type: 'Primary Market',
    coldStorageAvailable: true,
    capacity: 'High'
  },
  {
    id: 'mega-food-park',
    name: 'Mega Food Park Terminal',
    coords: { lat: 14.4410, lon: 75.9720 },
    distanceKm: 18.6,
    type: 'Processing Facility',
    coldStorageAvailable: true,
    capacity: 'Ultra-High'
  },
  {
    id: 'cold-depot',
    name: 'Cold Storage Depot North',
    coords: { lat: 14.4950, lon: 75.8850 },
    distanceKm: 11.5,
    type: 'Chilled Storage Hub',
    coldStorageAvailable: true,
    capacity: 'Medium'
  }
];

export const DEFAULT_FARM_ORIGIN = {
  name: 'Davangere Agricultural Belt (Farm Cluster)',
  coords: { lat: 14.4673, lon: 75.9242 }
};
