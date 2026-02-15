# OFSP Regeneration Calculator

A web-based simulation tool for modeling multi-generational Orange-Fleshed Sweet Potato (OFSP) cultivation. Projects harvest yields, feeding capacity, Vitamin A impact, and costs across successive planting cycles.

Defaults are tuned for **northern Haiti rainfed conditions** using data from CIP, FAO, USAID, HarvestPlus, and WFP.

**Live site:** [njhfinancehub.github.io/OFSP_Calculator](https://njhfinancehub.github.io/OFSP_Calculator/)

---

## Multi-Generational Harvest Model

The calculator simulates a **3-generation propagation chain**, where each main generation produces three vine-cutting sub-generations. This models how a single initial planting multiplies over time through both tuber replanting and vine propagation.

### Generation Structure

```
Gen 1  (initial planting)
├── Gen 1a (vine cutting harvest — 40% yield)
├── Gen 1b (vine cutting harvest — 25% yield)
└── Gen 1c (vine cutting harvest — 15% yield)

Gen 2  (replanted tubers from Gen 1)
├── Gen 2a (vine cutting harvest — 40% yield)
├── Gen 2b (vine cutting harvest — 25% yield)
└── Gen 2c (vine cutting harvest — 15% yield)

Gen 3  (replanted tubers from Gen 2)
├── Gen 3a (vine cutting harvest — 40% yield)
├── Gen 3b (vine cutting harvest — 25% yield)
└── Gen 3c (vine cutting harvest — 15% yield)
```

**12 harvests total** across the full chain.

### How Generations Connect

1. **Generation 1** is the initial planting: purchased slips planted on the starting hectares.
2. **Vine cutting sub-generations (a/b/c)** are sequential ratoon-style harvests from the same land. Surviving plants produce vine cuttings that regrow, but each successive harvest yields less (40% → 25% → 15% of the main generation's output).
3. **Generation 2** starts from replanted tubers: a fraction of Gen 1's harvested potatoes are set aside, sprouted into new slips, and planted on expanded hectares.
4. **Generation 3** follows the same pattern from Gen 2's tubers, typically on the largest land area.

### Tuber-to-Slip Propagation (Between Main Generations)

```
Potatoes Harvested (Gen N)
  × Replant % (default 10%)
  = Tubers Set Aside
  × Slips per Replanted Tuber (default 30)
  = Slips Planted (Gen N+1)
```

### Vine Cutting Propagation (Sub-Generations)

```
Slips Planted (Gen N)
  × Crop Survival Rate (default 70%)
  = Surviving Plants
  × Vine Cuttings per Plant (default 5)
  = Vine Cutting Slips for sub-gens
```

Sub-gens use the same land as their parent — no additional hectares are needed.

---

## Calculation Logic

### Yield Modes

The calculator supports two yield calculation modes:

#### Per Hectare (default)

```
Tons Harvested = Hectares × Tons/Ha × Harvest % × Yield Fraction
Potatoes Harvested = (Tons × Grams/Ton) ÷ Grams/Potato
```

- `Yield Fraction` is 1.0 for main generations, and 0.40/0.25/0.15 for sub-gens a/b/c
- `Tons/Ha` default: 10 (moderate smallholder with improved varieties in northern Haiti)
- `Harvest %` default: 0.90 (90% of production is harvestable)

#### Per Plant

```
Potatoes Harvested = Slips Planted × Potatoes/Plant × Loss Factor
Tons Harvested = (Potatoes × Grams/Potato ÷ Grams/Ton) × Harvest %
```

- `Loss Factor = Slip Survival × Crop Survival × Storage Survival`
- Default: 0.70 × 0.70 × 0.65 = **0.3185**

### Feeding Capacity (Days Fed)

```
Calories per Ton = (Grams/Ton ÷ Grams/Potato) × Calories/Potato
                 = (1,000,000 ÷ 175) × 150
                 = 857,143 kcal/ton

Calories Needed per Day = People to Feed × Calorie Target
                        = 1,000,000 × 600
                        = 600,000,000 kcal/day

Days Fed = (Tons Harvested × Calories/Ton) ÷ Calories Needed/Day
```

"Days Fed" means the number of days the total harvest can supply the target calorie gap for the entire target population.

### Vitamin A Impact

OFSP is biofortified with beta-carotene (pro-Vitamin A). The model tracks:

```
Vitamin A Produced (mcg RAE) = Tons × (Grams/Ton ÷ 100) × VA per 100g
                              = Tons × 10,000 × 700

VA Child-Days Supplied = VA Produced ÷ Daily VA Need
                       = VA Produced ÷ 400 mcg RAE
```

- Default 700 mcg RAE/100g is typical for improved OFSP varieties
- Default 400 mcg RAE/day is the WHO RDA for children aged 1-3
- "Children Annual VA Need Met" = total child-days ÷ 365

### Cost Model

Costs are calculated per hectare, converted from per-acre inputs:

#### Main Generations (full land preparation)

```
Labor/Acre = Clearing + Forking + Planting + Weeding + Fertilizer App + Harvesting
Supplies/Acre = Herbicide + Fertilizer + Tools + Other + Transport

Cost/Hectare = (Labor + Supplies + Irrigation) × Acres/Hectare

Total Cost = (Cost/Hectare × Hectares) + (Slips × Cost/Slip)
```

Slip purchase cost is only charged for Generation 1 (subsequent generations use self-propagated slips).

#### Vine Cutting Sub-Generations (maintenance only)

Sub-generations reuse already-prepared land, so they only incur:

```
Maintenance/Acre = Weeding + Fertilizer App + Harvesting + Transport

Sub-Gen Cost = Maintenance/Acre × Acres/Hectare × Hectares
```

No land clearing, forking, herbicide, planting labor, or slip costs.

### Annual Projection

The 3-generation chain spans multiple growing cycles. The annual projection scales the chain total to a 365-day year:

```
Chain Duration = 3 × Days to Harvest (sub-gens overlap with their parent cycle)

Annual Scale Factor = min(365 ÷ Chain Duration, Cycles per Year)

Annual Tons = Chain Total Tons × Scale Factor
Annual Days Fed = Chain Total Days Fed × Scale Factor
Annual Cost = Chain Total Cost × Scale Factor
```

With defaults (120 days/cycle, 2 cycles/year): chain = 360 days, scale factor = min(1.014, 2) = **1.014x**.

### Survival Rates (Loss Factor)

Three independent survival rates compound into the loss factor:

| Rate | Default | What it models |
|---|---|---|
| Slip Survival | 70% | Fraction of planted slips that establish and survive to harvest |
| Crop Survival | 70% | Losses from pests (esp. sweet potato weevil *Cylas formicarius*), weather, disease |
| Storage Survival | 65% | Post-harvest losses (no cold chain in northern Haiti — 35% loss is typical) |

**Combined loss factor:** 0.70 × 0.70 × 0.65 = **0.3185** (31.85% of planted slips produce storable potatoes)

### Sensitivity Analysis

The sensitivity tool varies any single input by -25%, -10%, base, +10%, +25% and shows the impact on total days fed and total cost. This helps identify which inputs have the most leverage on outcomes.

---

## Default Values (Northern Haiti)

All defaults are tuned for rainfed OFSP cultivation in northern Haiti:

| Parameter | Default | Source/Rationale |
|---|---|---|
| Initial Slips | 1,200,000 | Mid-scale project starting point |
| Initial Hectares | 34.3 | ~85 acres, typical first-season allocation |
| Hectares Gen 2 | 78.37 | Expansion with self-propagated slips |
| Hectares Gen 3 | 895.71 | Full-scale community planting |
| Tons/Hectare | 10 | Moderate yield for improved varieties, rainfed (range: 5-20) |
| Harvest % | 90% | Standard harvest efficiency |
| Cycles/Year | 2 | April-August and September-January seasons |
| Days to Harvest | 120 | OFSP matures in 90-150 days |
| Potatoes/Plant | 5 | Tropical average 4-8 tubers |
| Vine Cuttings/Plant | 5 | CIP data: 5-8 per harvest |
| Replant % | 10% | Fraction of harvest reserved for next generation |
| Slips/Replanted Tuber | 30 | Research: 20-50 slips per sprouted tuber |
| Slip Survival | 70% | Storms, drought, transplant shock |
| Crop Survival | 70% | Weevil damage, weather events |
| Storage Survival | 65% | No cold chain — 35% post-harvest loss |
| People to Feed | 1,000,000 | Northern Haiti food-insecure population |
| Calorie Target | 600 kcal | IPC Phase 3+ daily calorie gap |
| Calories/Potato | 150 kcal | 86 kcal/100g × 175g average tuber |
| Grams/Potato | 175g | OFSP average 130-250g in tropics |
| Vitamin A/100g | 700 mcg RAE | Typical improved OFSP variety (range: 250-1300) |
| Daily VA Need | 400 mcg RAE | WHO RDA for children aged 1-3 |
| Cost/Slip | $0.05 | Locally produced vine cuttings |
| Labor rates | $3-5/day | Northern Haiti agricultural labor |

Data sources: [CIP](https://cipotato.org/), [FAO](https://www.fao.org/), [USAID](https://www.usaid.gov/), [HarvestPlus](https://www.harvestplus.org/), [WFP](https://www.wfp.org/)

---

## Features

- **Two yield modes** — per-hectare (agronomist view) or per-plant (field-level view)
- **Scenario save/load/compare** — save parameter sets to localStorage, compare side-by-side
- **Sensitivity analysis** — vary any input +/-25% to find high-leverage parameters
- **Chart visualizations** — bar charts for tons, days fed, cost, and Vitamin A by generation
- **Growing season timeline** — visual calendar of planting/harvest windows
- **CSV export** — download full results for spreadsheet analysis
- **Print/PDF** — print-optimized layout

## How to Run Locally

1. Download all three files (`index.html`, `style.css`, `app.js`) into the same folder.
2. Double-click `index.html` — it opens in your browser with no server required.
3. Adjust inputs and results update in real time.

## Tech Stack

Vanilla HTML, CSS, and JavaScript. No build step, no dependencies beyond [Chart.js](https://www.chartjs.org/) (loaded from CDN with SRI hash).

---

Model by Tim Maurer and [NJH Finance Hub](https://github.com/NJHFinanceHub)
