import { SystemController } from './controller.js';
import { setupUI } from './ui.js';
import { Sack, SackSmallBag } from './sack.js';

const canvas = document.getElementById('factoryCanvas');
const weightDisplay = document.getElementById('weightVal');
const statusIndicator = document.getElementById('statusIndicator');
const speedRange = document.getElementById('speedRange');

// machine B elements
const canvas2 = document.getElementById('factoryCanvas2');
const weightDisplay2 = document.getElementById('weightVal2');
const speedRange2 = document.getElementById('speedRange2');

canvas.width = 950;
canvas.height = 350;
if (canvas2) {
    canvas2.width = 950;
    canvas2.height = 350;
}

const CONFIG = {
    beltY: 220,
    beltHeight: 15,
    rollerRadius: 18,
    targetMin: 25.000,
    targetMax: 25.110,
    // sensor accuracy (measurement error) ±0.005 kg (±5 g)
    sensorAccuracy: 0.005,
    // bagging machine accuracy for produced objects ±0.015 kg (±15 g)
    baggingAccuracy: 0.015,
    // reject tolerance when weighing compared to bagging nominal ±0.005 kg (±5 g)
    rejectAccuracy: 0.005,
    // detector radar sweep speed (radians per update)
    detectorSweepSpeed: 0.02,
    // base product and empty bag weights (kg)
    baseProductWeight: 25.00,
    emptyBagWeight: 0.010,
    sackWidth: 45,
    sackHeight: 55,
    weighingCenter: 475
};

// package presets for small and large bags
CONFIG.packages = {
    small: {
        product: 25.0,
        empty: 0.01,
        giveaway: 0.02,
        // stage2 explicit pass range (widened so small bags are not rejected frequently)
        stage2Min: 25.000,
        stage2Max: 25.110,
        // per-package bagging tolerance (kg) to achieve ~90:10 pass:reject
        tolerance: 0.03
    },
    large: {
        product: 750.0,
        empty: 3.5,
        giveaway: 0.5,
        stage2Min: 753.5,
        stage2Max: 754.0
    }
};

// bagging machine throughput (kg per hour)
CONFIG.baggingRateKgPerHour = 30000; // 30 t/h

const DEFAULTS = {
    baseProductWeight: 25.00,
    emptyBagWeight: 0.010,
    baggingAccuracy: 0.015,
    sensorAccuracy: 0.005,
    rejectAccuracy: 0.005,
    targetMin: 25.000,
    targetMax: 25.110
    ,detectorSweepSpeed: 0.02
};

const domRefs = {
    weightDisplay,
    statusMetal: document.getElementById('statusMetal'),
    statusWeighing: document.getElementById('statusWeighing'),
    speedRange
};

const controller = new SystemController(canvas, domRefs, CONFIG);

// create second controller instance if canvas2 exists
let controller2 = null;
if (canvas2) {
    const domRefs2 = {
        weightDisplay: weightDisplay2,
        statusMetal: document.getElementById('statusMetal2'),
        statusWeighing: document.getElementById('statusWeighing2'),
        speedRange: speedRange2
    };
    // clone CONFIG so future per-machine tweaks are independent
    const CONFIG2 = Object.assign({}, CONFIG);
    controller2 = new SystemController(canvas2, domRefs2, CONFIG2);
}

// Setup UI controls that allow the user to change bagging targets and accuracies
setupUI(CONFIG, DEFAULTS);

// Tooltip logic: show metal detector details on hover
const tooltip = document.getElementById('detectorTooltip');
function showDetectorTooltip(clientX, clientY) {
    if (!tooltip) return;
    tooltip.classList.remove('hidden');
    tooltip.innerHTML = `
        <div style="font-weight:bold;margin-bottom:6px">Metal Detector</div>
        <div>Ferrous — size 2.5 mm</div>
        <div>Non-ferrous — size 3 mm</div>
        <div>Stainless steel — size 3 mm</div>
    `;
    // position a bit offset from mouse
    tooltip.style.left = (clientX + 12) + 'px';
    tooltip.style.top = (clientY + 12) + 'px';
}
function hideDetectorTooltip() {
    if (!tooltip) return;
    tooltip.classList.add('hidden');
}

function installTooltipForCanvas(cvs, ctl) {
    if (!cvs || !ctl) return;
    cvs.addEventListener('mousemove', (e) => {
        const rect = cvs.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const det = ctl.metalDetectorRegion();
        const tunnelY = det.y;
        const tunnelH = det.h;
        if (x >= det.x && x <= det.x + det.w && y >= tunnelY && y <= tunnelY + tunnelH) {
            showDetectorTooltip(e.clientX, e.clientY);
        } else {
            hideDetectorTooltip();
        }
    });
    cvs.addEventListener('mouseleave', hideDetectorTooltip);
}

installTooltipForCanvas(canvas, controller);
installTooltipForCanvas(canvas2, controller2);

function animate() {
    controller.update();
    controller.draw();
    if (controller2) {
        controller2.update();
        controller2.draw();
    }
    requestAnimationFrame(animate);
}

window.addEventListener('load', () => {
    // wire small bag toggles to swap Sack class and update package CONFIG
    const smallBagToggle = document.getElementById('smallBagToggle');
    const smallBagToggle2 = document.getElementById('smallBagToggle2');

    function computeSpawnFrames(productWeight, multiplier = 1) {
        // spawn interval seconds based on bagging rate: interval = (productWeight * 3600) / rate
        const effectiveRate = (CONFIG.baggingRateKgPerHour || 30000) * (multiplier || 1);
        const intervalSec = (productWeight * 3600) / effectiveRate;
        // assume ~60fps for animation -> frames
        return Math.max(10, Math.round(intervalSec * 60));
    }

    function applyToggle(ctrl, checked, preset) {
        if (!ctrl) return;
        ctrl.SackClass = checked ? SackSmallBag : Sack;
        // apply package preset values into controller.CONFIG
        const p = preset || (checked ? CONFIG.packages.small : CONFIG.packages.large);
        ctrl.CONFIG.baseProductWeight = p.product;
        ctrl.CONFIG.emptyBagWeight = p.empty;
        ctrl.CONFIG.giveawayWeight = p.giveaway;
        // apply per-package bagging tolerance if provided (overrides global)
        if (p.tolerance !== undefined) ctrl.CONFIG.baggingAccuracy = p.tolerance;
        else ctrl.CONFIG.baggingAccuracy = CONFIG.baggingAccuracy;
        ctrl.CONFIG.stage2Min = p.stage2Min;
        ctrl.CONFIG.stage2Max = p.stage2Max;
        // spawn frames derived from product weight; auto-enable ×10 for large bags
        const multiplier = (p === CONFIG.packages.large) ? 10 : 1;
        ctrl.spawnFrames = computeSpawnFrames(p.product, multiplier);
        // update display default to show package product weight until measured
        if (ctrl.dom && ctrl.dom.weightDisplay) {
            ctrl.dom.weightDisplay.textContent = p.product.toFixed(3);
        }
        // update global target info summary (top header)
        try {
            const info = document.getElementById('targetInfo');
            if (info) {
                const bagging = (p.tolerance !== undefined) ? p.tolerance : CONFIG.baggingAccuracy;
                const wmin = (p.stage2Min !== undefined) ? p.stage2Min : (CONFIG.targetMin || 0);
                const wmax = (p.stage2Max !== undefined) ? p.stage2Max : (CONFIG.targetMax || 0);
                info.textContent = `Target: ${wmin.toFixed(3)} - ${wmax.toFixed(3)} kg | Bagging: ±${bagging.toFixed(3)} kg | Weighing tolerance: ±${(CONFIG.rejectAccuracy || 0.005).toFixed(3)} kg`;
            }
        } catch (e) {}
        // reset spawn timer so new preset takes effect immediately
        try {
            ctrl.spawnTimer = 0;
            // create one immediate sample bag so user sees the new package shape immediately
            ctrl.sacks.push(new ctrl.SackClass(45, ctrl.CONFIG.beltY, ctrl.CONFIG));
        } catch (err) {
            // ignore if controller not fully initialized
        }
        // update order panel to reflect selected package preset
        try {
            const isSmall = (p === CONFIG.packages.small);
            updateOrderPanelForPreset(isSmall ? 'small' : 'large');
            // change bagging machine colour subtly based on preset so user can see the difference
            try {
                if (ctrl) {
                    if (p === CONFIG.packages.small) {
                        ctrl.machineColor = '#0ea5a4'; // teal for small-bag mode
                        ctrl.machineAccent = '#2dd4bf';
                    } else {
                        ctrl.machineColor = '#475569'; // default
                        ctrl.machineAccent = '#64748b';
                    }
                }
            } catch (e) {}
        } catch (e) {}
    }

    // set small bag as active by default
    const prepareDelayMs = 4000; // initial preparation delay
    const maxWaitMs = 30000; // maximum wait for last bag to clear

    function waitForLastBagPass(ctrl, timeoutMs) {
        return new Promise((resolve) => {
            if (!ctrl || !ctrl.sacks) return resolve(true);
            const start = Date.now();
            const checkInterval = 250;
            const timer = setInterval(() => {
                // consider a bag "blocking" if it hasn't been measured and is before weighing center
                const blocking = ctrl.sacks.some(s => (!s.isMeasured) && (s.x < (ctrl.CONFIG.weighingCenter + 10)) && (s.opacity > 0));
                if (!blocking) {
                    clearInterval(timer);
                    resolve(true);
                    return;
                }
                if (Date.now() - start > (timeoutMs || maxWaitMs)) {
                    clearInterval(timer);
                    resolve(false);
                    return;
                }
            }, checkInterval);
        });
    }

    if (smallBagToggle) {
        smallBagToggle.checked = true;
        // apply immediately on load
        applyToggle(controller, smallBagToggle.checked, CONFIG.packages.small);
        // on user toggle: show preparing, wait a bit, then wait for last bag to pass weighing before applying
            smallBagToggle.addEventListener('change', (e) => {
                const checked = e.target.checked;
                if (controller && controller.updateWeighingStatus) controller.updateWeighingStatus('PREPARING', '#f59e0b', 'PREPARING');
                smallBagToggle.disabled = true;
                // Immediately pause spawning so production stops right away
                if (controller) controller.spawnPaused = true;
                // After a short prepare delay, apply the new preset and resume spawning
                setTimeout(async () => {
                    applyToggle(controller, checked);
                    // reset spawn timer so the new production restarts cleanly and continuously
                    if (controller) {
                        controller.spawnTimer = 0;
                        controller.spawnPaused = false;
                    }
                    smallBagToggle.disabled = false;
                    if (controller && controller.updateWeighingStatus) controller.updateWeighingStatus('STANDING BY', '#34d399', 'STANDING BY');
                }, prepareDelayMs);
            });
    }

    if (smallBagToggle2) {
        // default Machine B to LARGE (toggle unchecked) so behavior differs from Machine A
        smallBagToggle2.checked = false;
        applyToggle(controller2, smallBagToggle2.checked, CONFIG.packages.large);
        smallBagToggle2.addEventListener('change', (e) => {
            const checked = e.target.checked;
            if (controller2 && controller2.updateWeighingStatus) controller2.updateWeighingStatus('PREPARING', 'bg-slate-500 text-white');
            smallBagToggle2.disabled = true;
                if (controller2) controller2.spawnPaused = true;
                setTimeout(async () => {
                    applyToggle(controller2, checked);
                    if (controller2) {
                        controller2.spawnTimer = 0;
                        controller2.spawnPaused = false;
                    }
                    smallBagToggle2.disabled = false;
                    if (controller2 && controller2.updateWeighingStatus) controller2.updateWeighingStatus('STANDING BY', '#34d399', 'STANDING BY');
                }, prepareDelayMs);
        });
    }

    // Demo multiplier is applied automatically by `applyToggle` based on bag preset

    // --- Order data and UI ---
    const ORDERS = {
        small: {
            bagging_silo: '91T060A',
            bagging_line: 'A/B',
            lot_no: '0260104002',
            type: '1126NK',
            quantity_mt: 388.79,
            remark: 'PREMIUM',
            package_kg: 25
        },
        large: {
            bagging_silo: '91T061A',
            bagging_line: 'A',
            lot_no: '7251104032',
            type: '1126NK',
            quantity_mt: 388.79,
            remark: 'PREMIUM',
            package_kg: 750
        }
    };

    // For demo: assume production started today at 09:00 and currently 35% complete
    const DEMO_START_HOUR = 9;
    const DEMO_PROGRESS = 0.35;

    function formatDateTime(dt){
        if(!dt) return '—';
        const y = dt.getFullYear();
        const m = String(dt.getMonth()+1).padStart(2,'0');
        const d = String(dt.getDate()).padStart(2,'0');
        const hh = String(dt.getHours()).padStart(2,'0');
        const mm = String(dt.getMinutes()).padStart(2,'0');
        return `${y}-${m}-${d} ${hh}:${mm}`;
    }

    function updateOrderPanelForPreset(which, suffix = ''){
        try{
            const panelId = suffix ? `orderPanel${suffix}` : 'orderPanel';
            const orderTypeId = suffix ? `orderType${suffix}` : 'orderType';
            const orderMetaId = suffix ? `orderMeta${suffix}` : 'orderMeta';
            const producedId = suffix ? `producedVal${suffix}` : 'producedVal';
            const progressFillId = suffix ? `progressBarFill${suffix}` : 'progressBarFill';

            const panel = document.getElementById(panelId);
            if(!panel) return;
            // mark this panel as active and remove active from other panel(s)
            try {
                const other = (suffix === '2') ? document.getElementById('orderPanel') : document.getElementById('orderPanel2');
                if (other && other.classList) other.classList.remove('active');
                if (panel && panel.classList) panel.classList.add('active');
            } catch (e) {}
            const order = ORDERS[which] || ORDERS.small;
            const totalKg = order.quantity_mt * 1000;
            const packageKg = order.package_kg || (which === 'small' ? 25 : 750);
            const totalBags = Math.floor(totalKg / packageKg);
            const producedBags = Math.round(totalBags * DEMO_PROGRESS);
            const producedKg = producedBags * packageKg;
            const remainKg = Math.max(0, totalKg - producedKg);

            // ETA using CONFIG.baggingRateKgPerHour
            const rateKgPerHour = CONFIG.baggingRateKgPerHour || 30000;
            const hoursRemain = remainKg / rateKgPerHour;
            const eta = new Date(Date.now() + hoursRemain * 3600 * 1000);

            // start time today at 09:00
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DEMO_START_HOUR, 0, 0);

            // update DOM
            const orderType = document.getElementById(orderTypeId);
            const orderMeta = document.getElementById(orderMetaId);
            const producedVal = document.getElementById(producedId);
            const progressVal = document.getElementById('progressVal');

            // show concise labels, move details into tooltips
            if(orderType) {
                orderType.textContent = `${packageKg} kg`;
                orderType.title = `${packageKg} kg — ${order.type} (${order.remark})`;
            }
            if(orderMeta) {
                orderMeta.innerHTML = `
                    <span class="order-key">Lot:</span>
                    <span class="order-val">${order.lot_no}</span>
                    <span class="order-sep">|</span>
                    <span class="order-key">Silo:</span>
                    <span class="order-val">${order.bagging_silo}</span>
                    <span class="order-sep">|</span>
                    <span class="order-key">Line:</span>
                    <span class="order-val">${order.bagging_line}</span>
                `;
            }
            if(producedVal) {
                producedVal.textContent = `${producedBags}`;
                producedVal.title = `${producedBags} / ${totalBags} ( ${ (producedKg/1000).toFixed(2) } mt )`;
            }
            // remain and ETA are moved into tooltip; update produced/progress/etc.
            if(progressVal) progressVal.textContent = `${Math.round(DEMO_PROGRESS*100)} %`;
            // fill progress bar
            const pb = document.getElementById(progressFillId);
            if(pb) pb.style.width = `${Math.min(100, Math.round(DEMO_PROGRESS*100))}%`;

            // No per-machine positional overrides — keep Machine B panel same as Machine A

            // build tooltip details: include Remain, ETA, Live Weight, Bag Shape, Control Status, Settings, Legend
            try {
                const liveWeightEl = document.getElementById(suffix === '2' ? 'weightVal2' : 'weightVal');
                const bagToggle = document.getElementById(suffix === '2' ? 'smallBagToggle2' : 'smallBagToggle');
                const mdEl = document.getElementById(suffix === '2' ? 'statusMetal2' : 'statusMetal');
                const weighEl = document.getElementById(suffix === '2' ? 'statusWeighing2' : 'statusWeighing');
                const speedEl = document.getElementById(suffix === '2' ? 'speedRange2' : 'speedRange');

                const liveWeight = liveWeightEl ? liveWeightEl.textContent.trim() : '—';
                const bagShape = (bagToggle && bagToggle.checked) ? 'Small Bag' : 'Large Bag';
                const mdText = mdEl ? mdEl.innerText.trim().replace(/\s+/g,' ') : 'MD: —';
                const weighText = weighEl ? weighEl.innerText.trim().replace(/\s+/g,' ') : 'Weighing: —';
                const speedText = speedEl ? speedEl.value : '1';

                const tooltipLines = [];
                tooltipLines.push(`${packageKg} kg — ${order.type} (${order.remark})`);
                tooltipLines.push(`Lot: ${order.lot_no} | Silo: ${order.bagging_silo} | Line: ${order.bagging_line}`);
                tooltipLines.push('');
                tooltipLines.push(`Produced: ${producedBags} / ${totalBags} ( ${ (producedKg/1000).toFixed(2) } mt )`);
                tooltipLines.push(`Remain(kg): ${remainKg.toLocaleString(undefined,{maximumFractionDigits:2})} kg`);
                tooltipLines.push(`ETA: ${formatDateTime(eta)}`);
                tooltipLines.push('');
                tooltipLines.push(`Live Weight: ${liveWeight}`);
                tooltipLines.push(`Bag Shape: ${bagShape}`);
                tooltipLines.push(`Control Status:`);
                tooltipLines.push(`  ${mdText}`);
                tooltipLines.push(`  ${weighText}`);
                tooltipLines.push(`Settings: Speed ${speedText}`);
                tooltipLines.push('Legend: Ferrous, Non-ferrous, Stainless steel');

                if (panel) panel.title = tooltipLines.join('\n');
            } catch (e) { /* silent */ }
        }catch(e){/*silent*/}
    }

    // initialize order panels for default presets
    updateOrderPanelForPreset('small', '');
    updateOrderPanelForPreset('large', '2');

    // Align right-hand feed boxes with their corresponding machines (A/B)
    function alignFeeds() {
        try {
            const aside = document.querySelector('aside');
            const bagFeed = document.getElementById('bagFeed');
            const bagFeed2 = document.getElementById('bagFeed2');
            const machineA = document.getElementById('machineA');
            const machineB = document.getElementById('machineB');
            if (!aside || !bagFeed || !bagFeed2 || !machineA || !machineB) return;

            // Only apply on wide layouts where side column sits next to machines
            if (window.innerWidth < 980) {
                bagFeed.style.marginTop = '';
                bagFeed2.style.marginTop = '';
                return;
            }

            const asideRect = aside.getBoundingClientRect();

            // Prefer the machine's main canvas/display area so feeds align with the visual machine
            const canvasA = machineA.querySelector('#factoryCanvas, canvas, .shadow-canvas');
            const canvasB = machineB.querySelector('#factoryCanvas2, canvas, .shadow-canvas');
            const wrapA = canvasA || machineA.querySelector('.machine-wrap') || machineA;
            const wrapB = canvasB || machineB.querySelector('.machine-wrap') || machineB;
            const aRect = wrapA.getBoundingClientRect();
            const bRect = wrapB.getBoundingClientRect();

            // Compute offsets relative to the aside top
            // Align feed top edges to the machine canvas top edge for a level-mounted appearance
            // Per-machine visual nudges: keep A slightly tucked up, and allow B an extra downward offset
            const FEED_VERTICAL_OFFSET = -12; // visual nudge (px) to tuck feed slightly higher for Machine A
            const FEED2_ADDITIONAL = 140; // extra pixels to move Machine B feed further down (adjustable)
            const topA = Math.max(0, Math.round(aRect.top - asideRect.top + FEED_VERTICAL_OFFSET));
            const topB = Math.max(0, Math.round(bRect.top - asideRect.top + FEED_VERTICAL_OFFSET + FEED2_ADDITIONAL));

            // Apply transforms so the feed boxes' top edges line up with each machine visual top
            // Compute using absolute bounding rects (viewport coords) to avoid offsetParent inconsistencies.
            try {
                const bagRect = bagFeed.getBoundingClientRect();
                const bag2Rect = bagFeed2.getBoundingClientRect();

                // target absolute top positions (viewport coords)
                const targetAAbs = Math.round(aRect.top + FEED_VERTICAL_OFFSET);
                const targetBAbs = Math.round(bRect.top + FEED_VERTICAL_OFFSET + FEED2_ADDITIONAL);

                // deltas to move current feed top to target top
                const deltaA = Math.round(targetAAbs - bagRect.top);
                const deltaB = Math.round(targetBAbs - bag2Rect.top);

                bagFeed.style.transform = `translateY(${deltaA}px)`;
                bagFeed2.style.transform = `translateY(${deltaB}px)`;
            } catch (e) {
                // fallback to margin-top (relative to aside) if transform fails
                bagFeed.style.marginTop = topA + 'px';
                bagFeed2.style.marginTop = topB + 'px';
            }
        } catch (e) { /* silent */ }
    }

    // Debounced resize handler
    let _alignTimer = null;
    window.addEventListener('resize', () => {
        if (_alignTimer) clearTimeout(_alignTimer);
        _alignTimer = setTimeout(() => requestAnimationFrame(alignFeeds), 120);
    });

    // Also realign on scroll (passive) to handle user scrolling
    window.addEventListener('scroll', () => { requestAnimationFrame(alignFeeds); }, { passive: true });

    // If the hopper iframe exists, re-run alignment after it loads (layout may shift)
    try {
        const hopper = document.querySelector('.hopper-iframe');
        if (hopper) hopper.addEventListener('load', () => setTimeout(() => alignFeeds(), 80));
    } catch (e) {}

    // Run alignment several times after load to allow layout/iframes/CSS to stabilise
    const runAlignRetries = () => {
        try {
            alignFeeds();
            setTimeout(alignFeeds, 150);
            setTimeout(alignFeeds, 400);
            setTimeout(alignFeeds, 800);
        } catch (e) {}
    };

    // Run once after a short delay and with retries
    setTimeout(runAlignRetries, 300);

    animate();
});



// Bag feed helper: adds an entry to the UI feed (bottom-up). Keeps a maximum number of items.
window.addFeedEntry = function addFeedEntry(entry) {
    try {
        // route to per-machine feed if machine id provided
        let list = document.getElementById('bagFeedList');
        try {
            if (entry && entry.machine && String(entry.machine).includes('factoryCanvas2')) {
                const alt = document.getElementById('bagFeedList2');
                if (alt) list = alt;
            }
        } catch (e) {}
        if (!list) return;
        console.log('addFeedEntry called', entry);
        const li = document.createElement('li');
        // classify item as pass or reject for styling
        const cls = (entry && entry.status && entry.status.toLowerCase().includes('pass')) ? 'pass' : (entry && entry.status && entry.status.toLowerCase().includes('reject')) ? 'reject' : '';
        li.className = `feed-item ${cls}`;
        const time = entry.time || new Date();
        const hh = String(time.getHours()).padStart(2,'0');
        const mm = String(time.getMinutes()).padStart(2,'0');
        const ss = String(time.getSeconds()).padStart(2,'0');
        const ts = `${hh}:${mm}:${ss}`;
        const weight = (entry.weight !== undefined) ? Number(entry.weight).toFixed(3) : '—';
        const status = entry.status || entry.statusText || 'UNKNOWN';

        // Use a 3-column structure (time | weight | status) with small helper classes
        // metal status column (entry.metal expected as string like 'OK' or 'Ferrous')
        const metalText = (entry && entry.metal) ? String(entry.metal) : 'OK';
        let metalClass = 'metal-ok';
        const m = metalText.toLowerCase();
        if (m.includes('ferrous')) metalClass = 'metal-ferrous';
        else if (m.includes('non') || m.includes('non-ferrous')) metalClass = 'metal-nonferrous';
        else if (m.includes('stainless')) metalClass = 'metal-stainless';
        else if (m === 'ok' || m === 'md: ok' || m === 'md: ok') metalClass = 'metal-ok';

        li.innerHTML = `
            <div class="time">${ts}</div>
            <div class="weight">${weight} kg</div>
            <div class="metal ${metalClass}">${metalText}</div>
            <div class="status">${status}</div>
        `;

        // determine if user is at (or near) bottom before appending
        const nearBottom = (list.scrollHeight - list.clientHeight - list.scrollTop) <= 40;

        // append to list (newest goes to bottom)
        list.appendChild(li);

        // animate in using transition class
        requestAnimationFrame(() => setTimeout(() => li.classList.add('show'), 10));

        // color weight/status according to pass/reject/warn
        try {
            const weightEl = li.querySelector('.weight');
            const statusEl = li.querySelector('.status');
            const statLower = (status || '').toLowerCase();
            if (cls === 'pass' || statLower.includes('pass')) {
                weightEl.classList.add('val-normal');
                statusEl.classList.add('val-normal');
            } else if (statLower.includes('stage2') || statLower.includes('warn')) {
                weightEl.classList.add('val-warn');
                statusEl.classList.add('val-warn');
            } else {
                weightEl.classList.add('val-reject');
                statusEl.classList.add('val-reject');
            }
        } catch (e) {}

        // keep at most N entries (stack size)
        const MAX = 9;
        while (list.children.length > MAX) {
            // remove oldest (the first child in DOM order)
            list.removeChild(list.children[0]);
        }

        // scroll to bottom only if user was near the bottom
        try { if (nearBottom) list.scrollTop = list.scrollHeight; } catch (e) {}

        // auto-remove after lifespan (optional)
        const lifespan = 60 * 1000; // 60s
        setTimeout(() => {
            if (li.parentNode) li.parentNode.removeChild(li);
        }, lifespan);
    } catch (err) {
        // silent
    }
};

// debug: add a sample feed entry shortly after load to verify UI
setTimeout(() => {
    try {
        if (window && typeof window.addFeedEntry === 'function') {
            window.addFeedEntry({ time: new Date(), weight: 25.123, status: 'PASSED' });
        }
    } catch (e) {}
}, 600);

// Mobile: toggle expanded order panel to reveal desktop-only details
document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'orderExpandBtn') {
        const panel = document.getElementById('orderPanel');
        if (panel) panel.classList.toggle('expanded-mobile');
    }
    if (t.id === 'orderExpandBtn2') {
        const panel = document.getElementById('orderPanel2');
        if (panel) panel.classList.toggle('expanded-mobile');
    }
});
