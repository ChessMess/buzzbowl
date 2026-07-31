export class Button {
    constructor(scene, x, y, label, options = {}) {
        const {
            width = 120,
            height = 75,
            color = 0x4444aa,
            hoverColor = 0x5555bb,
            disabledColor = 0x888888,
            fontSize = '30px',
            labelStyle = { fontSize: fontSize, fill: '#fff' }
        } = options;

        this.scene = scene;
        this.normalColor = color;
        this.hoverColor = hoverColor;
        this.disabledColor = disabledColor;

        this.rect = scene.add.rectangle(x, y, width, height, color);
        this.text = scene.add.text(x, y, label, labelStyle).setOrigin(0.5);

        this.rect.setInteractive({ useHandCursor: true });
        this.rect.on('pointerover', () => this.rect.setFillStyle(hoverColor));
        this.rect.on('pointerout', () => {
            if (this.rect.input && this.rect.input.enabled) {
                this.rect.setFillStyle(color);
            }
        });
    }

    onClick(fn) {
        this.rect.on('pointerdown', fn);
        return this;
    }

    enable() {
        this.rect.setInteractive();
        this.rect.setFillStyle(this.normalColor);
        return this;
    }

    disable() {
        this.rect.setFillStyle(this.disabledColor);
        this.rect.disableInteractive();
        return this;
    }

    setLabel(label) {
        this.text.setText(label);
        return this;
    }

    setVisible(visible) {
        this.rect.setVisible(visible);
        this.text.setVisible(visible);
        return this;
    }

    setPosition(x, y) {
        this.rect.setPosition(x, y);
        this.text.setPosition(x, y);
        return this;
    }

    setDepth(depth) {
        this.rect.setDepth(depth);
        this.text.setDepth(depth);
        return this;
    }

    destroy() {
        this.rect.destroy();
        this.text.destroy();
    }
}
