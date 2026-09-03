// physics.js - Математическая и физическая модель котла

class BoilerPhysics {
    constructor(moisture = 15, woodDensity = 1.0, stacking = 'good') {
        this.moistureRatio = moisture / 100;
        this.woodDensity = woodDensity;
        this.stackingFactor = (stacking === 'good') ? 1.0 : 0.65;

        this.initialWoodMass = 15.0; // кг
        this.m_wood = 15.0;
        this.m_burned = 0;
        this.m_water_fuel = this.m_wood * this.moistureRatio;

        // Энергетическая ценность топлива (кДж/кг)
        const Q_dry = 19200; 
        const L_evap = 2260; 
        this.Q_lower = Q_dry * (1 - this.moistureRatio) - L_evap * this.moistureRatio;

        // Теплоемкости (кДж/°C)
        this.C_furnace = 18.0;      
        this.C_water = 50 * 4.187; // ~209.35 кДж/°C

        this.T_env = 20;
        this.T_furnace = 20;
        this.T_water = 20;

        // Интеграторы полезной энергии и потерь (кДж)
        this.totalHeatToHouse = 0; // Полезное тепло, ушедшее в дом
        this.totalHeatLoss = 0;    // Потери в трубу
    }

    // Один шаг физики СТРОГО за 1 секунду
    step(fanSpeed) {
        const dt = 1; // Всегда 1 секунда
        const fan = Math.min(100, Math.max(0, fanSpeed));

        // 1. Топливо выгорело
        if (this.m_wood <= 0) {
            this.m_wood = 0;
            // Остывание топки из-за паразитной тяги
            const coolingAir = 0.005 + (fan / 100) * 0.03;
            const Q_cool = coolingAir * (this.T_furnace - this.T_env) * dt;
            this.T_furnace = Math.max(this.T_env, this.T_furnace - (Q_cool / this.C_furnace));

            // Отдача тепла из воды в дом при остывании
            const Q_house = Math.max(0, (this.T_water - this.T_env) * 0.10 * dt);
            this.totalHeatToHouse += Q_house;
            this.T_water = Math.max(this.T_env, this.T_water - (Q_house / this.C_water));
            return;
        }

        // 2. Скорость горения дров (кг/с)
        const airFlow = 0.15 + (fan / 100) * 0.85;
        let burnRate = 0.0012 * airFlow * this.woodDensity * this.stackingFactor * dt;

        const remainingRatio = this.m_wood / this.initialWoodMass;
if (remainingRatio < 0.15) {
    burnRate *= Math.max(0.5, remainingRatio / 0.15);
}

        burnRate = Math.min(this.m_wood, burnRate);
        this.m_wood -= burnRate;
        this.m_burned += burnRate;

        // 3. Выделение энергии с учетом качества сгорания (alpha)
        let Q_gen = 0;

        if (this.m_water_fuel > 0 && this.T_furnace >= 70) {
            // Затраты на выпаривание влаги
            const evapRate = Math.min(this.m_water_fuel, burnRate * this.moistureRatio * 2.5);
            this.m_water_fuel -= evapRate;
            Q_gen = Math.max(0, (burnRate * this.Q_lower) - (evapRate * 2260));
        } else {
            // Эффективность сгорания зависит от соответствия обдува фазе
            let optimalFan = 60;
            if (remainingRatio < 0.20) optimalFan = 15;

            const fanDiff = Math.abs(fan - optimalFan) / 100;
            const combustionEff = Math.max(0.4, 1.0 - fanDiff * 1.2);
            Q_gen = burnRate * this.Q_lower * combustionEff;
        }

        // 4. Распределение тепла
        // Теплоотдача от топки к воде
        const heatTransferCoeff = 0.35 * (this.stackingFactor < 1.0 ? 0.6 : 1.0);
        const Q_to_water = Math.max(0, (this.T_furnace - this.T_water) * heatTransferCoeff * dt);

        // Потери в дымоход (Зигерт)
        const chimneyLossCoeff = (0.008 + (fan / 100) * 0.05) / this.stackingFactor;
        const Q_chimney = Math.max(0, (this.T_furnace - this.T_env) * chimneyLossCoeff * dt);

        // Полезный отбор тепла системой отопления дома
        const Q_house = Math.max(0, (this.T_water - this.T_env) * 0.10 * dt);

        this.totalHeatToHouse += Q_house;
        this.totalHeatLoss += Q_chimney;

        // 5. Баланс температур
        this.T_furnace = Math.max(this.T_env, this.T_furnace + (Q_gen - Q_to_water - Q_chimney) / this.C_furnace);
        this.T_water = Math.max(this.T_env, this.T_water + (Q_to_water - Q_house) / this.C_water);
    }

    getFuelPercent() {
        return Math.max(0, (this.m_wood / this.initialWoodMass) * 100);
    }

    // Настоящий физический КПД процесса (накопленный за весь период)
    getEfficiency() {
        const totalFuelEnergySpent = this.m_burned * this.Q_lower;
        if (totalFuelEnergySpent <= 0) return 0;
        return Math.min(95, Math.round((this.totalHeatToHouse / totalFuelEnergySpent) * 100));
    }
}