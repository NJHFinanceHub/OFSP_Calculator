/**
 * farmOS Connector for OFSP Calculator
 *
 * Browser-only module that syncs OFSP simulation results to a farmOS 2.x
 * instance via JSON:API with OAuth2 password-grant authentication.
 *
 * Requires CORS enabled on the farmOS instance (standard for farmOS 2.x).
 */
class FarmOSConnector {
    constructor() {
        this._baseUrl = '';
        this._accessToken = null;
        this._refreshToken = null;
        this._tokenExpiry = 0;
        this._clientId = 'farm'; // farmOS default OAuth client
    }

    get isConnected() {
        return !!this._accessToken;
    }

    // ── Auth ──────────────────────────────────────────────────────────

    async connect(url, username, password) {
        this._baseUrl = url.replace(/\/+$/, '');

        const res = await fetch(`${this._baseUrl}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'password',
                username,
                password,
                client_id: this._clientId,
                scope: 'farm_manager',
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Auth failed (${res.status}): ${text}`);
        }

        const data = await res.json();
        this._accessToken = data.access_token;
        this._refreshToken = data.refresh_token;
        this._tokenExpiry = Date.now() + (data.expires_in - 30) * 1000;
    }

    async refreshToken() {
        if (!this._refreshToken) throw new Error('No refresh token');

        const res = await fetch(`${this._baseUrl}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: this._refreshToken,
                client_id: this._clientId,
            }),
        });

        if (!res.ok) throw new Error(`Token refresh failed (${res.status})`);

        const data = await res.json();
        this._accessToken = data.access_token;
        this._refreshToken = data.refresh_token;
        this._tokenExpiry = Date.now() + (data.expires_in - 30) * 1000;
    }

    disconnect() {
        this._accessToken = null;
        this._refreshToken = null;
        this._tokenExpiry = 0;
    }

    // ── JSON:API request helper ──────────────────────────────────────

    async apiRequest(method, path, body) {
        if (this._accessToken && Date.now() > this._tokenExpiry) {
            await this.refreshToken();
        }

        const opts = {
            method,
            headers: {
                'Content-Type': 'application/vnd.api+json',
                'Accept': 'application/vnd.api+json',
            },
        };

        if (this._accessToken) {
            opts.headers['Authorization'] = `Bearer ${this._accessToken}`;
        }

        if (body) {
            opts.body = JSON.stringify(body);
        }

        const url = path.startsWith('http') ? path : `${this._baseUrl}${path}`;
        const res = await fetch(url, opts);

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
        }

        if (res.status === 204) return null;
        return res.json();
    }

    // ── Entity helpers ───────────────────────────────────────────────

    /**
     * Get or create a taxonomy term by name within a vocabulary bundle.
     * Returns the term's UUID.
     */
    async getOrCreateTerm(bundle, name, description) {
        const filterPath = `/api/taxonomy_term/${bundle}?filter[name]=${encodeURIComponent(name)}`;
        const existing = await this.apiRequest('GET', filterPath);

        if (existing.data && existing.data.length > 0) {
            return existing.data[0].id;
        }

        const payload = {
            data: {
                type: `taxonomy_term--${bundle}`,
                attributes: {
                    name,
                },
            },
        };
        if (description) {
            payload.data.attributes.description = { value: description, format: 'default' };
        }

        const created = await this.apiRequest('POST', `/api/taxonomy_term/${bundle}`, payload);
        return created.data.id;
    }

    /**
     * Create a land asset. Returns UUID.
     */
    async createLandAsset(name, hectares, notes) {
        const payload = {
            data: {
                type: 'asset--land',
                attributes: {
                    name,
                    status: 'active',
                    land_type: 'field',
                    notes: notes ? { value: notes, format: 'default' } : undefined,
                },
            },
        };

        const created = await this.apiRequest('POST', '/api/asset/land', payload);
        return created.data.id;
    }

    /**
     * Create a plant asset. Returns UUID.
     */
    async createPlantAsset(name, plantTypeId, seasonId, notes) {
        const payload = {
            data: {
                type: 'asset--plant',
                attributes: {
                    name,
                    status: 'active',
                    notes: notes ? { value: notes, format: 'default' } : undefined,
                },
                relationships: {
                    plant_type: {
                        data: [{ type: 'taxonomy_term--plant_type', id: plantTypeId }],
                    },
                    season: {
                        data: [{ type: 'taxonomy_term--season', id: seasonId }],
                    },
                },
            },
        };

        const created = await this.apiRequest('POST', '/api/asset/plant', payload);
        return created.data.id;
    }

    /**
     * Create a seeding log (planting event). Returns UUID.
     * Sets is_movement to true so the plant is located at the land asset.
     */
    async createSeedingLog(name, plantId, landId, timestamp, categoryId, notes) {
        const payload = {
            data: {
                type: 'log--seeding',
                attributes: {
                    name,
                    timestamp: this._toFarmOSTimestamp(timestamp),
                    status: 'done',
                    is_movement: true,
                    notes: notes ? { value: notes, format: 'default' } : undefined,
                },
                relationships: {
                    asset: {
                        data: [{ type: 'asset--plant', id: plantId }],
                    },
                    location: {
                        data: [{ type: 'asset--land', id: landId }],
                    },
                    category: {
                        data: categoryId
                            ? [{ type: 'taxonomy_term--log_category', id: categoryId }]
                            : [],
                    },
                },
            },
        };

        const created = await this.apiRequest('POST', '/api/log/seeding', payload);
        return created.data.id;
    }

    /**
     * Create a harvest log. Returns UUID.
     */
    async createHarvestLog(name, plantId, timestamp, categoryId, notes) {
        const payload = {
            data: {
                type: 'log--harvest',
                attributes: {
                    name,
                    timestamp: this._toFarmOSTimestamp(timestamp),
                    status: 'done',
                    notes: notes ? { value: notes, format: 'default' } : undefined,
                },
                relationships: {
                    asset: {
                        data: [{ type: 'asset--plant', id: plantId }],
                    },
                    category: {
                        data: categoryId
                            ? [{ type: 'taxonomy_term--log_category', id: categoryId }]
                            : [],
                    },
                },
            },
        };

        const created = await this.apiRequest('POST', '/api/log/harvest', payload);
        return created.data.id;
    }

    /**
     * Create an input log (costs/materials). Returns UUID.
     */
    async createInputLog(name, plantId, timestamp, categoryId, notes) {
        const payload = {
            data: {
                type: 'log--input',
                attributes: {
                    name,
                    timestamp: this._toFarmOSTimestamp(timestamp),
                    status: 'done',
                    notes: notes ? { value: notes, format: 'default' } : undefined,
                },
                relationships: {
                    asset: {
                        data: [{ type: 'asset--plant', id: plantId }],
                    },
                    category: {
                        data: categoryId
                            ? [{ type: 'taxonomy_term--log_category', id: categoryId }]
                            : [],
                    },
                },
            },
        };

        const created = await this.apiRequest('POST', '/api/log/input', payload);
        return created.data.id;
    }

    // ── Main sync ────────────────────────────────────────────────────

    /**
     * Sync a full OFSP simulation to farmOS.
     *
     * @param {Object} results - from calculateSimulation()
     * @param {Object} inputs  - from getInputs()
     * @param {Object} config  - { seasonName: string }
     * @param {Function} onProgress - callback(message, current, total)
     * @returns {Object} summary of created entities
     */
    async syncSimulation(results, inputs, config, onProgress) {
        const allGens = results.all_gens;
        const totalSteps = 3 + allGens.length * 4;
        let step = 0;

        const progress = (msg) => {
            step++;
            if (onProgress) onProgress(msg, step, totalSteps);
        };

        const summary = { terms: 0, lands: 0, plants: 0, seedings: 0, harvests: 0, inputs: 0 };

        // 1. Create/get taxonomy terms
        progress('Creating plant type term...');
        const plantTypeId = await this.getOrCreateTerm(
            'plant_type',
            'Orange-Fleshed Sweet Potato (OFSP)',
            'Biofortified sweet potato variety rich in Vitamin A (beta-carotene).'
        );
        summary.terms++;

        progress('Creating season term...');
        const seasonId = await this.getOrCreateTerm(
            'season',
            config.seasonName || 'OFSP Program',
            `OFSP regeneration program — ${allGens.length} generations.`
        );
        summary.terms++;

        progress('Creating log category term...');
        const categoryId = await this.getOrCreateTerm(
            'log_category',
            config.seasonName || 'OFSP Program',
            'Groups all logs for this OFSP simulation run.'
        );
        summary.terms++;

        // 2. Sync each generation
        let currentLandId = null;
        const isMainGen = (i) => i % 4 === 0;

        const startDate = inputs.start_date
            ? new Date(inputs.start_date)
            : new Date();
        const daysToHarvest = inputs.days_to_harvest || 120;

        for (let i = 0; i < allGens.length; i++) {
            const gen = allGens[i];
            const mainGenNum = Math.floor(i / 4) + 1;

            // Compute planting date offset
            const mainGenOffset = Math.floor(i / 4) * daysToHarvest;
            const subGenOffset = isMainGen(i) ? 0 : (i % 4) * Math.round(daysToHarvest * 0.4);
            const plantingDate = new Date(startDate);
            plantingDate.setDate(plantingDate.getDate() + mainGenOffset + subGenOffset);

            const harvestDate = new Date(plantingDate);
            harvestDate.setDate(harvestDate.getDate() + daysToHarvest);

            // Create land asset for main gens only
            if (isMainGen(i)) {
                progress(`Creating land: OFSP Gen ${mainGenNum}...`);
                currentLandId = await this.createLandAsset(
                    `OFSP Gen ${mainGenNum} — ${gen.hectares.toFixed(1)} ha`,
                    gen.hectares,
                    `Generation ${mainGenNum}: ${gen.hectares.toFixed(1)} hectares for OFSP cultivation.`
                );
                summary.lands++;
            }

            // Create plant asset
            progress(`Creating plant: ${gen.name}...`);
            const plantNotes = [
                `Slips planted: ${Math.round(gen.slips_planted).toLocaleString()}`,
                `Tons harvested: ${gen.tons_harvested.toFixed(2)} t`,
                `Days fed: ${gen.days_fed.toFixed(1)}`,
                `Cost: $${gen.cost.toFixed(2)}`,
            ];
            if (gen.vitamin_a_child_days > 0) {
                plantNotes.push(`VA child-days: ${Math.round(gen.vitamin_a_child_days).toLocaleString()}`);
            }
            if (gen.fresh_slip_refresh) {
                plantNotes.push('** Fresh clean slips purchased (yield reset) **');
            }

            const plantId = await this.createPlantAsset(
                `OFSP ${gen.name}`,
                plantTypeId,
                seasonId,
                plantNotes.join('\n')
            );
            summary.plants++;

            // Create seeding log
            progress(`Seeding log: ${gen.name}...`);
            await this.createSeedingLog(
                `Plant ${gen.name}`,
                plantId,
                currentLandId,
                plantingDate,
                categoryId,
                `Planted ${Math.round(gen.slips_planted).toLocaleString()} slips on ${gen.hectares.toFixed(1)} ha.`
            );
            summary.seedings++;

            // Create harvest log
            progress(`Harvest log: ${gen.name}...`);
            const harvestNotes = [
                `Harvested ${gen.tons_harvested.toFixed(2)} metric tons.`,
                `Potatoes: ${Math.round(gen.potatoes_harvested).toLocaleString()}`,
                `Feeds ${inputs.people_to_feed.toLocaleString()} people for ${gen.days_fed.toFixed(1)} days.`,
            ].join('\n');
            await this.createHarvestLog(
                `Harvest ${gen.name}`,
                plantId,
                harvestDate,
                categoryId,
                harvestNotes
            );
            summary.harvests++;

            // Create input log for costs (main gens only)
            if (isMainGen(i)) {
                progress(`Cost log: ${gen.name}...`);
                const costNotes = [
                    `Total cost: $${gen.cost.toFixed(2)}`,
                    `Hectares: ${gen.hectares.toFixed(1)}`,
                    `Cost/ha: $${(gen.cost / gen.hectares).toFixed(2)}`,
                ].join('\n');
                await this.createInputLog(
                    `Costs ${gen.name}`,
                    plantId,
                    plantingDate,
                    categoryId,
                    costNotes
                );
                summary.inputs++;
            }
        }

        return summary;
    }

    // ── Utilities ────────────────────────────────────────────────────

    _toFarmOSTimestamp(date) {
        if (typeof date === 'string') return date;
        return Math.floor(date.getTime() / 1000).toString();
    }
}
