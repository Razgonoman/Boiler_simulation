let simInterval = null;
let simSpeed = 10; // Сколько секунд физики прогонять за 1 кадр UI (по умолчанию 10x)
let stepCount = 0;

let smartController = null;
let dumbController = null;
let smartPhysics = null;
let dumbPhysics = null;

let chartTemps = null;
let chartFuel = null;

function startSimulation(event) {
    if (event && event.preventDefault) event.preventDefault();

    const moisture = parseFloat(document.getElementById('param-moisture')?.value || 15);
    const woodDensity = parseFloat(document.getElementById('param-wood')?.value || 1.0);
    const stacking = document.getElementById('param-stacking')?.value || 'good';

    smartController = new SmartBoilerController();
    dumbController = new DumbBoilerController();

    smartPhysics = new BoilerPhysics(moisture, woodDensity, stacking);
    dumbPhysics = new BoilerPhysics(moisture, woodDensity, stacking);

    stepCount = 0;

    document.getElementById('setup-screen')?.classList.remove('active');
    document.getElementById('sim-screen')?.classList.add('active');

    initCharts();

    if (simInterval) clearInterval(simInterval);
    // Фиксированный такт интерфейса: 10 кадров в секунду (100 мс)
    simInterval = setInterval(renderLoop, 100);
}

function resetToSetup() {
    if (simInterval) clearInterval(simInterval);
    document.getElementById('sim-screen')?.classList.remove('active');
    document.getElementById('setup-screen')?.classList.add('active');
}

function changeSpeed(val) {
    simSpeed = parseInt(val);
}

// Главный цикл: выполняет N шагов физики за 1 вызов отрисовки UI
function renderLoop() {
    // Остановка симуляции при полном сгорании обоих котлов
    if (smartPhysics.m_wood <= 0.2 && dumbPhysics.m_wood <= 0.2) {
    if (simInterval) clearInterval(simInterval);
    console.log("Симуляция успешно завершена!");
    return;}

    let lastSmartDecision = null;
    let lastDumbDecision = null;

    // Ровно simSpeed атомарных секунд физики за кадр
    for (let i = 0; i < simSpeed; i++) {
        stepCount++;

        lastSmartDecision = smartController.update(smartPhysics.T_furnace, smartPhysics.T_water, smartPhysics.m_wood);
        lastDumbDecision = dumbController.update(dumbPhysics.T_furnace, dumbPhysics.T_water);

        smartPhysics.step(lastSmartDecision.fanSpeed);
        dumbPhysics.step(lastDumbDecision.fanSpeed);

        if (smartPhysics.m_wood <= 0 && dumbPhysics.m_wood <= 0) break;
    }

    // Обновление UI строго 1 раз за кадр
    updatePhaseUI(lastSmartDecision);
    updateBoilerVideo(lastSmartDecision.phaseName);
    updateMetricsAndCharts(lastSmartDecision.fanSpeed, lastDumbDecision.fanSpeed);
}

function updateBoilerVideo(phaseName) {
    const vDrying = document.getElementById('video-drying');
    const vActive = document.getElementById('video-active');
    const vCoals  = document.getElementById('video-coals');

    if (!vDrying || !vActive || !vCoals) return;

    let activeVideo = vActive;

    if (phaseName.includes("1.")) activeVideo = vDrying;
    else if (phaseName.includes("4.") || smartPhysics.m_wood < 2.5) activeVideo = vCoals;

    [vDrying, vActive, vCoals].forEach(vid => {
        if (vid === activeVideo) {
            if (vid.style.display !== 'block') {
                vid.style.display = 'block';
                vid.play().catch(() => {});
            }
        } else {
            vid.style.display = 'none';
            vid.pause();
        }
    });
}

function updatePhaseUI(decision) {
    const badge = document.getElementById('current-phase-badge');
    const desc = document.getElementById('phase-explanation');

    if (desc) desc.innerText = decision.phaseName;

    if (badge) {
        badge.innerText = decision.phaseName;
        if (decision.phaseName.includes("1.")) badge.style.background = "#7c2d12";
        else if (decision.phaseName.includes("2.")) badge.style.background = "#1e3a8a";
        else if (decision.phaseName.includes("3.")) badge.style.background = "#b45309";
        else if (decision.phaseName.includes("4.")) badge.style.background = "#3f3f46";
        else badge.style.background = "#dc2626";
    }
}

function updateMetricsAndCharts(smartFan, dumbFan) {
    // Рассчитываем реальный накопительный КПД обогрева
    const smartKPD = smartPhysics.getEfficiency();
    const dumbKPD = dumbPhysics.getEfficiency();

    // Расчет экономии топлива на основе разницы КПД (физически сглаженный и точный)
    let savedPercent = "0.0";
    if (dumbKPD > 0 && smartPhysics.m_burned > 0.2) {
        // Экономия % = (1 - (КПД_обычный / КПД_смарт)) * 100
        const diff = (1 - (dumbKPD / Math.max(1, smartKPD))) * 100;
        savedPercent = Math.max(0, diff).toFixed(1);
    }

    const mFuelSaved = document.getElementById('m-fuel-saved');
    if (mFuelSaved) mFuelSaved.innerText = `${savedPercent} %`;

    const mKpd = document.getElementById('m-kpd');
    const mKpdDiff = document.getElementById('m-kpd-diff');
    if (mKpd) mKpd.innerText = `${smartKPD} %`;
    if (mKpdDiff) mKpdDiff.innerText = `Обычный котел: ${dumbKPD}% КПД`;

    // Отрисовка графиков...
    if (chartTemps && chartFuel) {
        const totalSec = Math.floor(stepCount);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        const timeLabel = `${min}м ${sec < 10 ? '0' : ''}${sec}с`;

        if (chartTemps.data.labels.length > 90) {
            chartTemps.data.labels.shift();
            chartTemps.data.datasets.forEach(d => d.data.shift());
            chartFuel.data.labels.shift();
            chartFuel.data.datasets.forEach(d => d.data.shift());
        }

        chartTemps.data.labels.push(timeLabel);
        chartTemps.data.datasets[0].data.push(smartPhysics.T_water);
        chartTemps.data.datasets[1].data.push(dumbPhysics.T_water);
        chartTemps.data.datasets[2].data.push(smartFan);
        chartTemps.update('none');

        chartFuel.data.labels.push(timeLabel);
        chartFuel.data.datasets[0].data.push(smartPhysics.getFuelPercent());
        chartFuel.data.datasets[1].data.push(dumbPhysics.getFuelPercent());
        chartFuel.update('none');
    }
}

function initCharts() {
    const configCommon = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 10, font: { size: 10 } } } },
        scales: {
            x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: '#1e293b' } },
            y: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: '#1e293b' } }
        }
    };

    const canvasTemps = document.getElementById('chartTemps');
    const canvasFuel = document.getElementById('chartFuel');

    if (!canvasTemps || !canvasFuel) return;

    if (chartTemps) chartTemps.destroy();
    if (chartFuel) chartFuel.destroy();

    chartTemps = new Chart(canvasTemps, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Вода (Адаптивный), °C', data: [], borderColor: '#3b82f6', borderWidth: 2, pointRadius: 0, tension: 0.2 },
                { label: 'Вода (Обычный), °C', data: [], borderColor: '#ef4444', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0, tension: 0.2 },
                { label: 'Наддув (Адаптивный), %', data: [], borderColor: '#10b981', borderWidth: 1, pointRadius: 0, tension: 0.1 }
            ]
        },
        options: configCommon
    });

    chartFuel = new Chart(canvasFuel, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Адаптивный котел (%)', data: [], borderColor: '#10b981', borderWidth: 2, pointRadius: 0, tension: 0.2 },
                { label: 'Обычный котел (%)', data: [], borderColor: '#ef4444', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0, tension: 0.2 }
            ]
        },
        options: configCommon
    });
}
