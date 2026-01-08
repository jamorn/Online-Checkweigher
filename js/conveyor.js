export class Conveyor {
    constructor(x, width, label, color) {
        this.x = x;
        this.width = width;
        this.label = label;
        this.color = color;
        this.rollerAngle = 0;
    }

    update(speed) {
        this.rollerAngle += speed * 0.1;
    }

    draw(ctx, CONFIG) {
        ctx.fillStyle = '#334155';
        ctx.fillRect(this.x, CONFIG.beltY, this.width, CONFIG.beltHeight);

        const spacing = 45;
        const margin = 20;
        const availableWidth = this.width - (margin * 2);
        const rollerCount = Math.floor(availableWidth / spacing);

        for (let i = 0; i <= rollerCount; i++) {
            const rx = this.x + margin + (i * (availableWidth / rollerCount));
            this.drawRoller(ctx, rx, CONFIG.beltY + CONFIG.beltHeight + 10, CONFIG);
        }

        ctx.fillStyle = this.color;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.label, this.x + this.width/2, CONFIG.beltY + 60);
    }

    drawRoller(ctx, x, y, CONFIG) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.rollerAngle);
        ctx.beginPath();
        ctx.arc(0, 0, CONFIG.rollerRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#475569';
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-CONFIG.rollerRadius + 5, 0);
        ctx.lineTo(CONFIG.rollerRadius - 5, 0);
        ctx.stroke();
        ctx.restore();
    }
}
