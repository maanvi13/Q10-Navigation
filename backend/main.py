from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import math
import httpx
import uvicorn

app = FastAPI(
    title="Q10 Nav Biokinetics & Logistics API",
    description="Production-grade thermal kinetics backend for agricultural transport optimization based on FAO & UC Davis standards.",
    version="2.0.0"
)

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATA MODELS ---

class CropProfile(BaseModel):
    id: str
    name: str
    emoji: str
    t_base: float = Field(..., description="Base physiological threshold temperature (°C)")
    q10: float = Field(..., description="Arrhenius Q10 thermal degradation coefficient")
    ambient_shelf_life: float = Field(..., description="Maximum shelf life under ambient conditions (hours)")
    price_per_kg: float = Field(..., description="Market price per kg (₹)")
    sensitivity: str = Field(..., description="Biological sensitivity tier: Medium, High, Critical")
    category: str
    description: str

class ParseCropRequest(BaseModel):
    crop_name: str

class EvaluateKineticsRequest(BaseModel):
    t_base: float
    q10_factor: float
    ambient_shelf_life: float
    harvest_age_days: float
    price_per_kg: float
    cargo_weight_kg: float
    base_ambient_temp: float
    departure_hour: int
    standard_distance_km: float
    standard_duration_minutes: float
    q10_distance_km: float
    q10_duration_minutes: float

# Pre-loaded FAO & UC Davis crop catalog
CROP_DATABASE: List[CropProfile] = [
    CropProfile(
        id="tomatoes",
        name="Tomatoes",
        emoji="🍅",
        t_base=12.0,
        q10=2.0,
        ambient_shelf_life=72.0,
        price_per_kg=28.0,
        sensitivity="Medium",
        category="Vegetable / Fruit",
        description="Chilling sensitive below 10°C, rapid respiratory decay above 25°C."
    ),
    CropProfile(
        id="spinach",
        name="Spinach / Tender Greens",
        emoji="🥬",
        t_base=4.0,
        q10=2.6,
        ambient_shelf_life=28.0,
        price_per_kg=35.0,
        sensitivity="Critical",
        category="Leafy Green",
        description="Extremely high respiration rate; wilts rapidly under direct solar heat."
    ),
    CropProfile(
        id="mangoes",
        name="Alphonso Mangoes",
        emoji="🥭",
        t_base=13.0,
        q10=1.8,
        ambient_shelf_life=96.0,
        price_per_kg=85.0,
        sensitivity="Medium",
        category="Tropical Fruit",
        description="High commercial value; heat stress causes rapid flesh softening and rot."
    ),
    CropProfile(
        id="marigold",
        name="Marigold / Cut Flowers",
        emoji="🌼",
        t_base=4.5,
        q10=2.8,
        ambient_shelf_life=20.0,
        price_per_kg=60.0,
        sensitivity="Critical",
        category="Floriculture",
        description="Rapid petal transpiration; severe market discount for heat wilting."
    ),
    CropProfile(
        id="bananas",
        name="Bananas",
        emoji="🍌",
        t_base=13.5,
        q10=2.1,
        ambient_shelf_life=84.0,
        price_per_kg=22.0,
        sensitivity="Medium",
        category="Climacteric Fruit",
        description="Ethylene surge triggered by elevated temperatures accelerates ripening."
    ),
    CropProfile(
        id="capsicum",
        name="Capsicum (Bell Peppers)",
        emoji="🫑",
        t_base=7.5,
        q10=2.2,
        ambient_shelf_life=64.0,
        price_per_kg=42.0,
        sensitivity="High",
        category="Vegetable",
        description="Prone to moisture loss and sunscald degradation on open vehicles."
    )
]

# --- HELPER FUNCTIONS ---

def calculate_residual_shelf_life(total_shelf_life: float, harvest_age_days: float) -> float:
    elapsed_hours = harvest_age_days * 24.0
    residual = total_shelf_life - elapsed_hours
    return max(4.0, residual)

def calculate_effective_temp(base_ambient: float, departure_hour: int, route_type: str) -> float:
    solar_factor = 0.0
    if 6 <= departure_hour <= 18:
        solar_factor = math.sin(((departure_hour - 6) / 12.0) * math.pi)
    
    if route_type == "standard":
        # Direct asphalt radiant solar heat offset (+11.5°C peak)
        return base_ambient + (solar_factor * 11.5)
    else:
        # Shaded rural canopy bypass (+2.8°C peak)
        return base_ambient + (solar_factor * 2.8)

# --- ENDPOINTS ---

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Q10 Nav Biokinetics Engine API",
        "version": "2.0.0",
        "documentation": "/docs"
    }

@app.get("/api/crops", response_model=List[CropProfile])
def get_crops():
    return CROP_DATABASE

@app.post("/api/crops/parse", response_model=CropProfile)
def parse_crop(req: ParseCropRequest):
    query = req.crop_name.strip().lower()
    
    # Match existing
    for crop in CROP_DATABASE:
        if query in crop.name.lower() or query in crop.id.lower():
            return crop
            
    # Dynamic heuristic parser
    if any(k in query for k in ['berry', 'strawberry', 'leaf', 'herb', 'flower', 'rose']):
        return CropProfile(
            id=f"custom-{query}",
            name=req.crop_name.title(),
            emoji="🌿",
            t_base=3.5,
            q10=2.7,
            ambient_shelf_life=36.0,
            price_per_kg=110.0,
            sensitivity="Critical",
            category="Perishable Specialty",
            description="Dynamic biological profile inferred from delicate botanical tissue standards."
        )
    elif any(k in query for k in ['apple', 'citrus', 'orange', 'lemon', 'onion', 'potato']):
        return CropProfile(
            id=f"custom-{query}",
            name=req.crop_name.title(),
            emoji="📦",
            t_base=8.0,
            q10=1.6,
            ambient_shelf_life=144.0,
            price_per_kg=30.0,
            sensitivity="Low-Medium",
            category="Durable Produce",
            description="Sturdy biological profile inferred with low Q10 decay rate."
        )
    else:
        return CropProfile(
            id=f"custom-{query}",
            name=req.crop_name.title(),
            emoji="🌾",
            t_base=9.0,
            q10=2.1,
            ambient_shelf_life=60.0,
            price_per_kg=40.0,
            sensitivity="Medium",
            category="Agricultural Produce",
            description="Estimated biological parameters derived from Arrhenius baseline."
        )

@app.get("/api/weather")
async def get_live_weather(lat: float = Query(..., example=14.4673), lon: float = Query(..., example=75.9242)):
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if "current_weather" in data:
                    cw = data["current_weather"]
                    return {
                        "temperature": cw.get("temperature", 32.5),
                        "windspeed": cw.get("windspeed", 12.0),
                        "is_day": cw.get("is_day") == 1,
                        "source": "Live Open-Meteo Telemetry API"
                    }
    except Exception as e:
        print("Weather API exception:", e)
    
    return {
        "temperature": 32.5,
        "windspeed": 12.0,
        "is_day": True,
        "source": "Davangere Regional Baseline"
    }

@app.post("/api/kinetics/evaluate")
def evaluate_kinetics(req: EvaluateKineticsRequest):
    s_initial = calculate_residual_shelf_life(req.ambient_shelf_life, req.harvest_age_days)
    
    # 1. Standard highway kinetics
    std_temp = calculate_effective_temp(req.base_ambient_temp, req.departure_hour, "standard")
    std_duration_hours = req.standard_duration_minutes / 60.0
    std_exponent = (std_temp - req.t_base) / 10.0
    std_acc_rate = math.pow(req.q10_factor, std_exponent)
    std_decay_hours = std_duration_hours * std_acc_rate
    std_spoilage = min(100.0, (std_decay_hours / s_initial) * 100.0)
    std_total_cargo_val = req.cargo_weight_kg * req.price_per_kg
    std_loss = (std_spoilage / 100.0) * std_total_cargo_val

    # 2. Q10 safe bypass kinetics
    q10_temp = calculate_effective_temp(req.base_ambient_temp, req.departure_hour, "q10-safe")
    q10_duration_hours = req.q10_duration_minutes / 60.0
    q10_exponent = (q10_temp - req.t_base) / 10.0
    q10_acc_rate = math.pow(req.q10_factor, q10_exponent)
    q10_decay_hours = q10_duration_hours * q10_acc_rate
    q10_spoilage = min(100.0, (q10_decay_hours / s_initial) * 100.0)
    q10_loss = (q10_spoilage / 100.0) * std_total_cargo_val

    profit_preserved = max(0.0, std_loss - q10_loss)
    spoilage_reduction = max(0.0, std_spoilage - q10_spoilage)

    return {
        "s_initial_hours": round(s_initial, 1),
        "base_ambient_temp": round(req.base_ambient_temp, 1),
        "cargo_total_value": round(std_total_cargo_val),
        "standard": {
            "effective_temp": round(std_temp, 1),
            "acceleration_rate": round(std_acc_rate, 2),
            "decay_equivalent_hours": round(std_decay_hours, 2),
            "spoilage_percent": round(std_spoilage, 1),
            "financial_loss": round(std_loss),
            "net_remaining_value": round(std_total_cargo_val - std_loss)
        },
        "q10_safe": {
            "effective_temp": round(q10_temp, 1),
            "acceleration_rate": round(q10_acc_rate, 2),
            "decay_equivalent_hours": round(q10_decay_hours, 2),
            "spoilage_percent": round(q10_spoilage, 1),
            "financial_loss": round(q10_loss),
            "net_remaining_value": round(std_total_cargo_val - q10_loss)
        },
        "profit_preserved": round(profit_preserved),
        "spoilage_reduction_percent": round(spoilage_reduction, 1),
        "kinetics_formula": {
            "equation": "Decay_Hours = t * Q10 ^ ((T_effective - T_base) / 10)",
            "spoilage_formula": "Spoilage_% = min(100, (Decay_Hours / S_initial) * 100)"
        }
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
