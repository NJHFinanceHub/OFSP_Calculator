document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('calc-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault(); // Stop the form from reloading the page
        const inputs = getInputs();
        const results = calculateSimulation(inputs);
        displayResults(results);
    });
});

/**
 * Grabs all values from the form and returns them as an object.
 */
function getInputs() {
    const inputs = {};
    const formElements = document.getElementById('calc-form').elements;
    for (const element of formElements) {
        if (element.id) {
            inputs[element.id] = parseFloat(element.value) || 0;
        }
    }
    return inputs;
}

/**
 * The main calculation engine, ported from your spreadsheet logic.
 */
function calculateSimulation(inputs) {
    const results = {};

    // --- Helper Calculations ---
    const loss_factor = inputs.mortality_rate * inputs.crop_damage_loss * inputs.storage_loss;
    const calories_per_ton = (inputs.grams_per_ton / inputs.grams_per_potato) * inputs.calories_per_potato_with_leaves;
    const calories_needed_per_day = inputs.people_to_feed * inputs.calorie_target_per_person;
    
    // --- Cost Calculation (per Hectare) ---
    // Sum all per-acre costs
    const total_labor_cost_per_acre = inputs.cost_land_clearing_per_acre + inputs.cost_forking_per_acre + 
                                      inputs.cost_planting_per_acre + inputs.cost_weeding_per_acre + 
                                      inputs.cost_fertilizer_app_per_acre + inputs.cost_harvesting_per_acre;
    
    const total_supplies_cost_per_acre = inputs.cost_herbicide_per_acre + inputs.cost_fertilizer_per_acre + 
                                         inputs.cost_tools_per_acre + inputs.cost_other_per_acre + 
                                         inputs.cost_transport_per_acre;

    const irrigation_cost_per_acre = inputs.cost_irrigation_per_acre;

    // Convert to per-hectare cost
    const total_cost_per_hectare_NO_SLIPS = (total_labor_cost_per_acre + total_supplies_cost_per_acre + irrigation_cost_per_acre) * inputs.acres_per_hectare;

    // --- Generation 1 ---
    const gen1 = {};
    gen1.name = "Generation 1";
    gen1.hectares = inputs.initial_hectares;
    gen1.slips_planted = inputs.initial_slips;
    gen1.potatoes_harvested = gen1.slips_planted * inputs.potatoes_per_plant * loss_factor;
    gen1.tons_harvested = (gen1.potatoes_harvested * inputs.grams_per_potato / inputs.grams_per_ton) * inputs.tons_harvest_percent;
    gen1.days_fed = (gen1.tons_harvested * calories_per_ton) / calories_needed_per_day;
    const g1_slip_cost = gen1.slips_planted * inputs.cost_slip_per_unit;
    gen1.cost = (total_cost_per_hectare_NO_SLIPS * gen1.hectares) + g1_slip_cost;
    
    results.gen1 = gen1;

    // --- Generation 1a, 1b, 1c (Based on Sheet2 logic, they are copies) ---
    // These are subsequent harvests from the initial planting, so no new slip cost.
    const gen1a = { ...gen1, name: "Gen 1a", cost: total_cost_per_hectare_NO_SLIPS * gen1.hectares };
    const gen1b = { ...gen1, name: "Gen 1b", cost: total_cost_per_hectare_NO_SLIPS * gen1.hectares };
    const gen1c = { ...gen1, name: "Gen 1c", cost: total_cost_per_hectare_NO_SLIPS * gen1.hectares };
    results.gen1a = gen1a;
    results.gen1b = gen1b;
    results.gen1c = gen1c;

    // --- Generation 2 ---
    const gen2_base_potatoes = gen1.potatoes_harvested * inputs.replant_percent;
    const gen2_slips_planted = gen2_base_potatoes * inputs.slips_from_replant;
    
    const gen2 = {};
    gen2.name = "Generation 2";
    gen2.hectares = inputs.hectares_gen_2; // Using the input Hectare value
    gen2.slips_planted = gen2_slips_planted;
    // Note: The potatoes harvested are based on the *potatoes per plant* from the *slips*, not slip cuttings.
    // The "X 3 slip cuttings" from the sheet seems to be a note for G2a, 2b.
    const g2_potatoes_base_harvest = gen2.slips_planted * inputs.potatoes_per_plant;
    gen2.potatoes_harvested = g2_potatoes_base_harvest * loss_factor;
    gen2.tons_harvested = (gen2.potatoes_harvested * inputs.grams_per_potato / inputs.grams_per_ton) * inputs.tons_harvest_percent;
    gen2.days_fed = (gen2.tons_harvested * calories_per_ton) / calories_needed_per_day;
    gen2.cost = total_cost_per_hectare_NO_SLIPS * gen2.hectares; // No slip cost for subsequent gens
    
    results.gen2 = gen2;
    
    // --- Generation 2a, 2b, 2c (Copies of Gen 2) ---
    const gen2a = { ...gen2, name: "Gen 2a" };
    const gen2b = { ...gen2, name: "Gen 2b" };
    const gen2c = { ...gen2, name: "Gen 2c" };
    results.gen2a = gen2a;
    results.gen2b = gen2b;
    results.gen2c = gen2c;

    // --- Generation 3 ---
    const gen3_base_potatoes = gen2.potatoes_harvested * inputs.replant_percent;
    const gen3_slips_planted = gen3_base_potatoes * inputs.slips_from_replant;
    
    const gen3 = {};
    gen3.name = "Generation 3";
    gen3.hectares = inputs.hectares_gen_3; // Using the input Hectare value
    gen3.slips_planted = gen3_slips_planted;
    const g3_potatoes_base_harvest = gen3_slips_planted * inputs.potatoes_per_plant;
    gen3.potatoes_harvested = g3_potatoes_base_harvest * loss_factor;
    gen3.tons_harvested = (gen3.potatoes_harvested * inputs.grams_per_potato / inputs.grams_per_ton) * inputs.tons_harvest_percent;
    gen3.days_fed = (gen3.tons_harvested * calories_per_ton) / calories_needed_per_day;
    gen3.cost = total_cost_per_hectare_NO_SLIPS * gen3.hectares; // No slip cost
    
    results.gen3 = gen3;

    // --- Generation 3a, 3b, 3c (Copies of Gen 3) ---
    const gen3a = { ...gen3, name: "Gen 3a" };
    const gen3b = { ...gen3, name: "Gen 3b" };
    const gen3c = { ...gen3, name: "Gen 3c" };
    results.gen3a = gen3a;
    results.gen3b = gen3b;
    results.gen3c = gen3c;

    // --- Totals ---
    results.all_gens = [
        gen1, gen1a, gen1b, gen1c,
        gen2, gen2a, gen2b, gen2c,
        gen3, gen3a, gen3b, gen3c
    ];

    results.total_days_fed = results.all_gens.reduce((sum, gen) => sum + gen.days_fed, 0);
    results.total_cost = results.all_gens.reduce((sum, gen) => sum + gen.cost, 0);
    results.cost_per_person_per_day = results.total_cost / (results.total_days_fed * inputs.people_to_feed) || 0;
    
    return results;
}

/**
 * Displays the calculated results in the HTML.
 */
function displayResults(results) {
    const container = document.getElementById('results-container');
    const fNum = (num, dec = 2) => num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const fInt = (num) => num.toLocaleString(undefined, { maximumFractionDigits: 0 });
    const fDol = (num) => num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    let html = `
        <div class="results-summary">
            <h2>Simulation Summary</h2>
            <div class="summary-grid">
                <div class="summary-item">
                    <h3>Total Days People Fed</h3>
                    <p>${fNum(results.total_days_fed, 1)}</p>
                </div>
                <div class="summary-item">
                    <h3>Total Cost</h3>
                    <p>${fDol(results.total_cost)}</p>
                </div>
                <div class="summary-item">
                    <h3>Cost per Person (Full Period)</h3>
                    <p>${fDol(results.total_cost / 1000000)}</p>
                </div>
                <div class="summary-item">
                    <h3>Cost per Person per Day</h3>
                    <p>${fDol(results.cost_per_person_per_day, 2)}</p>
                </div>
            </div>
        </div>
        
        <table class="gen-table">
            <thead>
                <tr>
                    <th>Generation</th>
                    <th>Tons Harvested</th>
                    <th>Days Fed</th>
                    <th>Cost</th>
                </tr>
            </thead>
            <tbody>
                ${results.all_gens.map(gen => `
                    <tr>
                        <td>${gen.name}</td>
                        <td class="highlight">${fNum(gen.tons_harvested)}</td>
                        <td>${fNum(gen.days_fed, 2)}</td>
                        <td>${fDol(gen.cost)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}