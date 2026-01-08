import { Sack } from './sack.js';
import { Conveyor } from './conveyor.js';

export class SystemController {
    constructor(canvas, domRefs, CONFIG) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.dom = domRefs;
        this.CONFIG = CONFIG;
        // allow swapping the Sack drawing/behavior class at runtime
        this.SackClass = Sack;

        this.belts = [
            new Conveyor(50, 280, "STAGE 1: INFEED", "#3b82f6"),
            new Conveyor(340, 270, "STAGE 2: WEIGHING", "#eab308"),
            new Conveyor(620, 280, "STAGE 3: OUTFEED", "#22c55e")
        ];

        this.sacks = [];
        this.spawnTimer = 0;
        this.spawnFrames = 120;
        this.spawnPaused = false;
        // Interpret the speed range control such that the actual speed
        // is 10% of the slider value (matches user testing)
        const rawSpeed = parseFloat((this.dom && this.dom.speedRange && this.dom.speedRange.value) || 0);
        this.speed = Number.isFinite(rawSpeed) ? rawSpeed * 0.1 : 1.0;
        this.currentDisplayWeight = 0;
        this.currentDisplayColor = '#94a3b8';
        this.sweepAngle = 0; // radar sweep angle (radians)
        // configurable machine colours (can be toggled from UI)
        this.machineColor = '#475569';
        this.machineAccent = '#64748b';
    }

    update() {
        // read speed safely — guard in case the control is not present
        try {
            const rawVal = (this.dom && this.dom.speedRange && this.dom.speedRange.value);
            const parsed = parseFloat(rawVal);
            if (Number.isFinite(parsed)) this.speed = parsed;
        } catch (e) {
            // keep previous speed if DOM control missing
        }
        this.spawnTimer++;

        // advance radar sweep using configured speed
        const sweepDelta = (this.CONFIG.detectorSweepSpeed !== undefined) ? this.CONFIG.detectorSweepSpeed : 0.06;
        this.sweepAngle += sweepDelta; // rotation speed
        if (this.sweepAngle > Math.PI * 2) this.sweepAngle -= Math.PI * 2;

        const sf = (this.spawnFrames || 120) / Math.max(0.1, this.speed);
        if (!this.spawnPaused && this.spawnTimer > sf) {
            this.sacks.push(new this.SackClass(45, this.CONFIG.beltY, this.CONFIG));
            this.spawnTimer = 0;
        }

        this.sacks.forEach((sack, index) => {
            sack.update(this.speed, this.CONFIG);

            // metal detector check (only when sack passes through tunnel center)
            const det = this.metalDetectorRegion();
            const detCenterX = det.x + det.w / 2;
            if (sack.x >= detCenterX && !sack.metalChecked) {
                // mark that sack passed detector center; only flag metal, do NOT reject here
                sack.metalChecked = true;
                if (sack.metalType && sack.metalType !== 'NONE') {
                    sack.metalDetected = true;
                    // map metal type to display name and color class
                    const type = sack.metalType;
                    let display = '';
                    let classes = 'bg-red-600 text-white';
                    if (type === 'FERROUS') { display = 'Ferrous'; classes = 'bg-red-600 text-white'; }
                    else if (type === 'NON_FERROUS') { display = 'Non-ferrous'; classes = 'bg-amber-500 text-white'; }
                    else if (type === 'STAINLESS') { display = 'Stainless steel'; classes = 'bg-blue-500 text-white'; }
                    this.updateMetalStatus(`MD: ${display}`, classes);
                } else {
                    this.updateMetalStatus('MD: OK', 'bg-green-500 text-white');
                }
            }

            // when sack reaches weighing center, take a measurement and process
            if (sack.x >= this.CONFIG.weighingCenter && !sack.isMeasured) {
                this.senseWeight(sack);
                this.processResult(sack);
            }
        });
        this.belts.forEach(belt => belt.update(this.speed));
    }

    // region for metal detector (positioned between infeed and weighing)
    metalDetectorRegion() {
        // place detector at 80% of STAGE 1 (first belt)
        const stage1 = this.belts[0];
        const w = 80;
        const x = stage1.x + (stage1.width * 0.8) - (w / 2);
        // make detector taller than the sacks
        const h = Math.max(Math.round(this.CONFIG.sackHeight + 40), 90);
        // keep detector base (bottom edge) at the previous base position
        // previous tunnel base was at (beltY - 50) + 70 = beltY + 20
        const baseY = this.CONFIG.beltY + 20;
        const y = baseY - h; // raise upwards keeping base fixed
        return { x, w, y, h };
    }

    senseWeight(sack) {
        const sensorError = (Math.random() * this.CONFIG.sensorAccuracy * 2) - this.CONFIG.sensorAccuracy;
        sack.measuredValue = sack.weight + sensorError;
        sack.status = 'WAITING_RESULT';
        sack.isMeasured = true;

        this.currentDisplayWeight = sack.measuredValue;
        this.currentDisplayColor = '#eab308';

        this.dom.weightDisplay.textContent = sack.measuredValue.toFixed(3);
        this.dom.weightDisplay.classList.remove('text-green-400', 'text-red-400', 'text-yellow-400');
        this.dom.weightDisplay.classList.add('text-yellow-400');
    }

    processResult(sack) {
        const reading = sack.measuredValue;
        this.dom.weightDisplay.classList.remove('text-yellow-400');

        // prepare a short metal status string for the feed
        let metalField = 'OK';
        if (sack.metalType && sack.metalType !== 'NONE') {
            if (sack.metalType === 'FERROUS') metalField = 'Ferrous';
            else if (sack.metalType === 'NON_FERROUS') metalField = 'Non-ferrous';
            else if (sack.metalType === 'STAINLESS') metalField = 'Stainless';
            else metalField = String(sack.metalType);
        }

        // If metal was detected earlier at the detector, reject here (at weighing point)
        if (sack.metalDetected) {
            sack.status = 'REJECTED';
            sack.rejectDirection = 'LEFT';
            this.currentDisplayColor = '#ef4444';
            this.updateWeighingStatus("REJECT: METAL", "bg-red-500 text-white");
            this.dom.weightDisplay.classList.add('text-red-400');
            try {
                if (window && typeof window.addFeedEntry === 'function') {
                    window.addFeedEntry({ time: new Date(), weight: reading, status: sack.status, metal: metalField, machine: (this.canvas && this.canvas.id) ? this.canvas.id : 'factoryCanvas' });
                }
            } catch (err) {}
            return;
        }
        // First: enforce Stage2 explicit pass range (if configured)
        const s2min = (this.CONFIG.stage2Min !== undefined) ? this.CONFIG.stage2Min : (this.CONFIG.targetMin || 0);
        const s2max = (this.CONFIG.stage2Max !== undefined) ? this.CONFIG.stage2Max : (this.CONFIG.targetMax || Infinity);
        if (reading < s2min || reading > s2max) {
            sack.status = 'REJECTED';
            sack.rejectDirection = 'RIGHT';
            this.currentDisplayColor = '#ef4444';
            this.updateWeighingStatus("REJECT: STAGE2", "bg-red-500 text-white");
            this.dom.weightDisplay.classList.add('text-red-400');
            try {
                if (window && typeof window.addFeedEntry === 'function') {
                    window.addFeedEntry({ time: new Date(), weight: reading, status: sack.status, metal: metalField, machine: (this.canvas && this.canvas.id) ? this.canvas.id : 'factoryCanvas' });
                    }
            } catch (err) {}
            return;
        }

        // Then: compute final nominal including giveaway and check against bagging accuracy
        const finalNominal = (this.CONFIG.baseProductWeight || 25.00) + (this.CONFIG.emptyBagWeight || 0.010) + (this.CONFIG.giveawayWeight || 0);
        const tol = (this.CONFIG.baggingAccuracy !== undefined) ? this.CONFIG.baggingAccuracy : (this.CONFIG.rejectAccuracy || 0.015);
        if (Math.abs(reading - finalNominal) <= tol) {
            sack.status = 'PASSED';
            this.currentDisplayColor = '#22c55e';
            this.updateWeighingStatus("PASS: OK", "bg-green-500 text-white");
            this.dom.weightDisplay.classList.add('text-green-400');
        } else {
            sack.status = 'REJECTED';
            sack.rejectDirection = 'RIGHT';
            this.currentDisplayColor = '#ef4444';
            this.updateWeighingStatus("REJECT", "bg-red-500 text-white");
            this.dom.weightDisplay.classList.add('text-red-400');
        }

        // push an entry to the bag feed (timestamp, weight, status)
        try {
            if (window && typeof window.addFeedEntry === 'function') {
                window.addFeedEntry({ time: new Date(), weight: reading, status: sack.status, metal: metalField, machine: (this.canvas && this.canvas.id) ? this.canvas.id : 'factoryCanvas' });
            }
        } catch (err) {}
    }

    updateMetalStatus(text, classes) {
        if (!this.dom || !this.dom.statusMetal) return;
        this.dom.statusMetal.innerHTML = `<span class="status-pill ${classes}">${text}</span>`;
    }

    updateWeighingStatus(text, classes) {
        if (!this.dom || !this.dom.statusWeighing) return;
        this.dom.statusWeighing.innerHTML = `<span class="status-pill ${classes}">${text}</span>`;
    }

    drawBaggingMachine() {
        const ctx = this.ctx;
        const machineX = 10;
        const machineY = 40;
        const machineW = 70;
        const machineH = 180;

        ctx.save();
        // main body
        ctx.fillStyle = this.machineColor || '#475569';
        ctx.fillRect(machineX, machineY, machineW, machineH);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3;
        ctx.strokeRect(machineX, machineY, machineW, machineH);

        // top sloped roof / hood
        ctx.fillStyle = this.machineAccent || '#64748b';
        ctx.beginPath();
        ctx.moveTo(machineX - 10, machineY);
        ctx.lineTo(machineX + machineW + 10, machineY);
        ctx.lineTo(machineX + machineW, machineY + 40);
        ctx.lineTo(machineX, machineY + 40);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // base label plate
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(machineX + 20, machineY + machineH - 20, machineW - 40, 30);
        ctx.strokeRect(machineX + 20, machineY + machineH - 20, machineW - 40, 30);

        // label text
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        const textCenterX = machineX + machineW/2;
        const textCenterY = machineY + machineH/2;
        ctx.fillText("BAGGING", textCenterX, textCenterY - 5);
        ctx.fillText("MACHINE", textCenterX, textCenterY + 10);
        ctx.restore();
    }

    drawDigitalDisplay() {
        const ctx = this.ctx;
        const displayW = 120;
        const displayH = 45;
        const displayX = 465 - (displayW / 2);
        const displayY = this.CONFIG.beltY - 130;

        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.roundRect(displayX, displayY, displayW, displayH, 5);
        ctx.fill();

        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = this.currentDisplayColor;
        ctx.font = 'bold 22px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // draw numeric weight centered vertically in the display
        ctx.fillText(this.currentDisplayWeight.toFixed(3), displayX + displayW/2, displayY + displayH/2);

        // draw unit in bottom-right corner to avoid overlapping the number
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText("kg", displayX + displayW - 6, displayY + displayH - 6);
        ctx.restore();
    }

    drawLegend() {
        const ctx = this.ctx;
        const padding = 10;
        const badgeW = 12;
        const badgeH = 12;
        const gap = 14; // gap between badge and label (increased to avoid overlap)
        const itemGap = 18; // gap between items
        const x = 12;
        const yBottom = (this.canvas.height || 400) - 12;

        const items = [
            { color: '#ef4444', label: 'Ferrous' },
            { color: '#f59e0b', label: 'Non-ferrous' },
            { color: '#3b82f6', label: 'Stainless steel' }
        ];

        ctx.save();
        ctx.font = '12px Arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        // measure total width to draw background box sized to content
        let width = padding * 2;
        for (let i = 0; i < items.length; i++) {
            const txt = items[i].label;
            const txtW = Math.ceil(ctx.measureText(txt).width);
            width += badgeW + gap + txtW;
            if (i < items.length - 1) width += itemGap;
        }
        const height = padding * 2 + badgeH;
        const boxX = x;
        const boxY = yBottom - height;

        // background box
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = 'rgba(2,6,23,0.55)';
        ctx.strokeStyle = 'rgba(148,163,184,0.06)';
        ctx.lineWidth = 1;
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(boxX, boxY, width, height, 6);
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillRect(boxX, boxY, width, height);
        }

        // draw items horizontally: badge first, then label to the right (no overlap)
        let cursor = boxX + padding;
        ctx.fillStyle = '#e6eef8';
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const label = it.label;
            const txtW = Math.ceil(ctx.measureText(label).width);

            const cy = boxY + padding + (badgeH / 2);

            // badge: draw as a small circle on the left
            const cx = cursor + (badgeW / 2);
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.45)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.fillStyle = it.color;
            ctx.arc(cx, cy, badgeW / 2, 0, Math.PI * 2);
            ctx.fill();
            // subtle stroke to separate from background
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.stroke();
            ctx.restore();

            // label: draw to the right of the badge with a small gap
            const labelX = cursor + badgeW + gap;
            const labelY = cy;
            ctx.fillStyle = '#e6eef8';
            ctx.fillText(label, labelX, labelY);

            cursor += badgeW + gap + txtW + itemGap;
        }

        ctx.restore();
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawBaggingMachine();
        this.belts.forEach(belt => belt.draw(ctx, this.CONFIG));

        // (metal detector drawing moved below so it renders above sacks)

        ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(380, this.CONFIG.beltY - 70, 170, 100);

        this.drawDigitalDisplay();

        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.beginPath();
        ctx.moveTo(this.CONFIG.weighingCenter, this.CONFIG.beltY - 70);
        ctx.lineTo(this.CONFIG.weighingCenter, this.CONFIG.beltY + 30);
        ctx.stroke();

        ctx.setLineDash([]);
        this.sacks.forEach(sack => sack.draw(ctx, this.CONFIG));

        // Draw metal detector tunnel above sacks so objects appear to enter the tunnel
        const det = this.metalDetectorRegion();
        const tunnelX = det.x;
        const tunnelW = det.w;
        const tunnelY = det.y;
        const tunnelH = det.h;

        ctx.save();
        ctx.fillStyle = 'rgba(30,41,59,0.6)';
        ctx.beginPath();
        ctx.roundRect(tunnelX, tunnelY, tunnelW, tunnelH, 8);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.stroke();

        // (label will be drawn dynamically along the outer radar ring)

        // indicator lamp (turns red if any sack in region detected)
        let lampColor = 'rgba(34,197,94,0.9)';
        for (const s of this.sacks) {
            if (s.metalDetected && s.x > tunnelX && s.x < tunnelX + tunnelW) {
                lampColor = 'rgba(239,68,68,0.95)';
                break;
            }
        }
        ctx.beginPath();
        ctx.fillStyle = lampColor;
        const lampX = tunnelX + tunnelW/2;
        const lampY = tunnelY + 44;
        ctx.arc(lampX, lampY, 6, 0, Math.PI * 2);
        ctx.fill();

        // Draw radar sweep (concentric rings + rotating translucent sector)
        const sweepRadius = Math.min(80, tunnelW * 1.1);
        ctx.save();
        ctx.strokeStyle = 'rgba(148,163,184,0.22)';
        ctx.lineWidth = 1.5;
        for (let r = 20; r <= sweepRadius; r += 20) {
            ctx.beginPath();
            ctx.arc(lampX, lampY, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        const angle = this.sweepAngle || 0;
        const span = Math.PI / 6;
        const grad = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, sweepRadius);
        grad.addColorStop(0, 'rgba(34,197,94,0.28)');
        grad.addColorStop(1, 'rgba(34,197,94,0)');

        ctx.beginPath();
        ctx.moveTo(lampX, lampY);
        ctx.arc(lampX, lampY, sweepRadius, angle, angle + span);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        // moving label: draw 'METAL DETECTOR' on the outermost ring following the sweep (curved)
        const detectorText = 'METAL DETECTOR';
        const thetaText = angle + span / 2; // position around the middle of the sweep
        const radiusText = Math.max(28, sweepRadius - 18);
        // helper to draw text along an arc centered at (cx,cy)
        function drawArcText(ctx, text, cx, cy, radius, centerAngle) {
            ctx.save();
            ctx.font = 'bold 12px Arial';
            ctx.fillStyle = '#f8fafc';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // measure total angular width
            let totalWidth = 0;
            for (let i = 0; i < text.length; i++) {
                totalWidth += ctx.measureText(text[i]).width;
            }
            const totalAngle = totalWidth / radius;

            // start angle so the text is centered on centerAngle
            let angleCursor = centerAngle - (totalAngle / 2);

            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                const w = ctx.measureText(ch).width;
                const charAngle = w / radius;
                const charMid = angleCursor + (charAngle / 2);

                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(charMid);
                ctx.fillText(ch, 0, -radius);
                ctx.restore();

                angleCursor += charAngle;
            }
            ctx.restore();
        }

        drawArcText(ctx, detectorText, lampX, lampY, radiusText, thetaText);

        ctx.restore();
        ctx.restore();
        // draw small legend in bottom-left of the canvas
        try { this.drawLegend(); } catch (e) {}
    }
}
