document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('calc-form');

    function run() {
        if (!validateForm()) return;
        const inputs = getInputs();
        const results = calculateSimulation(inputs);
        displayResults(results, inputs);
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        run();
    });

    // Auto-calculate when any input changes
    form.addEventListener('input', run);

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
    const formElements = document.getElementById('calc-form').elements;
    for (const element of formElements) {
        if (element.id && element.type === 'number') {
            const val = parseFloat(element.value);
            inputs[element.id] = Number.isFinite(val) ? val : 0;
        }
    }
    return inputs;
}

/**
 * Calculates a single generation's harvest and cost.
 */
function calcGeneration(name, hectares, slipsPlanted, inputs, lossFactor, costPerHectareNoSlips, includeSlipCost) {
    const potatoesHarvested = slipsPlanted * inputs.potatoes_per_plant * lossFactor;
    const tonsHarvested = (potatoesHarvested * inputs.grams_per_potato / inputs.grams_per_ton) * inputs.tons_harvest_percent;
    const caloriesPerTon = inputs.grams_per_ton > 0 && inputs.grams_per_potato > 0
        ? (inputs.grams_per_ton / inputs.grams_per_potato) * inputs.calories_per_potato_with_leaves
        : 0;
    const caloriesNeededPerDay = inputs.people_to_feed * inputs.calorie_target_per_person;
    const daysFed = caloriesNeededPerDay > 0
        ? (tonsHarvested * caloriesPerTon) / caloriesNeededPerDay
        : 0;

    const slipCost = includeSlipCost ? slipsPlanted * inputs.cost_slip_per_unit : 0;
    const cost = (costPerHectareNoSlips * hectares) + slipCost;

    return {
        name,
        hectares,
        slips_planted: slipsPlanted,
        potatoes_harvested: potatoesHarvested,
        tons_harvested: tonsHarvested,
        days_fed: daysFed,
        cost,
    };
}

/**
 * The main calculation engine, ported from the spreadsheet logic.
 */
function calculateSimulation(inputs) {
    const lossFactor = inputs.mortality_rate * inputs.crop_damage_loss * inputs.storage_loss;

    // --- Cost per hectare (excluding slips) ---
    const laborPerAcre = inputs.cost_land_clearing_per_acre + inputs.cost_forking_per_acre +
        inputs.cost_planting_per_acre + inputs.cost_weeding_per_acre +
        inputs.cost_fertilizer_app_per_acre + inputs.cost_harvesting_per_acre;

    const suppliesPerAcre = inputs.cost_herbicide_per_acre + inputs.cost_fertilizer_per_acre +
        inputs.cost_tools_per_acre + inputs.cost_other_per_acre +
        inputs.cost_transport_per_acre;

    const costPerHectareNoSlips = (laborPerAcre + suppliesPerAcre + inputs.cost_irrigation_per_acre) * inputs.acres_per_hectare;

    // --- Generation 1 ---
    const gen1 = calcGeneration("Generation 1", inputs.initial_hectares, inputs.initial_slips, inputs, lossFactor, costPerHectareNoSlips, true);

    // --- Gen 1a, 1b, 1c: vine cutting regrowth from Gen 1 plants ---
    // Each surviving plant produces vine_cuttings_per_plant new plants.
    const vineCuttingSlips = gen1.potatoes_harvested > 0
        ? (gen1.slips_planted * inputs.mortality_rate) * inputs.vine_cuttings_per_plant
        : 0;
    const gen1a = calcGeneration("Gen 1a", gen1.hectares, vineCuttingSlips, inputs, lossFactor, costPerHectareNoSlips, false);
    const gen1b = calcGeneration("Gen 1b", gen1.hectares, vineCuttingSlips, inputs, lossFactor, costPerHectareNoSlips, false);
    const gen1c = calcGeneration("Gen 1c", gen1.hectares, vineCuttingSlips, inputs, lossFactor, costPerHectareNoSlips, false);

    // --- Generation 2: replanted tubers from Gen 1 ---
    const gen2SlipsPlanted = gen1.potatoes_harvested * inputs.replant_percent * inputs.slips_from_replant;
    const gen2 = calcGeneration("Generation 2", inputs.hectares_gen_2, gen2SlipsPlanted, inputs, lossFactor, costPerHectareNoSlips, false);

    const vineCuttingSlips2 = gen2.potatoes_harvested > 0
        ? (gen2.slips_planted * inputs.mortality_rate) * inputs.vine_cuttings_per_plant
        : 0;
    const gen2a = calcGeneration("Gen 2a", gen2.hectares, vineCuttingSlips2, inputs, lossFactor, costPerHectareNoSlips, false);
    const gen2b = calcGeneration("Gen 2b", gen2.hectares, vineCuttingSlips2, inputs, lossFactor, costPerHectareNoSlips, false);
    const gen2c = calcGeneration("Gen 2c", gen2.hectares, vineCuttingSlips2, inputs, lossFactor, costPerHectareNoSlips, false);

    // --- Generation 3: replanted tubers from Gen 2 ---
    const gen3SlipsPlanted = gen2.potatoes_harvested * inputs.replant_percent * inputs.slips_from_replant;
    const gen3 = calcGeneration("Generation 3", inputs.hectares_gen_3, gen3SlipsPlanted, inputs, lossFactor, costPerHectareNoSlips, false);

    const vineCuttingSlips3 = gen3.potatoes_harvested > 0
        ? (gen3.slips_planted * inputs.mortality_rate) * inputs.vine_cuttings_per_plant
        : 0;
    const gen3a = calcGeneration("Gen 3a", gen3.hectares, vineCuttingSlips3, inputs, lossFactor, costPerHectareNoSlips, false);
    const gen3b = calcGeneration("Gen 3b", gen3.hectares, vineCuttingSlips3, inputs, lossFactor, costPerHectareNoSlips, false);
    const gen3c = calcGeneration("Gen 3c", gen3.hectares, vineCuttingSlips3, inputs, lossFactor, costPerHectareNoSlips, false);

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

    return {
        all_gens: allGens,
        total_days_fed: totalDaysFed,
        total_cost: totalCost,
        total_tons: totalTons,
        cost_per_person_full_period: costPerPersonFullPeriod,
        cost_per_person_per_day: costPerPersonPerDay,
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
            <td>${fDol(gen.cost)}</td>
        </tr>
    `).join('');

    const sensitivityInputs = getSensitivityInputOptions();
    const sensitivityOptions = sensitivityInputs.map(opt =>
        `<option value="${opt.id}">${opt.label}</option>`
    ).join('');

    const html = `
        <div class="export-buttons">
            <button type="button" id="btn-export-csv" onclick="exportCSV()">Export CSV</button>
            <button type="button" id="btn-print" onclick="window.print()">Print / PDF</button>
        </div>
        <div class="results-summary">
            <h2>Simulation Summary</h2>
            <div class="summary-grid">
                <div class="summary-item">
                    <h3>Total Days People Fed</h3>
                    <p>${fNum(results.total_days_fed, 1)}</p>
                </div>
                <div class="summary-item">
                    <h3>Total Tons Harvested</h3>
                    <p>${fNum(results.total_tons, 1)}</p>
                </div>
                <div class="summary-item">
                    <h3>Total Cost</h3>
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
            </div>
        </div>

        <table class="gen-table">
            <thead>
                <tr>
                    <th>Generation</th>
                    <th>Slips Planted</th>
                    <th>Tons Harvested</th>
                    <th>Days Fed</th>
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
        { id: 'mortality_rate', label: 'Mortality Rate' },
        { id: 'crop_damage_loss', label: 'Crop Damage Loss' },
        { id: 'storage_loss', label: 'Storage Loss' },
        { id: 'people_to_feed', label: 'People to Feed' },
        { id: 'calorie_target_per_person', label: 'Calorie Target' },
        { id: 'cost_irrigation_per_acre', label: 'Irrigation Cost' },
        { id: 'cost_slip_per_unit', label: 'Cost per Slip' },
    ];
    return options;
}

/**
 * Runs sensitivity analysis: varies the selected input by -25%, -10%, base, +10%, +25%
 * and displays a mini-table showing total_days_fed and total_cost at each level.
 */
function runSensitivityAnalysis(inputId, baseInputs) {
    const container = document.getElementById('sensitivity-results');
    if (!inputId || !baseInputs[inputId] === undefined) {
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
            `<option value="${n}">${n}</option>`
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
            <td>${label}</td>
            <td>${valA}</td>
            <td>${valB}</td>
            <td class="diff-indicator ${changed ? 'changed' : ''}">${changed ? '\u0394' : ''}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <h2>Comparing: ${nameA} vs ${nameB}</h2>
        <table class="comparison-table">
            <thead>
                <tr>
                    <th>Parameter</th>
                    <th>${nameA}</th>
                    <th>${nameB}</th>
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
        ['Generation', 'Hectares', 'Slips Planted', 'Potatoes Harvested', 'Tons Harvested', 'Days Fed', 'Cost'],
    ];
    results.all_gens.forEach(gen => {
        rows.push([gen.name, gen.hectares, gen.slips_planted, gen.potatoes_harvested, gen.tons_harvested, gen.days_fed, gen.cost]);
    });
    rows.push([]);
    rows.push(['Summary']);
    rows.push(['Total Tons Harvested', results.total_tons]);
    rows.push(['Total Days People Fed', results.total_days_fed]);
    rows.push(['Total Cost', results.total_cost]);
    rows.push(['Cost per Person (Full Period)', results.cost_per_person_full_period]);
    rows.push(['Cost per Person per Day', results.cost_per_person_per_day]);
    rows.push(['People to Feed', inputs.people_to_feed]);

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
            const el = form.elements[key];
            if (el) { el.value = val; }
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
