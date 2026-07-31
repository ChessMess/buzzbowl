import Phaser from "phaser";

const TRACK_WIDTH = 400;
const TRACK_HEIGHT = 8;
const HANDLE_RADIUS = 12;
const STEPS_END_TO_END = 8;
// Above the players, below Player's debug text (10000).
const UI_DEPTH = 9999;

const STEP_BUTTON_SIZE = 40;
const STEP_BUTTON_RADIUS = 10;
const STEP_BUTTON_COLOR = 0x5555bb;
const STEP_BUTTON_ALPHA = 0.5;
const STEP_BUTTON_HOVER_ALPHA = 0.8;

function createStepButton(scene, x, y, label, onClick) {
    const half = STEP_BUTTON_SIZE / 2;
    const graphics = scene.add.graphics({ x, y });
    const draw = (alpha) => {
        graphics.clear();
        graphics.fillStyle(STEP_BUTTON_COLOR, alpha);
        graphics.fillRoundedRect(-half, -half, STEP_BUTTON_SIZE, STEP_BUTTON_SIZE, STEP_BUTTON_RADIUS);
    };
    draw(STEP_BUTTON_ALPHA);

    graphics.setInteractive(
        new Phaser.Geom.Rectangle(-half, -half, STEP_BUTTON_SIZE, STEP_BUTTON_SIZE),
        Phaser.Geom.Rectangle.Contains
    );
    graphics.input.cursor = 'pointer';
    graphics.on('pointerover', () => draw(STEP_BUTTON_HOVER_ALPHA));
    graphics.on('pointerout', () => draw(STEP_BUTTON_ALPHA));
    graphics.on('pointerdown', onClick);

    const text = scene.add.text(x, y, label, { fontSize: '22px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);

    return {
        setVisible(visible) {
            graphics.setVisible(visible);
            text.setVisible(visible);
        },
        setDepth(depth) {
            graphics.setDepth(depth);
            text.setDepth(depth);
        },
    };
}

export class ReviewScrubber {
    constructor(scene, x, y) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.frameCount = 0;
        this.currentFrame = 0;
        this.onScrub = null;

        this.track = scene.add.rectangle(x, y, TRACK_WIDTH, TRACK_HEIGHT, 0x444444);
        this.track.setVisible(false);
        this.track.setDepth(UI_DEPTH);

        this.handle = scene.add.circle(x - TRACK_WIDTH / 2, y, HANDLE_RADIUS, 0x5555bb);
        this.handle.setVisible(false);
        this.handle.setDepth(UI_DEPTH);
        this.handle.setInteractive({ useHandCursor: true });
        scene.input.setDraggable(this.handle);
        scene.input.on('drag', (pointer, gameObject, dragX) => {
            if (gameObject === this.handle) this.setFrameFromX(dragX);
        });

        this.stepBackButton = createStepButton(scene, x - TRACK_WIDTH / 2 - 50, y, '<', () => this.step(-1));
        this.stepBackButton.setDepth(UI_DEPTH);

        this.stepForwardButton = createStepButton(scene, x + TRACK_WIDTH / 2 + 50, y, '>', () => this.step(1));
        this.stepForwardButton.setDepth(UI_DEPTH);

        this.setVisible(false);
    }

    show(frameCount) {
        this.frameCount = frameCount;
        this.currentFrame = frameCount - 1;
        this.setVisible(true);
        this.updateHandlePosition();
    }

    hide() {
        this.setVisible(false);
    }

    setVisible(visible) {
        this.track.setVisible(visible);
        this.handle.setVisible(visible);
        this.stepBackButton.setVisible(visible);
        this.stepForwardButton.setVisible(visible);
    }

    step(direction) {
        const jump = Math.max(1, Math.ceil((this.frameCount - 1) / STEPS_END_TO_END));
        this.setFrame(this.currentFrame + direction * jump);
    }

    setFrameFromX(dragX) {
        const left = this.x - TRACK_WIDTH / 2;
        const ratio = Phaser.Math.Clamp((dragX - left) / TRACK_WIDTH, 0, 1);
        this.setFrame(Math.round(ratio * (this.frameCount - 1)));
    }

    setFrame(index) {
        this.currentFrame = Phaser.Math.Clamp(index, 0, this.frameCount - 1);
        this.updateHandlePosition();
        if (this.onScrub) this.onScrub(this.currentFrame);
    }

    updateHandlePosition() {
        const left = this.x - TRACK_WIDTH / 2;
        const ratio = this.frameCount > 1 ? this.currentFrame / (this.frameCount - 1) : 0;
        this.handle.setPosition(left + ratio * TRACK_WIDTH, this.y);
    }
}
