// UI helpers: bind inputs to CONFIG and provide reset functionality
export function setupUI(CONFIG, DEFAULTS) {
    // Create controls dynamically if not present in DOM
    const container = document.querySelector('main .container') || document.body;

    // Do not create a simulated settings panel automatically.
    // If the host page provides elements with the expected IDs, bind to them below.
    let settings = document.getElementById('simSettings');

    const baggingInput = document.getElementById('baggingAccuracyInput');
    const baggingAccLabel = document.getElementById('baggingAccLabel');
    const weighingAccLabel = document.getElementById('weighingAccLabel');
    const emptyBagInput = document.getElementById('emptyBagInput');
    const targetMinInput = document.getElementById('targetMinInput');
    const targetMaxInput = document.getElementById('targetMaxInput');
    const resetBtn = document.getElementById('resetSimBtn');

    // Only wire up controls if the host page provided them. This avoids
    // dynamically injecting a settings panel and prevents overlapping UI.
    if (baggingInput || emptyBagInput || targetMinInput || targetMaxInput || resetBtn) {
        function updateBaggingAccuracyFromInput() {
            const val = parseFloat(baggingInput.value);
            if (!isNaN(val)) {
                CONFIG.baggingAccuracy = val;
                if (baggingAccLabel) baggingAccLabel.textContent = `${Math.round(val * 1000)} g`;
            }
        }

        function updateEmptyBagFromInput() {
            const val = parseFloat(emptyBagInput.value);
            if (!isNaN(val)) {
                CONFIG.emptyBagWeight = val / 1000;
            }
        }

        function updateTargetsFromInput() {
            const minV = parseFloat(targetMinInput.value);
            const maxV = parseFloat(targetMaxInput.value);
            if (!isNaN(minV)) CONFIG.targetMin = minV;
            if (!isNaN(maxV)) CONFIG.targetMax = maxV;
        }

        if (baggingInput) baggingInput.addEventListener('input', updateBaggingAccuracyFromInput);
        if (emptyBagInput) emptyBagInput.addEventListener('input', updateEmptyBagFromInput);
        if (targetMinInput) targetMinInput.addEventListener('input', updateTargetsFromInput);
        if (targetMaxInput) targetMaxInput.addEventListener('input', updateTargetsFromInput);

        if (resetBtn) resetBtn.addEventListener('click', () => {
            CONFIG.baseProductWeight = DEFAULTS.baseProductWeight;
            CONFIG.emptyBagWeight = DEFAULTS.emptyBagWeight;
            CONFIG.baggingAccuracy = DEFAULTS.baggingAccuracy;
            CONFIG.sensorAccuracy = DEFAULTS.sensorAccuracy;
            CONFIG.rejectAccuracy = DEFAULTS.rejectAccuracy;
            CONFIG.targetMin = DEFAULTS.targetMin;
            CONFIG.targetMax = DEFAULTS.targetMax;

            if (baggingInput) baggingInput.value = CONFIG.baggingAccuracy;
            if (baggingAccLabel) baggingAccLabel.textContent = `${Math.round(CONFIG.baggingAccuracy * 1000)} g`;
            if (weighingAccLabel) weighingAccLabel.textContent = `${Math.round(CONFIG.sensorAccuracy * 1000)} g`;
            if (emptyBagInput) emptyBagInput.value = Math.round(CONFIG.emptyBagWeight * 1000);
            if (targetMinInput) targetMinInput.value = CONFIG.targetMin;
            if (targetMaxInput) targetMaxInput.value = CONFIG.targetMax;
        });

        // initial label update
        if (baggingInput) updateBaggingAccuracyFromInput();
        if (targetMinInput) updateTargetsFromInput();
    }
}
