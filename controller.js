// controller.js - Логика управления дымососом/вентилятором

class SmartBoilerController {
    constructor() {
        this.prevT_furnace = 20;
        this.prevT_water = 20;
        this.timer = 0;
        this.dryingPhaseDuration = 0;
        this.estimatedMoisture = 15;
        this.currentPhase = "Инициализация";
        this.isEmergency = false;
    }

    update(T_furnace, T_water, m_wood = 15.0) {
    const dt = 1;
    this.timer += dt;

    // 1. ПОЛНОЕ СГОРАНИЕ: если осталось меньше 100 грамм из 15 кг
    if (m_wood <= 0.2) {
        this.currentPhase = "";
        return { fanSpeed: 0, phaseName: this.currentPhase, estimatedMoisture: this.estimatedMoisture };
    }

    // Защита от перегрева
    if (T_water >= 85) this.isEmergency = true;
    else if (T_water < 78) this.isEmergency = false;

    if (this.isEmergency) {
        this.currentPhase = "АВАРИЯ: Защита от закипания (Охлаждение)";
        return { fanSpeed: 0, phaseName: this.currentPhase, estimatedMoisture: this.estimatedMoisture };
    }

    const dT_furnace = T_furnace - this.prevT_furnace;
    const dT_water = T_water - this.prevT_water;

    this.prevT_furnace = T_furnace;
    this.prevT_water = T_water;

    let fanSpeed = 50;

    // ФАЗА 1: Сушка и пиролиз (включается только в начале, когда дров больше 12 кг)
    if (m_wood > 12.0 && ((dT_furnace > 2.0 * dT_water || T_furnace < 130) && T_water < 50)) {
        this.currentPhase = "1. Сушка и пиролиз (Импульсный обдув)";
        this.dryingPhaseDuration += dt;
        this.estimatedMoisture = Math.min(45, Math.max(5, Math.round(this.dryingPhaseDuration / 12)));
        fanSpeed = (Math.floor(this.timer / 6) % 2 === 0) ? 75 : 25;
    }
    // ФАЗА 3: Коррекция зазоров укладки
    else if (T_furnace > 160 && dT_water <= 0.002 && T_water < 75) {
        this.currentPhase = "3. Коррекция зазоров укладки (Замедление потока)";
        fanSpeed = 25;
    }
    // ФАЗА 4: Догорание углей (когда осталось меньше 3 кг дров / углей)
    else if (m_wood < 3.0 || (dT_water < -0.005 && T_furnace < 170)) {
        this.currentPhase = "4. Догорание углей (Запирание тепла)";
        const ratio = Math.max(0, (T_furnace - 30) / (200 - 30));
        fanSpeed = Math.round(10 + ratio * 25);
    }
    // ФАЗА 2: Основное активное горение
    else {
        this.currentPhase = "2. Активное горение (Оптимальный наддув)";
        fanSpeed = (T_water > 72) ? Math.max(15, 60 - (T_water - 72) * 4) : 60;
    }

    return {
        fanSpeed: Math.max(0, Math.min(100, Math.round(fanSpeed))),
        phaseName: this.currentPhase,
        estimatedMoisture: this.estimatedMoisture
    }; }}

class DumbBoilerController {
    constructor(fixedSpeed = 75) {
        this.fixedSpeed = fixedSpeed;
        this.isEmergency = false;
    }

    update(T_furnace, T_water) {
        // Обычный котел с задержкой и простым термостатом
        if (T_water >= 90) this.isEmergency = true;
        else if (T_water < 80) this.isEmergency = false;

        if (this.isEmergency) {
            return { fanSpeed: 0, phaseName: "Авария: Перегрев" };
        }
        return { fanSpeed: this.fixedSpeed, phaseName: "Фиксированный обдув (75%)" };
    }
}
