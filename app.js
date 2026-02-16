document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('calc-form');

    // Track last simulation results for farmOS sync
    let lastResults = null;
    let lastInputs = null;

    function run() {
        if (!validateForm()) return;
        const inputs = getInputs();
        const results = calculateSimulation(inputs);
        displayResults(results, inputs);
        lastResults = results;
        lastInputs = inputs;
        // Enable sync button if connected
        const syncBtn = document.getElementById('btn-farmos-sync');
        if (syncBtn && window._farmosConnector && window._farmosConnector.isConnected) {
            syncBtn.disabled = false;
        }
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        run();
    });

    // Auto-calculate when any input changes
    form.addEventListener('input', run);
    form.addEventListener('change', run);

    // ── farmOS connector wiring ──────────────────────────────────
    window._farmosConnector = new FarmOSConnector();

    const btnConnect = document.getElementById('btn-farmos-connect');
    const btnSync = document.getElementById('btn-farmos-sync');
    const statusDot = document.querySelector('.farmos-dot');
    const statusText = document.getElementById('farmos-status-text');
    const progressDiv = document.getElementById('farmos-progress');
    const progressFill = document.getElementById('farmos-progress-fill');
    const progressText = document.getElementById('farmos-progress-text');
    const resultsDiv = document.getElementById('farmos-results');

    if (btnConnect) {
        btnConnect.addEventListener('click', async () => {
            const url = document.getElementById('farmos_url').value.trim();
            const user = document.getElementById('farmos_username').value.trim();
            const pass = document.getElementById('farmos_password').value;

            if (!url || !user || !pass) {
                statusText.textContent = 'Please fill in all connection fields';
                return;
            }

            btnConnect.disabled = true;
            statusText.textContent = 'Connecting...';

            try {
                await window._farmosConnector.connect(url, user, pass);
                statusDot.className = 'farmos-dot connected';
                statusText.textContent = `Connected to ${url}`;
                btnConnect.textContent = 'Reconnect';
                if (lastResults) btnSync.disabled = false;
            } catch (err) {
                statusDot.className = 'farmos-dot disconnected';
                statusText.textContent = `Error: ${err.message}`;
                btnSync.disabled = true;
            } finally {
                btnConnect.disabled = false;
            }
        });
    }

    if (btnSync) {
        btnSync.addEventListener('click', async () => {
            if (!window._farmosConnector.isConnected || !lastResults) return;

            btnSync.disabled = true;
            progressDiv.style.display = 'block';
            resultsDiv.style.display = 'none';

            const seasonName = document.getElementById('farmos_season').value.trim() || 'OFSP Program';

            try {
                const summary = await window._farmosConnector.syncSimulation(
                    lastResults,
                    lastInputs,
                    { seasonName },
                    (msg, current, total) => {
                        const pct = Math.round((current / total) * 100);
                        progressFill.style.width = pct + '%';
                        progressText.textContent = msg;
                    }
                );

                progressDiv.style.display = 'none';
                resultsDiv.style.display = 'block';
                resultsDiv.innerHTML = `
                    <p class="farmos-success">Sync complete!</p>
                    <ul>
                        <li>${summary.terms} taxonomy terms</li>
                        <li>${summary.lands} land assets</li>
                        <li>${summary.plants} plant assets</li>
                        <li>${summary.seedings} seeding logs</li>
                        <li>${summary.harvests} harvest logs</li>
                        <li>${summary.inputs} input/cost logs</li>
                    </ul>
                `;
            } catch (err) {
                progressDiv.style.display = 'none';
                resultsDiv.style.display = 'block';
                resultsDiv.innerHTML = `<p class="farmos-error">Sync failed: ${escapeHtml(err.message)}</p>`;
            } finally {
                btnSync.disabled = false;
            }
        });
    }

    // Run once on load with default values
    run();
});

/**
 * Validates all number inputs. Returns true if valid, false otherwise.
 * Highlights invalid fields and shows inline error messages.
 */
function validateForm() {
    const form = document.getElementById('calc-form');
    const numberInputs = form.querySelectorAll('input[type="number"]');
    let allValid = true;

    numberInputs.forEach(input => {
        const errorEl = input.parentElement.querySelector('.input-error');
        if (errorEl) errorEl.remove();
        input.classList.remove('input-invalid');

        const raw = input.value.trim();
        if (raw === '') {
            markInvalid(input, 'Value is required');
            allValid = false;
            return;
        }

        const val = parseFloat(raw);
        if (!Number.isFinite(val)) {
            markInvalid(input, 'Must be a valid number');
            allValid = false;
            return;
        }

        const min = input.hasAttribute('min') ? parseFloat(input.getAttribute('min')) : null;
        const max = input.hasAttribute('max') ? parseFloat(input.getAttribute('max')) : null;

        if (min !== null && val < min) {
            markInvalid(input, `Minimum value is ${min}`);
            allValid = false;
            return;
        }

        if (max !== null && val > max) {
            markInvalid(input, `Maximum value is ${max}`);
            allValid = false;
            return;
        }
    });

    return allValid;
}

function markInvalid(input, message) {
    input.classList.add('input-invalid');
    const err = document.createElement('span');
    err.className = 'input-error';
    err.textContent = message;
    input.insertAdjacentElement('afterend', err);
}

/**
 * Grabs all values from the form and returns them as an object.
 */
function getInputs() {
    const inputs = {};
    const form = document.getElementById('calc-form');
    const formElements = form.elements;
    for (const element of formElements) {
        if (element.id && element.type === 'number') {
            const val = parseFloat(element.value);
            inputs[element.id] = Number.isFinite(val) ? val : 0;
        }
    }
    const yieldModeRadio = form.querySelector('input[name="yield_mode"]:checked');
    inputs.yield_mode = yieldModeRadio ? yieldModeRadio.value : 'per_hectare';
    return inputs;
}

/**
 * Calculates a single generation's harvest and cost.
 * Supports two yield modes:
 *   - "per_hectare": tons = hectares * tons_per_hectare * harvest%, potatoes derived backward
 *   - "per_plant": tons = slips * potatoes/plant * lossFactor * grams/ton (original logic)
 *
 * isSubGen: true for vine-cutting sub-generations (1a/1b/1c etc.)
 *   Sub-gens yield a reduced fraction (yieldFraction) and only incur
 *   maintenance costs (no land clearing, forking, herbicide, slip purchase).
 */
function calcGeneration(name, hectares, slipsPlanted, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, includeSlipCost, isSubGen, yieldFraction) {
    isSubGen = isSubGen || false;
    yieldFraction = yieldFraction || 1.0;

    let potatoesHarvested, tonsHarvested;

    if (inputs.yield_mode === 'per_hectare') {
        tonsHarvested = hectares * inputs.tons_per_hectare * inputs.tons_harvest_percent * yieldFraction;
        potatoesHarvested = inputs.grams_per_potato > 0
            ? (tonsHarvested * inputs.grams_per_ton) / inputs.grams_per_potato
            : 0;
    } else {
        potatoesHarvested = slipsPlanted * inputs.potatoes_per_plant * lossFactor;
        tonsHarvested = (potatoesHarvested * inputs.grams_per_potato / inputs.grams_per_ton) * inputs.tons_harvest_percent;
    }

    const caloriesPerTon = inputs.grams_per_ton > 0 && inputs.grams_per_potato > 0
        ? (inputs.grams_per_ton / inputs.grams_per_potato) * inputs.calories_per_potato_with_leaves
        : 0;
    const caloriesNeededPerDay = inputs.people_to_feed * inputs.calorie_target_per_person;
    const daysFed = caloriesNeededPerDay > 0
        ? (tonsHarvested * caloriesPerTon) / caloriesNeededPerDay
        : 0;

    let cost;
    if (isSubGen) {
        // Sub-generations only pay maintenance costs (weeding, harvesting, fertilizer app)
        cost = maintenanceCostPerHectare * hectares;
    } else {
        const slipCost = includeSlipCost ? slipsPlanted * inputs.cost_slip_per_unit : 0;
        cost = (costPerHectareNoSlips * hectares) + slipCost;
    }

    // Vitamin A: mcg RAE produced = tons * grams_per_ton / 100 * vitamin_a_per_100g
    const vitaminAMcg = (inputs.vitamin_a_per_100g > 0)
        ? tonsHarvested * inputs.grams_per_ton / 100 * inputs.vitamin_a_per_100g
        : 0;
    const vitaminAChildDays = (inputs.daily_vitamin_a_need > 0)
        ? vitaminAMcg / inputs.daily_vitamin_a_need
        : 0;

    return {
        name,
        hectares,
        slips_planted: slipsPlanted,
        potatoes_harvested: potatoesHarvested,
        tons_harvested: tonsHarvested,
        days_fed: daysFed,
        vitamin_a_mcg: vitaminAMcg,
        vitamin_a_child_days: vitaminAChildDays,
        cost,
    };
}

/**
 * The main calculation engine, ported from the spreadsheet logic.
 *
 * Sub-generations (1a/1b/1c etc.) represent sequential vine-cutting
 * harvests from the same land, yielding progressively less (40%, 25%, 15%)
 * and only incurring maintenance costs (no land prep / slip purchase).
 *
 * The annual projection divides total output by the time the propagation
 * chain actually takes, then scales to 365 days — instead of naively
 * multiplying by cycles_per_year.
 */
function calculateSimulation(inputs) {
    const lossFactor = inputs.slip_survival_rate * inputs.crop_survival_rate * inputs.storage_survival_rate;

    // --- Cost per hectare (excluding slips) - full prep for main generations ---
    const laborPerAcre = inputs.cost_land_clearing_per_acre + inputs.cost_forking_per_acre +
        inputs.cost_planting_per_acre + inputs.cost_weeding_per_acre +
        inputs.cost_fertilizer_app_per_acre + inputs.cost_harvesting_per_acre;

    const suppliesPerAcre = inputs.cost_herbicide_per_acre + inputs.cost_fertilizer_per_acre +
        inputs.cost_tools_per_acre + inputs.cost_other_per_acre +
        inputs.cost_transport_per_acre;

    const costPerHectareNoSlips = (laborPerAcre + suppliesPerAcre + inputs.cost_irrigation_per_acre) * inputs.acres_per_hectare;

    // --- Maintenance-only cost for sub-gens (weeding, fertilizer app, harvesting, transport) ---
    const maintenancePerAcre = inputs.cost_weeding_per_acre + inputs.cost_fertilizer_app_per_acre +
        inputs.cost_harvesting_per_acre + inputs.cost_transport_per_acre;
    const maintenanceCostPerHectare = maintenancePerAcre * inputs.acres_per_hectare;

    // Sub-generation yield fractions (declining ratoon harvests)
    const subGenYields = [0.40, 0.25, 0.15];

    // --- Generation 1 ---
    const gen1 = calcGeneration("Generation 1", inputs.initial_hectares, inputs.initial_slips, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, true, false, 1.0);

    // --- Gen 1a, 1b, 1c: vine cutting regrowth from Gen 1 plants ---
    // Vine cutting slips use crop_survival (not slip_survival again) to avoid double-penalizing
    const vineCuttingSlips = gen1.potatoes_harvested > 0
        ? (gen1.slips_planted * inputs.crop_survival_rate) * inputs.vine_cuttings_per_plant
        : 0;
    const gen1a = calcGeneration("Gen 1a (vine)", gen1.hectares, vineCuttingSlips, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, false, true, subGenYields[0]);
    const gen1b = calcGeneration("Gen 1b (vine)", gen1.hectares, vineCuttingSlips, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, false, true, subGenYields[1]);
    const gen1c = calcGeneration("Gen 1c (vine)", gen1.hectares, vineCuttingSlips, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, false, true, subGenYields[2]);

    // --- Generation 2: replanted tubers from Gen 1 ---
    const gen2SlipsPlanted = gen1.potatoes_harvested * inputs.replant_percent * inputs.slips_from_replant;
    const gen2 = calcGeneration("Generation 2", inputs.hectares_gen_2, gen2SlipsPlanted, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, false, false, 1.0);

    const vineCuttingSlips2 = gen2.potatoes_harvested > 0
        ? (gen2.slips_planted * inputs.crop_survival_rate) * inputs.vine_cuttings_per_plant
        : 0;
    const gen2a = calcGeneration("Gen 2a (vine)", gen2.hectares, vineCuttingSlips2, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, false, true, subGenYields[0]);
    const gen2b = calcGeneration("Gen 2b (vine)", gen2.hectares, vineCuttingSlips2, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, false, true, subGenYields[1]);
    const gen2c = calcGeneration("Gen 2c (vine)", gen2.hectares, vineCuttingSlips2, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, false, true, subGenYields[2]);

    // --- Generation 3: replanted tubers from Gen 2 ---
    const gen3SlipsPlanted = gen2.potatoes_harvested * inputs.replant_percent * inputs.slips_from_replant;
    const gen3 = calcGeneration("Generation 3", inputs.hectares_gen_3, gen3SlipsPlanted, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, false, false, 1.0);

    const vineCuttingSlips3 = gen3.potatoes_harvested > 0
        ? (gen3.slips_planted * inputs.crop_survival_rate) * inputs.vine_cuttings_per_plant
        : 0;
    const gen3a = calcGeneration("Gen 3a (vine)", gen3.hectares, vineCuttingSlips3, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, false, true, subGenYields[0]);
    const gen3b = calcGeneration("Gen 3b (vine)", gen3.hectares, vineCuttingSlips3, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, false, true, subGenYields[1]);
    const gen3c = calcGeneration("Gen 3c (vine)", gen3.hectares, vineCuttingSlips3, inputs, lossFactor, costPerHectareNoSlips, maintenanceCostPerHectare, false, true, subGenYields[2]);

    const allGens = [
        gen1, gen1a, gen1b, gen1c,
        gen2, gen2a, gen2b, gen2c,
        gen3, gen3a, gen3b, gen3c,
    ];

    const totalDaysFed = allGens.reduce((sum, g) => sum + g.days_fed, 0);
    const totalCost = allGens.reduce((sum, g) => sum + g.cost, 0);
    const totalTons = allGens.reduce((sum, g) => sum + g.tons_harvested, 0);
    const costPerPersonFullPeriod = inputs.people_to_feed > 0 ? totalCost / inputs.people_to_feed : 0;
    const costPerPersonPerDay = (totalDaysFed > 0 && inputs.people_to_feed > 0)
        ? totalCost / (totalDaysFed * inputs.people_to_feed)
        : 0;

    const totalVitaminAChildDays = allGens.reduce((sum, g) => sum + g.vitamin_a_child_days, 0);
    const childrenAnnualVaMet = totalVitaminAChildDays > 0 ? Math.floor(totalVitaminAChildDays / 365) : 0;

    // --- Annual projection ---
    // Each main generation takes days_to_harvest. Sub-gens overlap (ratoon from same land).
    // The full chain (Gen1 + subs → Gen2 + subs → Gen3 + subs) spans 3 main cycles.
    const cyclesPerYear = inputs.cycles_per_year || 1;
    const daysPerCycle = inputs.days_to_harvest || 120;
    // 3 main generations; sub-gens overlap with their parent's cycle
    const totalChainDays = 3 * daysPerCycle;
    const annualScaleFactor = Math.min(365 / totalChainDays, cyclesPerYear);
    const annualTons = totalTons * annualScaleFactor;
    const annualDaysFed = totalDaysFed * annualScaleFactor;
    const annualCost = totalCost * annualScaleFactor;

    return {
        all_gens: allGens,
        total_days_fed: totalDaysFed,
        total_cost: totalCost,
        total_tons: totalTons,
        cost_per_person_full_period: costPerPersonFullPeriod,
        cost_per_person_per_day: costPerPersonPerDay,
        total_vitamin_a_child_days: totalVitaminAChildDays,
        children_annual_va_met: childrenAnnualVaMet,
        cycles_per_year: cyclesPerYear,
        annual_scale_factor: annualScaleFactor,
        annual_tons: annualTons,
        annual_days_fed: annualDaysFed,
        annual_cost: annualCost,
    };
}

/**
 * Displays the calculated results in the HTML.
 */
function displayResults(results, inputs) {
    const container = document.getElementById('results-container');
    const fNum = (num, dec = 2) => Number.isFinite(num) ? num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '0';
    const fInt = (num) => Number.isFinite(num) ? num.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0';
    const fDol = (num, dec = 0) => Number.isFinite(num) ? num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dec, maximumFractionDigits: dec }) : '$0';

    const genRows = results.all_gens.map(gen => `
        <tr>
            <td>${gen.name}</td>
            <td>${fInt(gen.slips_planted)}</td>
            <td class="highlight">${fNum(gen.tons_harvested)}</td>
            <td>${fNum(gen.days_fed, 1)}</td>
            <td>${fInt(gen.vitamin_a_child_days)}</td>
            <td>${fDol(gen.cost)}</td>
        </tr>
    `).join('');

    const sensitivityInputs = getSensitivityInputOptions();
    const sensitivityOptions = sensitivityInputs.map(opt =>
        `<option value="${opt.id}">${opt.label}</option>`
    ).join('');

    const cycleLabel = ' (chain total)';
    const showAnnual = results.annual_scale_factor > 0;

    const html = `
        <div class="export-buttons">
            <button type="button" id="btn-export-csv" onclick="exportCSV()">Export CSV</button>
            <button type="button" id="btn-print" onclick="window.print()">Print / PDF</button>
        </div>
        <div class="results-summary">
            <h2>Simulation Summary</h2>
            ${showAnnual ? `
            <div class="annual-banner">
                <h3>Annual Projection (${fNum(results.annual_scale_factor, 2)}x scale, ${results.cycles_per_year} cycles/yr, ${fInt(inputs.days_to_harvest)} days/cycle)</h3>
                <div class="summary-grid annual-grid">
                    <div class="summary-item annual-item">
                        <h3>Annual Tons</h3>
                        <p>${fNum(results.annual_tons, 1)}</p>
                    </div>
                    <div class="summary-item annual-item">
                        <h3>Annual Days Fed</h3>
                        <p>${fNum(results.annual_days_fed, 1)}</p>
                    </div>
                    <div class="summary-item annual-item">
                        <h3>Annual Cost</h3>
                        <p>${fDol(results.annual_cost)}</p>
                    </div>
                </div>
            </div>` : ''}
            <div class="summary-grid">
                <div class="summary-item">
                    <h3>Days Fed${cycleLabel}</h3>
                    <p>${fNum(results.total_days_fed, 1)}</p>
                </div>
                <div class="summary-item">
                    <h3>Tons Harvested${cycleLabel}</h3>
                    <p>${fNum(results.total_tons, 1)}</p>
                </div>
                <div class="summary-item">
                    <h3>Cost${cycleLabel}</h3>
                    <p>${fDol(results.total_cost)}</p>
                </div>
                <div class="summary-item">
                    <h3>Cost per Person (Full Period)</h3>
                    <p>${fDol(results.cost_per_person_full_period, 2)}</p>
                </div>
                <div class="summary-item">
                    <h3>Cost per Person per Day</h3>
                    <p>${fDol(results.cost_per_person_per_day, 2)}</p>
                </div>
                <div class="summary-item">
                    <h3>People to Feed</h3>
                    <p>${fInt(inputs.people_to_feed)}</p>
                </div>
                <div class="summary-item vitamin-a-highlight">
                    <h3>Vitamin A: Child-Days Supplied</h3>
                    <p>${fNum(results.total_vitamin_a_child_days / 1000000, 2)} million</p>
                </div>
                <div class="summary-item vitamin-a-highlight">
                    <h3>Children Annual VA Need Met</h3>
                    <p>${fInt(results.children_annual_va_met)}</p>
                </div>
            </div>
        </div>

        <table class="gen-table">
            <thead>
                <tr>
                    <th>Generation</th>
                    <th>Slips Planted</th>
                    <th>Tons Harvested</th>
                    <th>Days Fed</th>
                    <th>VA Child-Days</th>
                    <th>Cost</th>
                </tr>
            </thead>
            <tbody>
                ${genRows}
                <tr class="totals-row">
                    <td><strong>Total</strong></td>
                    <td></td>
                    <td class="highlight"><strong>${fNum(results.total_tons)}</strong></td>
                    <td><strong>${fNum(results.total_days_fed, 1)}</strong></td>
                    <td><strong>${fInt(results.total_vitamin_a_child_days)}</strong></td>
                    <td><strong>${fDol(results.total_cost)}</strong></td>
                </tr>
            </tbody>
        </table>

        <div class="sensitivity-section">
            <h2>Sensitivity Analysis</h2>
            <p class="sensitivity-description">See how varying a single input by +/- 25% affects key outputs.</p>
            <div class="sensitivity-controls">
                <label for="sensitivity-input">Vary input:</label>
                <select id="sensitivity-input">
                    ${sensitivityOptions}
                </select>
            </div>
            <div id="sensitivity-results"></div>
        </div>
    `;

    container.innerHTML = html;

    // Attach sensitivity handler
    const sensitivitySelect = document.getElementById('sensitivity-input');
    const renderSensitivity = () => runSensitivityAnalysis(sensitivitySelect.value, inputs);
    sensitivitySelect.addEventListener('change', renderSensitivity);
    renderSensitivity();

    // Render chart visualization
    renderChart(results);
    renderTimeline(inputs);
}

/**
 * Returns the list of inputs available for sensitivity analysis.
 */
function getSensitivityInputOptions() {
    const options = [
        { id: 'initial_slips', label: 'Initial Slips' },
        { id: 'initial_hectares', label: 'Initial Hectares' },
        { id: 'tons_per_hectare', label: 'Tons per Hectare' },
        { id: 'tons_harvest_percent', label: 'Harvest %' },
        { id: 'potatoes_per_plant', label: 'Potatoes per Plant' },
        { id: 'vine_cuttings_per_plant', label: 'Vine Cuttings per Plant' },
        { id: 'replant_percent', label: 'Tuber Replant %' },
        { id: 'slips_from_replant', label: 'Slips from Replant' },
        { id: 'slip_survival_rate', label: 'Slip Survival Rate' },
        { id: 'crop_survival_rate', label: 'Crop Survival Rate' },
        { id: 'storage_survival_rate', label: 'Storage Survival Rate' },
        { id: 'people_to_feed', label: 'People to Feed' },
        { id: 'calorie_target_per_person', label: 'Calorie Target' },
        { id: 'cycles_per_year', label: 'Crop Cycles per Year' },
        { id: 'cost_irrigation_per_acre', label: 'Irrigation Cost' },
        { id: 'cost_slip_per_unit', label: 'Cost per Slip' },
        { id: 'vitamin_a_per_100g', label: 'Vitamin A per 100g' },
        { id: 'daily_vitamin_a_need', label: 'Daily VA Need' },
    ];
    return options;
}

/**
 * Runs sensitivity analysis: varies the selected input by -25%, -10%, base, +10%, +25%
 * and displays a mini-table showing total_days_fed and total_cost at each level.
 */
function runSensitivityAnalysis(inputId, baseInputs) {
    const container = document.getElementById('sensitivity-results');
    if (!inputId || baseInputs[inputId] === undefined) {
        container.innerHTML = '';
        return;
    }

    const baseValue = baseInputs[inputId];
    const steps = [
        { label: '-25%', factor: 0.75 },
        { label: '-10%', factor: 0.90 },
        { label: 'Base', factor: 1.00 },
        { label: '+10%', factor: 1.10 },
        { label: '+25%', factor: 1.25 },
    ];

    const fNum = (num, dec = 1) => Number.isFinite(num) ? num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '0';
    const fDol = (num) => Number.isFinite(num) ? num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '$0';
    const fVal = (num) => {
        if (!Number.isFinite(num)) return '0';
        if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
        return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    };

    const baseResults = calculateSimulation(baseInputs);

    const rows = steps.map(step => {
        const modifiedInputs = { ...baseInputs };
        modifiedInputs[inputId] = baseValue * step.factor;
        const results = calculateSimulation(modifiedInputs);
        const daysDelta = results.total_days_fed - baseResults.total_days_fed;
        const costDelta = results.total_cost - baseResults.total_cost;

        return `<tr class="${step.factor === 1.00 ? 'sensitivity-base-row' : ''}">
            <td>${step.label}</td>
            <td>${fVal(modifiedInputs[inputId])}</td>
            <td>${fNum(results.total_days_fed)}${step.factor !== 1.00 ? ` <span class="sensitivity-delta ${daysDelta >= 0 ? 'positive' : 'negative'}">(${daysDelta >= 0 ? '+' : ''}${fNum(daysDelta)})</span>` : ''}</td>
            <td>${fDol(results.total_cost)}${step.factor !== 1.00 ? ` <span class="sensitivity-delta ${costDelta <= 0 ? 'positive' : 'negative'}">(${costDelta >= 0 ? '+' : ''}${fDol(costDelta)})</span>` : ''}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="sensitivity-table">
            <thead>
                <tr>
                    <th>Variation</th>
                    <th>Input Value</th>
                    <th>Days Fed</th>
                    <th>Total Cost</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

// --- HTML Escaping ---

function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// --- Scenario Save/Load/Compare ---

const SCENARIOS_KEY = 'ofsp_scenarios';

function getSavedScenarios() {
    try {
        return JSON.parse(localStorage.getItem(SCENARIOS_KEY)) || {};
    } catch {
        return {};
    }
}

function saveScenarios(scenarios) {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
}

function populateScenarioDropdowns() {
    const scenarios = getSavedScenarios();
    const names = Object.keys(scenarios).sort();
    const selects = [
        document.getElementById('scenario-select'),
        document.getElementById('compare-a'),
        document.getElementById('compare-b'),
    ];

    selects.forEach((sel, i) => {
        const defaults = [
            '<option value="">-- Load a scenario --</option>',
            '<option value="">-- Scenario A --</option>',
            '<option value="">-- Scenario B --</option>',
        ];
        sel.innerHTML = defaults[i] + names.map(n =>
            `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`
        ).join('');
    });
}

function getInputFieldLabels() {
    const labels = {};
    const form = document.getElementById('calc-form');
    for (const label of form.querySelectorAll('label')) {
        const forId = label.getAttribute('for');
        if (forId) labels[forId] = label.textContent.trim();
    }
    return labels;
}

function showComparison(nameA, dataA, nameB, dataB) {
    const container = document.getElementById('comparison-container');
    const labels = getInputFieldLabels();
    const allKeys = [...new Set([...Object.keys(dataA), ...Object.keys(dataB)])];

    const rows = allKeys.map(key => {
        const valA = dataA[key] ?? '';
        const valB = dataB[key] ?? '';
        const changed = valA !== valB;
        const label = labels[key] || key;
        return `<tr class="${changed ? 'changed' : ''}">
            <td>${escapeHtml(String(label))}</td>
            <td>${escapeHtml(String(valA))}</td>
            <td>${escapeHtml(String(valB))}</td>
            <td class="diff-indicator ${changed ? 'changed' : ''}">${changed ? '\u0394' : ''}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <h2>Comparing: ${escapeHtml(nameA)} vs ${escapeHtml(nameB)}</h2>
        <table class="comparison-table">
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th>${escapeHtml(nameA)}</th>
                    <th>${escapeHtml(nameB)}</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <button type="button" class="btn-close-compare" onclick="document.getElementById('comparison-container').style.display='none'">Close Comparison</button>
    `;
    container.style.display = 'block';
}

function exportCSV() {
    const inputs = getInputs();
    const results = calculateSimulation(inputs);
    const rows = [
        ['Generation', 'Hectares', 'Slips Planted', 'Potatoes Harvested', 'Tons Harvested', 'Days Fed', 'VA Child-Days', 'Cost'],
    ];
    results.all_gens.forEach(gen => {
        rows.push([gen.name, gen.hectares, gen.slips_planted, gen.potatoes_harvested, gen.tons_harvested, gen.days_fed, gen.vitamin_a_child_days, gen.cost]);
    });
    rows.push([]);
    rows.push(['Summary']);
    rows.push(['Total Tons Harvested', results.total_tons]);
    rows.push(['Total Days People Fed', results.total_days_fed]);
    rows.push(['Total Cost', results.total_cost]);
    rows.push(['Cost per Person (Full Period)', results.cost_per_person_full_period]);
    rows.push(['Cost per Person per Day', results.cost_per_person_per_day]);
    rows.push(['People to Feed', inputs.people_to_feed]);
    rows.push(['Total VA Child-Days', results.total_vitamin_a_child_days]);
    rows.push(['Children Annual VA Need Met', results.children_annual_va_met]);
    rows.push(['Crop Cycles per Year', results.cycles_per_year]);
    rows.push(['Annual Tons', results.annual_tons]);
    rows.push(['Annual Days Fed', results.annual_days_fed]);
    rows.push(['Annual Cost', results.annual_cost]);

    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ofsp_simulation.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// --- Chart Visualization ---

let genChart = null;
let currentMetric = 'tons_harvested';
let lastResults = null;

function renderChart(results) {
    lastResults = results;
    const section = document.getElementById('chart-section');
    section.style.display = 'block';

    const labels = results.all_gens.map(g => g.name);
    const dataMap = {
        tons_harvested: { data: results.all_gens.map(g => g.tons_harvested), label: 'Tons Harvested', color: '#006400' },
        days_fed: { data: results.all_gens.map(g => g.days_fed), label: 'Days Fed', color: '#ff8c00' },
        cost: { data: results.all_gens.map(g => g.cost), label: 'Cost ($)', color: '#8b0000' },
        vitamin_a: { data: results.all_gens.map(g => g.vitamin_a_child_days), label: 'VA Child-Days', color: '#ff6600' },
    };

    const metric = dataMap[currentMetric];
    const ctx = document.getElementById('gen-chart');

    if (genChart) {
        genChart.data.labels = labels;
        genChart.data.datasets[0].data = metric.data;
        genChart.data.datasets[0].label = metric.label;
        genChart.data.datasets[0].backgroundColor = metric.color + 'cc';
        genChart.data.datasets[0].borderColor = metric.color;
        genChart.options.plugins.title.text = metric.label + ' by Generation';
        genChart.update();
        return;
    }

    genChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: metric.label,
                data: metric.data,
                backgroundColor: metric.color + 'cc',
                borderColor: metric.color,
                borderWidth: 1,
                borderRadius: 4,
            }],
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: metric.label + ' by Generation', font: { size: 16 } },
                legend: { display: false },
            },
            scales: {
                y: { beginAtZero: true },
            },
        },
    });
}

// --- Timeline Visualization ---

let timelineChart = null;

function renderTimeline(inputs) {
    const section = document.getElementById('timeline-section');
    section.style.display = 'block';

    const cycles = inputs.cycles_per_year || 1;
    const daysToHarvest = inputs.days_to_harvest || 120;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Northern Haiti default: Cycle 1 starts April (month 3), Cycle 2 starts Sep (month 8)
    const cycleStarts = [3]; // April = index 3
    if (cycles >= 2) cycleStarts.push(8); // September
    if (cycles >= 3) cycleStarts.push(0); // January
    if (cycles >= 4) cycleStarts.push(5); // June

    const datasets = [];
    const colors = ['#006400', '#ff8c00', '#4169e1', '#8b008b'];

    for (let c = 0; c < Math.min(cycles, cycleStarts.length); c++) {
        const startMonth = cycleStarts[c];
        const harvestMonths = Math.ceil(daysToHarvest / 30);
        const endMonth = startMonth + harvestMonths;

        // Create data array: 1 for planting months, 0.5 for growing, 0 for inactive
        const data = new Array(12).fill(0);
        for (let m = startMonth; m < Math.min(endMonth, startMonth + 12); m++) {
            const mi = m % 12;
            if (m === startMonth) {
                data[mi] = 1; // Planting
            } else if (m === endMonth - 1) {
                data[mi] = 0.75; // Harvest
            } else {
                data[mi] = 0.5; // Growing
            }
        }

        datasets.push({
            label: `Cycle ${c + 1}`,
            data,
            backgroundColor: colors[c] + '99',
            borderColor: colors[c],
            borderWidth: 1,
            borderRadius: 2,
        });
    }

    const ctx = document.getElementById('timeline-chart');

    if (timelineChart) {
        timelineChart.data.datasets = datasets;
        timelineChart.update();
        return;
    }

    timelineChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthNames,
            datasets,
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: `Planting/Harvest Windows (${cycles} cycle${cycles > 1 ? 's' : ''}/year, ${daysToHarvest} days/cycle)`,
                    font: { size: 16 },
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            const phase = val === 1 ? 'Planting' : val === 0.75 ? 'Harvest' : val === 0.5 ? 'Growing' : 'Inactive';
                            return `${context.dataset.label}: ${phase}`;
                        }
                    }
                },
                legend: { display: true },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 1.2,
                    ticks: {
                        callback: function(value) {
                            if (value === 1) return 'Plant';
                            if (value === 0.75) return 'Harvest';
                            if (value === 0.5) return 'Grow';
                            if (value === 0) return '';
                            return '';
                        },
                        stepSize: 0.25,
                    },
                },
            },
        },
    });
}

document.addEventListener('DOMContentLoaded', () => {
    populateScenarioDropdowns();

    document.getElementById('btn-save-scenario').addEventListener('click', () => {
        const name = document.getElementById('scenario-name').value.trim();
        if (!name) { alert('Enter a scenario name.'); return; }
        const scenarios = getSavedScenarios();
        scenarios[name] = getInputs();
        saveScenarios(scenarios);
        document.getElementById('scenario-name').value = '';
        populateScenarioDropdowns();
    });

    document.getElementById('btn-load-scenario').addEventListener('click', () => {
        const name = document.getElementById('scenario-select').value;
        if (!name) { alert('Select a scenario to load.'); return; }
        const scenarios = getSavedScenarios();
        const data = scenarios[name];
        if (!data) return;
        const form = document.getElementById('calc-form');
        for (const [key, val] of Object.entries(data)) {
            if (key === 'yield_mode') {
                const radio = form.querySelector(`input[name="yield_mode"][value="${val}"]`);
                if (radio) radio.checked = true;
            } else {
                const el = form.elements[key];
                if (el) { el.value = val; }
            }
        }
        form.dispatchEvent(new Event('input'));
    });

    document.getElementById('btn-delete-scenario').addEventListener('click', () => {
        const name = document.getElementById('scenario-select').value;
        if (!name) { alert('Select a scenario to delete.'); return; }
        if (!confirm(`Delete scenario "${name}"?`)) return;
        const scenarios = getSavedScenarios();
        delete scenarios[name];
        saveScenarios(scenarios);
        populateScenarioDropdowns();
    });

    document.getElementById('btn-compare').addEventListener('click', () => {
        const nameA = document.getElementById('compare-a').value;
        const nameB = document.getElementById('compare-b').value;
        if (!nameA || !nameB) { alert('Select two scenarios to compare.'); return; }
        if (nameA === nameB) { alert('Select two different scenarios.'); return; }
        const scenarios = getSavedScenarios();
        showComparison(nameA, scenarios[nameA], nameB, scenarios[nameB]);
    });
});

document.addEventListener('click', (e) => {
    if (!e.target.matches('.toggle-btn')) return;
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentMetric = e.target.dataset.metric;
    if (lastResults) renderChart(lastResults);
});
