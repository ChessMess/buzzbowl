import Phaser from "phaser";
import gameConfig from "./configLoader.js";
import { log, error } from "./logger";

export const PLAYER_WIDTH = 60;
const PLAYER_HEIGHT = 40;
const CAPSULE_RADIUS = 10;
const FRONT_STRIPE_WIDTH = 2;
const FRONT_STRIPE_HEIGHT = 12;
const FRONT_STRIPE_X_OFFSETS = [21, 26];
const FRONT_STRIPE_COLOR = 0xcccccc;

export class Player extends Phaser.GameObjects.Graphics {
    constructor(scene, x, y, config) {
        super(scene, { x, y });
        scene.add.existing(this);

        this.width = PLAYER_WIDTH;
        this.height = PLAYER_HEIGHT;
        this.displayOriginX = PLAYER_WIDTH / 2;
        this.displayOriginY = PLAYER_HEIGHT / 2;

        const awayInitialBaseAngle = Math.PI;

        this.initialX = config.initialX;
        this.initialY = config.initialY;
        this.origX = config.initialX;
        this.origY = config.initialY;
        this.baseAngle = config.team === "Home" ? 0 : awayInitialBaseAngle;
        this.currentAngle = this.baseAngle;
        this.initialVeerMomentum = (Math.random() - 0.5) * 0.01;
        this.veerMomentum = this.initialVeerMomentum;
        this.initialVeerTargetDirection = Math.random() < 0.5 ? 1 : -1;
        this.veerTargetDirection = this.initialVeerTargetDirection;
        this.hasBall = config.hasBall;
        this.offensivePosition = config.offensivePosition;
        this.defensivePosition = config.defensivePosition;
        this.team = config.team;
        this.entityType = "Player";
        this.id = config.id;
        this.side = config.team === "Home" ? "Offense" : "Defense";
        this.isSelected = false;
        this.canReceivePass = config.canReceivePass || false;

        this.targetCircle = scene.add.circle(x, y, 7, gameConfig.colors.targetCircle);
        this.targetCircle.setVisible(false);

        this.debugText = null;
        this.debugText = scene.add.text(x, y, String(this.id), {
            fontSize: "22px",
            fill: "#ffffff",
            fontStyle: "bold"
        }).setOrigin(0.5).setDepth(10000);

        if (config.hasBall) {
            this.fillColor = gameConfig.colors.ballCarrier;
        } else {
            this.fillColor = config.color;
        }

        config.group.add(this);
        scene.matter.add.gameObject(this, { ...config.physicsConfig, chamfer: { radius: CAPSULE_RADIUS } });

        this.setInteractive({ useHandCursor: true });
        scene.input.setDraggable(this);

        if (this.body) {
            scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
            scene.matter.body.setAngularVelocity(this.body, 0);
        }

        this.rotationHandle = scene.add.circle(x, y + 40, 8, gameConfig.colors.rotationHandle);
        this.rotationHandle.setVisible(false);
        this.rotationHandle.setInteractive({ useHandCursor: true });
        this.rotationHandle.player = this;
        this.rotationHandle.setDepth(100);
        scene.input.setDraggable(this.rotationHandle);
    }

    get fillColor() {
        return this._fillColor;
    }

    set fillColor(color) {
        this._fillColor = color;
        this.clear();
        this.fillStyle(color, 1);
        this.fillRoundedRect(
            -PLAYER_WIDTH / 2, -PLAYER_HEIGHT / 2, PLAYER_WIDTH, PLAYER_HEIGHT, CAPSULE_RADIUS
        );

        this.fillStyle(FRONT_STRIPE_COLOR, 1);
        for (const xOffset of FRONT_STRIPE_X_OFFSETS) {
            this.fillRect(
                xOffset - FRONT_STRIPE_WIDTH / 2, -FRONT_STRIPE_HEIGHT / 2,
                FRONT_STRIPE_WIDTH, FRONT_STRIPE_HEIGHT
            );
        }
    }

    setHasBall(hasBall) {
        this.hasBall = hasBall;
        if (hasBall) {
            this.fillColor = gameConfig.colors.ballCarrier
        } else {
            this.fillColor = this.team === "Home" ? gameConfig.colors.home : gameConfig.colors.away;
        }
    }

    stop() {
        if (this.body) {
            try {
                this.scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
                this.scene.matter.body.setAngularVelocity(this.body, 0);
                this.scene.matter.body.setStatic(this.body, true);
            } catch (e) {
                error("Error stopping player:", e);
            }
        }
    }

    makeDynamic() {
        if (this.body && this.body.isStatic) {
            try {
                this.scene.matter.body.setStatic(this.body, false);
            } catch (e) {
                error("Error making player dynamic:", e);
            }
        }
    }

    resetPosition(game) {
        try {
            this.scene.matter.body.setStatic(this.body, false);
            this.scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
            this.scene.matter.body.setAngle(this.body, this.baseAngle);
            this.scene.matter.body.setAngularVelocity(this.body, 0);
            this.setAngle(Phaser.Math.RadToDeg(this.baseAngle));
            this.currentAngle = this.baseAngle;
            this.veerMomentum = this.initialVeerMomentum;
            this.veerTargetDirection = this.initialVeerTargetDirection;

            const losX = game.lineOfScrimmage.x;
            const isOffense = this.team === game.possession;

            let targetX, targetY;

            if (isOffense) {
                const dirMult = game.targetEndzone === "Right" ? 1 : -1;
                const formationConfig = gameConfig.formations.offense[game.formation];
                let posConfig = formationConfig.positions[this.offensivePosition] || { xOffset: 0, yOffset: 0 };

                const offenseBackedup = game.targetEndzone === "Right"
                    ? losX < 280
                    : losX > 1320;
                if (offenseBackedup && formationConfig.backedUp && formationConfig.backedUp[this.offensivePosition]) {
                    posConfig = formationConfig.backedUp[this.offensivePosition];
                }

                targetX = losX + posConfig.xOffset * dirMult;
                targetY = this.origY + posConfig.yOffset;
            } else {
                const dirMult = game.targetEndzone === "Right" ? 1 : -1;
                const formationConfig = gameConfig.formations.defense[game.defensiveFormation];
                const posConfig = formationConfig.positions[this.defensivePosition] || { xOffset: 0, yOffset: 0 };

                targetX = losX + posConfig.xOffset * dirMult;
                targetY = this.origY + posConfig.yOffset;
            }

            // Formation offsets are tuned for mid-field; near either goal line (e.g. right after
            // a change of possession pins the LOS deep) they can push a player past the canvas
            // edge entirely. Offense already had this clamp; defense needs it just as much.
            const fieldLeftBound = game.margin + 5;
            const fieldRightBound = game.margin + game.fieldWidth - 5;
            targetX = Math.max(fieldLeftBound, Math.min(fieldRightBound, targetX));
            
            this.setPosition(targetX, targetY);
            this.initialX = targetX;
            this.initialY = targetY;
            if (this.body) {
                this.scene.matter.body.setPosition(this.body, { x: targetX, y: targetY });
            }
        } catch (e) {
            error("Error resetting player state:", e);
        }
    }


    teamHasPossession(game) {
        return this.team === game.possession;
    }

    applyFormation(xOffset, yOffset, losX, directionMultiplier) {
        const finalX = losX + xOffset * directionMultiplier;
        const finalY = this.origY + yOffset;

        this.initialX = finalX;
        this.initialY = finalY;

        this.setPosition(finalX, finalY);
        if (this.body) {
            this.scene.matter.body.setPosition(this.body, { x: finalX, y: finalY });
        }
    }

    // setPosition/setRotation come from Matter's Transform component (every Player gets a
    // body in the constructor), so these write straight through to the physics body.
    applyRecordedFrame({ x, y, angle, hasBall }) {
        this.setPosition(x, y);
        this.setRotation(angle);
        this.currentAngle = angle;
        if (hasBall !== this.hasBall) this.setHasBall(hasBall);
    }

    setTeamColor(color) {
        this.fillColor = color;
    }

    updateVeer(dt, params) {
        if (!this.body || !this.active) return null;

        let currentAngle = this.currentAngle;
        let momentum = this.veerMomentum;
        let targetDir = this.veerTargetDirection;
        const movementBaseAngle = currentAngle;

        if (Math.random() < params.veerTargetFlipChance * dt) {
            targetDir *= -1;
            this.veerTargetDirection = targetDir;
        }

        const targetMomentum = targetDir * params.maxVeerMomentum;
        const correction = (targetMomentum - momentum) * params.veerCorrectionRate * dt;
        momentum += correction;
        momentum *= Math.pow(params.veerInertiaFactor, dt);
        momentum = Phaser.Math.Clamp(momentum, -params.maxVeerMomentum, params.maxVeerMomentum);
        this.veerMomentum = momentum;

        currentAngle += momentum * dt;

        let deviation = Phaser.Math.Angle.ShortestBetween(movementBaseAngle, currentAngle);
        deviation = Phaser.Math.Clamp(deviation, -params.maxVeerAngle, params.maxVeerAngle);
        currentAngle = movementBaseAngle + deviation;

        this.currentAngle = currentAngle;
        this.scene.matter.body.setAngle(this.body, currentAngle);

        return { currentAngle, movementBaseAngle };
    }

    applyMovementForce(dt, baseForceMagnitude, teamSign, directionSign, vibrationStrength) {
        const currentAngle = this.currentAngle;

        const forceX = Math.cos(currentAngle) * baseForceMagnitude * teamSign * directionSign;
        const forceY = Math.sin(currentAngle) * baseForceMagnitude * teamSign * directionSign;

        this.scene.matter.body.applyForce(this.body, this.body.position, { x: forceX, y: forceY });

        const randomForceX = (Math.random() - 0.5) * 2 * vibrationStrength * dt;
        const randomForceY = (Math.random() - 0.5) * 2 * vibrationStrength * dt;
        this.scene.matter.applyForce(this, { x: randomForceX, y: randomForceY });
    }

    deselect() {
        this.isSelected = false;
        if (this._testDot) {
            this._testDot.destroy();
            this._testDot = null;
        }
    }

    resetColor() {
        if (this.hasBall) {
            this.fillColor = gameConfig.colors.ballCarrier;
        } else {
            this.fillColor = this.team === "Home" ? gameConfig.colors.home : gameConfig.colors.away;
        }
    }

    setBaseAngle(angle) {
        this.baseAngle = angle;
        this.currentAngle = angle;
        if (this.body) {
            this.scene.matter.body.setAngle(this.body, angle);
        } else {
            this.setRotation(angle);
        }
    }

    updateDebugText() {
        if (this.debugText) {
            this.debugText.setPosition(this.x, this.y);
        }
    }

    logPlayer() {
        log("--- Player Info ---");
        log("id:", this.id);
        log("team:", this.team);
        log("side:", this.side);
        log("entityType:", this.entityType);
        log("offensivePosition:", this.offensivePosition);
        log("defensivePosition:", this.defensivePosition);
        log("hasBall:", this.hasBall);
        log("canReceivePass:", this.canReceivePass);
        log("isSelected:", this.isSelected);
        log("x:", this.x, "y:", this.y);
        log("initialX:", this.initialX, "initialY:", this.initialY);
        log("origX:", this.origX, "origY:", this.origY);
        log("baseAngle:", this.baseAngle);
        log("currentAngle:", this.currentAngle);
        log("initialVeerMomentum:", this.initialVeerMomentum);
        log("veerMomentum:", this.veerMomentum);
        log("initialVeerTargetDirection:", this.initialVeerTargetDirection);
        log("veerTargetDirection:", this.veerTargetDirection);
        log("fillColor:", this.fillColor);
        log("-------------------");
    }
}
