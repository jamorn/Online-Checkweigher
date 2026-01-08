export class Sack {
    constructor(x, y, CONFIG) {
        this.x = x;
        this.y = y;
        // weight comes from bagging machine: baseProduct + emptyBag + bagging error
        const bagError = (Math.random() * CONFIG.baggingAccuracy * 2) - CONFIG.baggingAccuracy;
        // weight includes product + empty bag + any configured giveaway
        const giveaway = (CONFIG.giveawayWeight || 0);
        this.weight = (CONFIG.baseProductWeight || 25.00) + (CONFIG.emptyBagWeight || 0.010) + giveaway + bagError;
        this.id = Math.floor(Math.random() * 1000);
        this.status = 'IN_TRANSIT';
        this.isMeasured = false;
        this.opacity = 0;
        this.yOffset = -20;
        // Metal contamination properties
        // Randomly assign a metal type (NONE, FERROUS, NON_FERROUS, STAINLESS)
        const r = Math.random();
        if (r < 0.10) this.metalType = 'FERROUS';
        else if (r < 0.15) this.metalType = 'NON_FERROUS';
        else if (r < 0.18) this.metalType = 'STAINLESS';
        else this.metalType = 'NONE';

        // metal dot size in mm (visualized as px radius)
        const METAL_SIZES_MM = {
            FERROUS: 2.5,
            NON_FERROUS: 3,
            STAINLESS: 3
        };
        this.metalSizeMM = this.metalType === 'NONE' ? 0 : (METAL_SIZES_MM[this.metalType] || 0);
        this.metalChecked = false; // whether metal detector already checked this sack
        this.metalDetected = false; // flagged when detector finds metal
    }

    update(speed, CONFIG) {
        if (this.opacity < 1 && this.status !== 'REJECTED') this.opacity += 0.1;
        if (this.yOffset < 0 && this.status !== 'REJECTED') this.yOffset += 2;
        if (this.status === 'REJECTED') {
            this.yOffset += 5;
            // move left or right depending on rejectDirection
            if (this.rejectDirection === 'LEFT') {
                this.x -= speed * 1.5;
            } else if (this.rejectDirection === 'RIGHT') {
                this.x += speed * 1.5;
            } else {
                // default: fade out while moving slightly forward
                this.x += speed * 0.5;
            }
            this.opacity -= 0.02;
        } else {
            this.x += speed;
        }
        if (this.x > 900) this.opacity -= 0.01;
    }

    draw(ctx, CONFIG) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.opacity);
        // lower small bag so it visually rests on the belt
        // adjusted to +6px (moved down) per visual feedback
        ctx.translate(this.x, this.y + this.yOffset + 6);

        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';

        let sackColor = '#e2e8f0';
        if (this.status === 'PASSED') sackColor = '#22c55e';
        if (this.status === 'REJECTED') sackColor = '#ef4444';

        ctx.fillStyle = sackColor;
        ctx.beginPath();
        ctx.roundRect(-CONFIG.sackWidth/2, -CONFIG.sackHeight, CONFIG.sackWidth, CONFIG.sackHeight, 5);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.stroke();

        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.ellipse(0, -CONFIG.sackHeight, CONFIG.sackWidth/2 + 2, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(-CONFIG.sackWidth/2 + 10, -CONFIG.sackHeight + 15, CONFIG.sackWidth - 20, 2);
        ctx.fillRect(-CONFIG.sackWidth/2 + 10, -CONFIG.sackHeight + 20, CONFIG.sackWidth - 25, 2);

        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.weight.toFixed(3), 0, -CONFIG.sackHeight/2);

        // draw small metal dot if present (visible immediately)
        if (this.metalType !== 'NONE') {
            // place dot near top-right of the sack
            const dotX = CONFIG.sackWidth/4;
            const dotY = -CONFIG.sackHeight + 12;
            // convert mm->px roughly (scale for visibility) and make larger for clarity
            const radius = Math.min(12, Math.max(2.5, (this.metalSizeMM || 2.5) * 1.8));
            let color = '#ef4444'; // default FERROUS -> red
            if (this.metalType === 'NON_FERROUS') color = '#f59e0b'; // yellow/orange
            if (this.metalType === 'STAINLESS') color = '#3b82f6'; // blue

            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.arc(dotX, dotY, Math.max(1, radius), 0, Math.PI * 2);
            ctx.fill();

            // if detected, draw small red ring
            if (this.metalDetected) {
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(239,68,68,0.9)';
                ctx.lineWidth = 2;
                ctx.arc(dotX, dotY, Math.max(2, radius + 2), 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.restore();
    }
}

export class SackSmallBag extends Sack {
    constructor(x, y, CONFIG) {
        super(x, y, CONFIG);
    }
    draw(ctx, CONFIG) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.opacity);
        ctx.translate(this.x, this.y + this.yOffset - 13); // เลื่อนกระสอบลงเล็กน้อย

        // เงาใต้กระสอบ
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(0,0,0,0.35)';

        // สีกระสอบ
        let sackColor = '#f8fafc';
        if (this.status === 'PASSED') sackColor = '#22c55e';
        if (this.status === 'REJECTED') sackColor = '#ef4444';

        const w = (CONFIG.sackWidth || 60) * 1.8; // กว้างขึ้น
        const h = (CONFIG.sackHeight || 70) * 0.4; // แบนลง
        const halfW = w / 2;

        // gradient แบบผ้ากระสอบ
        const grad = ctx.createLinearGradient(0, -h/2, 0, h/2);
        grad.addColorStop(0, '#f5f5f5');
        grad.addColorStop(0.5, '#e8e0d5');
        grad.addColorStop(1, '#d8d0c5');

        // วาดสี่เหลี่ยมมุมมนเป็นรูปกระสอบแนวนอน
        const cornerRadius = 8;
        ctx.beginPath();
        ctx.moveTo(-w/2 + cornerRadius, -h/2);
        ctx.lineTo(w/2 - cornerRadius, -h/2);
        ctx.arcTo(w/2, -h/2, w/2, -h/2 + cornerRadius, cornerRadius);
        ctx.lineTo(w/2, h/2 - cornerRadius);
        ctx.arcTo(w/2, h/2, w/2 - cornerRadius, h/2, cornerRadius);
        ctx.lineTo(-w/2 + cornerRadius, h/2);
        ctx.arcTo(-w/2, h/2, -w/2, h/2 - cornerRadius, cornerRadius);
        ctx.lineTo(-w/2, -h/2 + cornerRadius);
        ctx.arcTo(-w/2, -h/2, -w/2 + cornerRadius, -h/2, cornerRadius);
        ctx.closePath();

        ctx.fillStyle = grad;
        ctx.fill();

        // เส้นขอบ
        ctx.strokeStyle = '#a8a29e';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // เงาด้านล่าง (ให้ดูเหมือนวางอยู่บนสายพาน)
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        ctx.beginPath();
        ctx.ellipse(0, h/2 + 3, w * 0.48, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // เส้นเย็บกระสอบ (แนวตั้งกลางกระสอบ)
        ctx.strokeStyle = 'rgba(120, 113, 108, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, -h/2 + 6);
        ctx.lineTo(0, h/2 - 6);
        ctx.stroke();
        ctx.setLineDash([]);

        // (label removed per request)

        // ข้อความน้ำหนัก (อยู่กลางกระสอบ)
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.weight.toFixed(3) + ' kg', 0, 0);

        // metal dot (preserve)
        if (this.metalType !== 'NONE') {
            const dotX = halfW * 0.45;
            const dotY = -h/2 + 10;
            const radius = Math.min(10, Math.max(2.5, (this.metalSizeMM || 2.5) * 1.8));
            let color = '#ef4444';
            if (this.metalType === 'NON_FERROUS') color = '#f59e0b';
            if (this.metalType === 'STAINLESS') color = '#3b82f6';

            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.arc(dotX, dotY, Math.max(1, radius), 0, Math.PI * 2);
            ctx.fill();

            if (this.metalDetected) {
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(239,68,68,0.9)';
                ctx.lineWidth = 1.6;
                ctx.arc(dotX, dotY, Math.max(2, radius + 2), 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.restore();
    }
}
