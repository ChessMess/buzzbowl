import { Scene } from "phaser";
import { Player } from "../Player";
import { Button } from "../Button";
import { EndZone } from "../EndZone";
import { Popup } from "../Popup";
import { Scoreboard } from "../Scoreboard";
import { FieldMarker } from "../FieldMarker";
import config from "../configLoader.js";
import { log } from "../logger";
import { yardsToPixels, getHomePlayers, getAwayPlayers, getAllPlayers, deselectAllPlayers } from "../helpers";
import { FormationManager } from "../FormationManager";
import { PlayStateManager } from "../PlayStateManager";
import { PlayRecorder } from "../PlayRecorder";
import { ReviewScrubber } from "../ReviewScrubber";
import { saveGame, loadGame } from "../saveGame";

export class BaseGameScene extends Scene {
    constructor(key) {
        super(key);
        this.vibrationStrength = config.physics.vibrationStrength;

        this.awayColor = config.colors.away;
        this.homeColor = config.colors.home;
        this.ballCarrierColor = config.colors.ballCarrier;

        this.canvasWidth = config.canvas.width;
        this.canvasHeight = config.canvas.height;
        this.scoreboardHeight = config.layout.scoreboardHeight;
        this.controlsHeight = config.layout.controlsHeight;

        this.margin = config.layout.margin;
        this.fieldHeight = this.canvasHeight - this.scoreboardHeight - this.controlsHeight - this.margin * 2;
        this.fieldWidth = this.canvasWidth - this.margin * 2;

        this.fieldY = this.scoreboardHeight + this.margin;
        this.centerY = this.fieldY + this.fieldHeight / 2;
        this.startY = this.centerY;
        this.QBPassOffset = config.players.qbPassOffset;

        this.startButton = null;
        this.pauseButton = null;
        this.nextPlayButton = null;
        this.resetButton = null;
        this.playTypeButtons = null;
        this.playTypeText = "Run";
        this.defensiveFormationText = "4-3";
        this.formationText = null;

        this.maxVeerAngle = config.veering.maxAngle;
        this.veerCorrectionRate = config.veering.correctionRate;
        this.veerInertiaFactor = config.veering.inertiaFactor;
        this.maxVeerMomentum = config.veering.maxMomentum;
        this.veerTargetFlipChance = config.veering.targetFlipChance;

        this.downLabels = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };
        this.scramble = false;

        this.draggedPlayer = null;
        this.draggingRotationHandle = null;

        this.formationManager = null;
        this.playStateManager = null;
        this.playRecorder = null;
        this.reviewMode = false;
        this.activeResultPopup = null;
    }

    // Re-runs on every scene.start()/scene.restart() call, unlike the constructor —
    // this is where per-game state that mutates during play must be reset.
    init(data) {
        this.home = null;
        this.away = null;

        this.lineOfScrimmage = {
            x: config.field.lineOfScrimmageX,
            previousX: null,
            marker: null
        };

        this.firstDownMarker = {
            x: this.lineOfScrimmage.x + yardsToPixels(config.field.yardsToFirstDown),
            marker: null
        };

        this.scored = false;
        this.framesAfterScore = 120;
        this.playType = "Run";
        this.defensiveFormation = "4-3";
        this.formation = "I";

        this.playStarted = false;
        this.playPaused = false;
        this.playPausedBeforeSnap = true;
        this.passAttempted = false;
        this.turnoverOnDowns = false;
        this.offenseMovingRight = true;
        this.targetEndzone = "Right";
        this.possession = "Home";
        this.down = 1;
        this.homeScore = 0;
        this.awayScore = 0;

        if (data?.resume) loadGame(this);
    }

    preload() {
        this.load.image('rotationArrows', 'assets/rotationArrows.png');
    }

    create() {
        this.formationManager = new FormationManager(this);
        this.playStateManager = new PlayStateManager(this);
        this.playRecorder = new PlayRecorder(this);

        this.createField();
        this.createPlayers();
        this.setupEventHandlers();
        this.createUI();
        this.createModeUI();
        this.downLabel = "Down";

        this.changePlayType();
        this.changePlayType();
        this.changeDefensiveFormation();
        this.changeDefensiveFormation();
        this.changeformation();
        this.changeformation();
    }

    createField() {
        const c = config.colors;
        const endZoneWidth = config.layout.endZoneWidth;

        this.add.rectangle(
            this.canvasWidth / 2,
            this.canvasHeight / 2,
            this.canvasWidth,
            this.canvasHeight,
            c.background
        );

        this.add.rectangle(
            this.canvasWidth / 2,
            this.scoreboardHeight / 2,
            this.canvasWidth,
            this.scoreboardHeight,
            c.uiBackground
        );

        this.add.rectangle(
            this.canvasWidth / 2,
            this.canvasHeight - this.controlsHeight / 2,
            this.canvasWidth,
            this.controlsHeight,
            c.uiBackground
        );

        this.matter.world.setBounds(
            this.margin,
            this.fieldY,
            this.fieldWidth,
            this.fieldHeight
        );

        const field = this.add.graphics();
        field.fillStyle(c.field, 1);
        field.fillRect(this.margin, this.fieldY, this.fieldWidth, this.fieldHeight);

        field.lineStyle(4, c.sideline, 1);
        field.strokeRect(this.margin, this.fieldY, this.fieldWidth, this.fieldHeight);

        const playableFieldWidth = 1320;
        const yardLineSpacing = playableFieldWidth / 10;

        for (let i = 0; i <= 12; i++) {
            let x;
            if (i === 0) {
                x = this.margin;
            } else if (i === 12) {
                x = this.margin + this.fieldWidth;
            } else {
                x = this.margin + endZoneWidth + (i - 1) * yardLineSpacing;
                field.lineStyle(2, c.sideline, 1);
                field.beginPath();
                field.moveTo(x, this.fieldY);
                field.lineTo(x, this.fieldY + this.fieldHeight);
                field.strokePath();

                for (let n = 0; n <= 9; n++) {
                    field.beginPath();
                    field.moveTo(
                        x + (yardLineSpacing / 10) * n,
                        this.fieldY + this.fieldHeight * 0.35
                    );
                    field.lineTo(
                        x + (yardLineSpacing / 10) * n,
                        this.fieldY + this.fieldHeight * 0.35 + 20
                    );
                    field.strokePath();

                    field.beginPath();
                    field.moveTo(
                        x + (yardLineSpacing / 10) * n,
                        this.fieldY + this.fieldHeight * 0.65
                    );
                    field.lineTo(
                        x + (yardLineSpacing / 10) * n,
                        this.fieldY + this.fieldHeight * 0.65 + 20
                    );
                    field.strokePath();
                }
            }
        }

        field.fillStyle(c.endZone, 1);
        field.fillRect(
            this.margin + 2,
            this.fieldY + 4,
            endZoneWidth - 4,
            this.fieldHeight - 8
        );
        field.fillRect(
            this.margin + this.fieldWidth - endZoneWidth - 6,
            this.fieldY + 4,
            endZoneWidth + 2,
            this.fieldHeight - 8
        );

        new EndZone(this, 800, this.fieldY + 1, 1320, 4, {
            fillColor: c.sideline,
            name: "TopSideline",
            type: "SideLine",
            isStatic: true
        });
        new EndZone(this, 800, this.fieldY + this.fieldHeight - 1, 1320, 4, {
            fillColor: c.sideline,
            name: "BottomSideline",
            type: "SideLine",
            isStatic: true
        });

        const topBarrier = this.add.rectangle(800, this.fieldY + 1, 1320, 6);
        topBarrier.setVisible(false);
        this.matter.add.gameObject(topBarrier, { isStatic: true, isSensor: false });
        this.fieldBarriers = [topBarrier];

        const bottomBarrier = this.add.rectangle(800, this.fieldY + this.fieldHeight - 1, 1320, 6);
        bottomBarrier.setVisible(false);
        this.matter.add.gameObject(bottomBarrier, { isStatic: true, isSensor: false });
        this.fieldBarriers.push(bottomBarrier);

        // Touchdown fires on body overlap, so it fires as soon as any part of the ball
        // carrier crosses the goal line -- not when their center reaches it. Sensors sit
        // with their goal-line edge exactly on the goal line, computed the same way for both
        // ends so neither is offset relative to the other (the old hardcoded positions, 79
        // and 1519, weren't: the left one sat 9px past its goal line, the right one only 1px
        // off -- see issue #8).
        const endZoneSensorWidth = 130;
        this.leftGoalLineX = this.margin + endZoneWidth;
        this.rightGoalLineX = this.margin + endZoneWidth + playableFieldWidth;

        new EndZone(
            this,
            this.leftGoalLineX - endZoneSensorWidth / 2,
            this.fieldY + this.fieldHeight / 2,
            endZoneSensorWidth, this.fieldHeight + 30,
            { stroke: true, name: "LeftEndZone" }
        );
        new EndZone(
            this,
            this.rightGoalLineX + endZoneSensorWidth / 2,
            this.fieldY + this.fieldHeight / 2,
            endZoneSensorWidth, this.fieldHeight + 30,
            { stroke: true, name: "RightEndZone" }
        );

        this.lineOfScrimmage.marker = new FieldMarker(
            this,
            this.lineOfScrimmage.x,
            this.startY,
            this.fieldHeight - 4.5,
            c.lineOfScrimmage
        );

        const losBarrierRect = this.add.rectangle(
            this.lineOfScrimmage.x,
            this.startY,
            6,
            this.fieldHeight
        );
        losBarrierRect.setVisible(false);
        this.matter.add.gameObject(losBarrierRect, { isStatic: true, isSensor: false });
        this.lineOfScrimmage.barrier = losBarrierRect;

        this.firstDownMarker.marker = new FieldMarker(
            this,
            this.firstDownMarker.x,
            this.startY,
            this.fieldHeight,
            c.firstDown
        );

        this.scoreboard = new Scoreboard(this, {
            canvasWidth: this.canvasWidth,
            homeScore: this.homeScore,
            awayScore: this.awayScore,
            homeColor: this.homeColor,
            awayColor: this.awayColor,
            downLabels: { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" },
            down: this.down,
            downX: 230
        });
    }

    createPlayers() {
        const losX = this.lineOfScrimmage.x;
        const centerY = this.centerY;

        this.home = this.add.group();
        this.away = this.add.group();

        const playerCategory = this.matter.world.nextCategory();

        const playerConfig = {
            friction: 0.1,
            frictionAir: 0.01,
            restitution: 0,
            density: 0.00125,
            angle: 0,
            collisionFilter: { category: playerCategory },
            isStatic: false,
        };

        const offConfig = config.formations.offense[this.formation];
        const defConfig = config.formations.defense[this.defensiveFormation];

        const playerMap = {};

        for (const [posName, posData] of Object.entries(offConfig.positions)) {
            if (!playerMap[posData.homePlayerId]) playerMap[posData.homePlayerId] = {};
            playerMap[posData.homePlayerId].offensePosition = posName;
            if (!playerMap[posData.awayPlayerId]) playerMap[posData.awayPlayerId] = {};
            playerMap[posData.awayPlayerId].offensePosition = posName;
        }

        for (const [posName, posData] of Object.entries(defConfig.positions)) {
            if (!playerMap[posData.homePlayerId]) playerMap[posData.homePlayerId] = {};
            playerMap[posData.homePlayerId].defensePosition = posName;
            if (!playerMap[posData.awayPlayerId]) playerMap[posData.awayPlayerId] = {};
            playerMap[posData.awayPlayerId].defensePosition = posName;
        }

        for (let id = 1; id <= 11; id++) {
            const data = playerMap[id];
            const yOff = offConfig.positions[data.offensePosition].yOffset;

            new Player(this, losX, centerY + yOff, {
                color: this.homeColor,
                team: "Home",
                id: id,
                offensivePosition: data.offensePosition,
                defensivePosition: data.defensePosition,
                hasBall: false,
                canReceivePass: config.players.canReceivePass.includes(data.offensePosition),
                initialX: losX,
                initialY: centerY,
                group: this.home,
                physicsConfig: playerConfig,
            });
        }

        for (let id = 12; id <= 22; id++) {
            const data = playerMap[id];
            const yOff = offConfig.positions[data.offensePosition].yOffset;

            new Player(this, losX, centerY + yOff, {
                color: this.awayColor,
                team: "Away",
                id: id,
                offensivePosition: data.offensePosition,
                defensivePosition: data.defensePosition,
                hasBall: false,
                canReceivePass: config.players.canReceivePass.includes(data.offensePosition),
                initialX: losX,
                initialY: centerY,
                group: this.away,
                physicsConfig: playerConfig,
            });
        }
    }

    setupEventHandlers() {
        this.input.on(
            "dragstart",
            (pointer, gameObject) => {
                if (!this.playStarted && !this.reviewMode) {
                    this.draggedPlayer = gameObject;
                    gameObject.setAlpha(0.7);
                    if (gameObject.body) {
                        this.matter.body.setStatic(gameObject.body, true);
                    }
                } else {
                    this.draggedPlayer = null;
                }

                if (gameObject.player) {
                    this.rotatingPlayer = gameObject.player;
                }

                if (!this.playStarted && gameObject.name === 'testDot' && gameObject.player) {
                    this.draggingRotationHandle = {
                        dot: gameObject,
                        player: gameObject.player,
                        initialAngle: gameObject.player.currentAngle || 0
                    };
                    gameObject.setAlpha(0.7);
                }
            },
            this
        );

        this.input.on(
            "gameobjectdown",
            (pointer, gameObject) => {
                log("Object clicked:", gameObject.entityType);

                if (!this.playStarted && !this.reviewMode && gameObject.entityType === "Player") {
                    log("Player selected:", gameObject.x, gameObject.y);
                    log("Id: ", gameObject.id);
                    log("off pos:", gameObject.offensivePosition);
                    log("Team has possession", gameObject.teamHasPossession(this));
                    log("Posseession", this.possession);
                    log("player has ball", gameObject.hasBall);
                    deselectAllPlayers(this);

                    const currentAngle = gameObject.currentAngle || 0;

                    const arrowSprite = this.add.sprite(
                        gameObject.x + Math.cos(currentAngle) * 35,
                        gameObject.y + Math.sin(currentAngle) * 35,
                        'rotationArrows'
                    );
                    arrowSprite.setDepth(9999);
                    arrowSprite.setRotation(currentAngle + Math.PI / 2);

                    arrowSprite.setInteractive({ useHandCursor: true });
                    arrowSprite.name = 'testDot';
                    arrowSprite.player = gameObject;
                    this.input.setDraggable(arrowSprite);

                    gameObject._testDot = arrowSprite;

                    log("Created arrow sprite:", arrowSprite);
                    gameObject.isSelected = true;
                }

                if (!this.passAttempted &&
                    !this.reviewMode &&
                    gameObject.body &&
                    this.playType === "Pass" &&
                    gameObject.offensivePosition !== "QB" &&
                    (this.playStarted || this.playPaused) && gameObject.teamHasPossession(this) && !this.scramble) {

                    let offensivePlayers;

                    if (this.possession === "Home") {
                        offensivePlayers = getHomePlayers(this);
                    } else {
                        offensivePlayers = getAwayPlayers(this);
                    }

                    if (gameObject.canReceivePass) {
                        const rand = Math.random();
                        if (rand < 0.7) {
                            const offTeamColor = this.possession === "Home" ? this.homeColor : this.awayColor;
                            offensivePlayers.forEach(player => {
                                if (player.hasBall) {
                                    player.hasBall = false;
                                    player.fillColor = offTeamColor;
                                }
                            });

                            gameObject.hasBall = true;
                            gameObject.fillColor = this.ballCarrierColor;
                        } else {
                            this.handleTackle(null, null, "Incomplete");
                            this.showIncompleteNextPlay();
                        }

                        this.passAttempted = true;
                    }
                }
            },
            this
        );

        this.input.on(
            "drag",
            (pointer, gameObject, dragX, dragY) => {
                if (
                    gameObject === this.draggedPlayer &&
                    !this.playStarted &&
                    !this.playPaused &&
                    this.playPausedBeforeSnap
                ) {
                    const losX = this.lineOfScrimmage.x;
                    const team = gameObject.team;
                    let clampedX = dragX;

                    const halfSize = Math.max(gameObject.width, gameObject.height) / 2;

                    const isOffense = team === this.possession;
                    if (this.targetEndzone === "Right") {
                        if (isOffense && clampedX + halfSize > losX) clampedX = losX - halfSize;
                        if (!isOffense && clampedX - halfSize < losX) clampedX = losX + halfSize;
                    } else {
                        if (isOffense && clampedX - halfSize < losX) clampedX = losX + halfSize;
                        if (!isOffense && clampedX + halfSize > losX) clampedX = losX - halfSize;
                    }

                    clampedX = Math.max(this.margin + halfSize, Math.min(this.margin + this.fieldWidth - halfSize, clampedX));
                    dragY = Math.max(this.fieldY + halfSize, Math.min(this.fieldY + this.fieldHeight - halfSize, dragY));

                    gameObject.x = clampedX;
                    gameObject.y = dragY;
                    if (gameObject.body) {
                        this.matter.body.setPosition(gameObject.body, {
                            x: clampedX,
                            y: dragY,
                        });
                    }

                    if (gameObject.targetCircle) {
                        gameObject.targetCircle.setPosition(clampedX, dragY);
                    }

                    if (gameObject._testDot) {
                        const currentAngle = gameObject.currentAngle || 0;
                        const distance = 35;
                        const newDotX = clampedX + Math.cos(currentAngle) * distance;
                        const newDotY = dragY + Math.sin(currentAngle) * distance;
                        gameObject._testDot.setPosition(newDotX, newDotY);
                        gameObject._testDot.setRotation(currentAngle + Math.PI / 2);
                    }
                }

                if (!this.playStarted && this.draggingRotationHandle && gameObject === this.draggingRotationHandle.dot) {
                    const player = this.draggingRotationHandle.player;

                    const deltaX = dragX - player.x;
                    const deltaY = dragY - player.y;
                    const angle = Math.atan2(deltaY, deltaX); const distance = 35; const newDotX = player.x + Math.cos(angle) * distance;
                    const newDotY = player.y + Math.sin(angle) * distance;

                    gameObject.setPosition(newDotX, newDotY);
                    gameObject.setRotation(angle + Math.PI / 2);

                    player.currentAngle = angle;

                    if (player.body) {
                        this.matter.body.setAngle(player.body, angle);
                    } else {
                        player.setRotation(angle);
                    }
                }
            },
            this
        );

        this.input.on(
            "dragend",
            (pointer, gameObject) => {
                if (gameObject.player) {
                    this.rotatingPlayer = null;
                    return;
                }

                if (gameObject === this.draggedPlayer && !this.playStarted) {
                    gameObject.setAlpha(1);
                    if (gameObject.body) {
                        this.matter.body.setStatic(gameObject.body, false);
                        this.matter.body.setVelocity(gameObject.body, { x: 0, y: 0 });
                        this.matter.body.setAngularVelocity(gameObject.body, 0);
                        this.matter.body.setPosition(gameObject.body, {
                            x: gameObject.x,
                            y: gameObject.y,
                        });
                    }
                }
                if (this.draggingRotationHandle && gameObject === this.draggingRotationHandle.dot) {
                    gameObject.setAlpha(1);
                    this.draggingRotationHandle = null;
                }
                this.draggedPlayer = null;
            },
            this
        );

        this.matter.world.on('collisionstart', (event) => {
            if (!this.playStarted) {
                return;
            }

            for (let i = 0; i < event.pairs.length; i++) {
                const bodyA = event.pairs[i].bodyA;
                const bodyB = event.pairs[i].bodyB;

                const gameObjectA = bodyA.gameObject;
                const gameObjectB = bodyB.gameObject;

                if ((!gameObjectA && !gameObjectB) || gameObjectA?.disabled === true || gameObjectB?.disabled === true) {
                    continue;
                }

                let ballCarrier = null;
                let otherPlayer = null;

                if (gameObjectA?.hasBall === true) {
                    ballCarrier = gameObjectA;
                    otherPlayer = gameObjectB;
                } else if (gameObjectB?.hasBall === true) {
                    ballCarrier = gameObjectB;
                    otherPlayer = gameObjectA;
                } else {
                    continue;
                }

                const elapsedMs = this.snapAt != null ? (this.time.now - this.snapAt).toFixed(0) : "?";
                console.debug(
                    `[DEBUG:collision] collisionstart: elapsedMs=${elapsedMs} ballCarrier=id=${ballCarrier.id} team=${ballCarrier.team} x=${ballCarrier.x.toFixed(1)} ` +
                    `otherPlayer=${otherPlayer ? `id=${otherPlayer.id} team=${otherPlayer.team} entityType=${otherPlayer.entityType} x=${otherPlayer.x?.toFixed?.(1)}` : "none"}`
                );

                if (otherPlayer?.entityType === 'SideLine') {
                    this.handleTackle(ballCarrier, otherPlayer, "SideLine");
                    break;
                }

                if (otherPlayer?.entityType === 'EndZone' &&
                    ((this.targetEndzone === "Right" && otherPlayer.name === "RightEndZone") ||
                        (this.targetEndzone === "Left" && otherPlayer.name === "LeftEndZone"))) {
                    log("touchdown in collission detectin with right endzone");
                    this.handleTackle(ballCarrier, otherPlayer, "Touchdown");
                    this.nextPlayButton.enable();
                    break;
                }

                if (
                    otherPlayer?.team &&
                    ballCarrier.team !== otherPlayer.team
                ) {
                    this.handleTackle(ballCarrier, otherPlayer);
                    break;
                }
            }
        });

        this.events.on("shutdown", () => {
            this.input.off("dragstart");
            this.input.off("drag");
            this.input.off("dragend");
        });
    }

    createUI() {
        const y = this.canvasHeight - this.controlsHeight / 2;
        const buttonWidth = 120;
        const buttonHeight = 75;
        const padding = 22;
        const playTypeSelectorX = 420;

        const playTypeSelectorWidth = 230;
        const arrowStyle = { fontSize: "36px", fill: "#fff", fontStyle: "bold" };

        // Formation controls
        new Button(this, 50, y + 25, "<", { width: 60, height: 60, labelStyle: arrowStyle })
            .onClick(() => this.changeformation());

        this.formationText = this.add.text(
            120, y + 25, this.formation,
            { fontSize: "33px", fill: "#fff", fontStyle: "bold" }
        ).setOrigin(0.5);

        new Button(this, 190, y + 25, ">", { width: 60, height: 60, labelStyle: arrowStyle })
            .onClick(() => this.changeformation());

        // Menu button
        const menuButtonWidth = 100;
        const menuButtonX = this.canvasWidth - 100;
        new Button(this, menuButtonX, 40, "Menu", { width: menuButtonWidth, height: 60, labelStyle: arrowStyle })
            .onClick(() => this.returnToMenu());

        // Review Play — toggles between reviewing the just-finished play and resuming
        const reviewButtonWidth = buttonWidth + 55;
        this.reviewButton = new Button(
            this, menuButtonX - menuButtonWidth / 2 - reviewButtonWidth / 2 - 20, 40,
            'Review Play', { width: reviewButtonWidth, height: 60, labelStyle: { fontSize: '24px', fill: '#fff' } }
        );
        this.reviewButton.onClick(() => {
            if (this.reviewMode) this.exitReviewMode();
            else this.enterReviewMode();
        });
        this.reviewButton.disable();

        // Play type controls
        new Button(this, 280, y + 25, "<", { width: 60, height: 60, labelStyle: arrowStyle })
            .onClick(() => this.changePlayType());

        this.playTypeText = this.add.text(
            360, y + 25, this.playType,
            { fontSize: "33px", fill: "#fff", fontStyle: "bold" }
        ).setOrigin(0.5);

        new Button(this, 440, y + 25, ">", { width: 60, height: 60, labelStyle: arrowStyle })
            .onClick(() => this.changePlayType());

        // Defensive formation controls
        new Button(this, 580, y + 25, "<", { width: 60, height: 60, labelStyle: arrowStyle })
            .onClick(() => this.changeDefensiveFormation());

        this.defensiveFormationText = this.add.text(
            657, y + 25, this.defensiveFormation,
            { fontSize: "33px", fill: "#fff", fontStyle: "bold" }
        ).setOrigin(0.5);

        new Button(this, 740, y + 25, ">", { width: 60, height: 60, labelStyle: arrowStyle })
            .onClick(() => this.changeDefensiveFormation());

        // Control buttons
        let nextX = 250 + playTypeSelectorX + playTypeSelectorWidth / 2 + padding + buttonWidth / 2;

        this.startButton = new Button(this, nextX, y + 25, 'Start', { width: buttonWidth, height: buttonHeight });
        this.startButton.onClick(() => {
            if (!this.playStarted) {
                this.startPlay();
            }
        });

        // Popups
        this.incompletePopup = new Popup(this, nextX, this.canvasHeight / 2, 'Incomplete');
        this.incompletePopup.onClick(() => {
            this.nextPlay();
            this.hideUIPopups();
        });

        this.downPopup = new Popup(this, nextX - 120, this.canvasHeight / 2, 'Down!');
        this.downPopup.onClick(() => {
            this.nextPlay();
            this.hideUIPopups();
        });

        this.turnoverPopup = new Popup(this, nextX - 120, this.canvasHeight / 2, 'Turnover on downs!', { width: 340 });
        this.turnoverPopup.onClick(() => {
            this.nextPlay();
            this.hideUIPopups();
        });

        this.touchdownPopup = new Popup(this, nextX - 120, this.canvasHeight / 2, 'Touchdown');
        this.touchdownPopup.onClick(() => {
            this.nextPlay();
            this.hideUIPopups();
        });

        nextX += buttonWidth + padding;
        this.pauseButton = new Button(this, nextX, y + 25, 'Pause', { width: buttonWidth, height: buttonHeight });
        this.pauseButton.onClick(() => {
            if (this.playStarted) {
                this.pausePlay();
            }
        });

        nextX += buttonWidth + padding;
        this.nextPlayButton = new Button(this, nextX + 30, y + 25, 'Next Play', { width: buttonWidth + 55, height: buttonHeight });
        this.nextPlayButton.onClick(() => this.nextPlay());

        this.resetGameButton = new Button(this, nextX + 220, y + 25, 'Restart', { width: buttonWidth + 30, height: buttonHeight });
        this.resetGameButton.onClick(() => this.restart());

        this.nextPlayButton.disable();

        // Review scrubber sits top-middle of the field, clear of both the popups (mid-field)
        // and the controls row below.
        const reviewScrubberX = this.canvasWidth / 2;
        const reviewScrubberY = this.fieldY + 40;
        this.reviewScrubber = new ReviewScrubber(this, reviewScrubberX, reviewScrubberY);
        this.reviewScrubber.onScrub = (frameIndex) => this.playRecorder.applyFrame(frameIndex);
    }

    enterReviewMode() {
        if (!this.playRecorder.hasReplay()) return;
        this.reviewMode = true;
        // Hide only the popup that's actually up — hideUIPopups() would also clear
        // activeResultPopup, leaving exitReviewMode() with nothing to restore.
        if (this.activeResultPopup) this.activeResultPopup.hide();
        this.reviewButton.setLabel('Resume');
        this.reviewScrubber.show(this.playRecorder.frameCount);
    }

    exitReviewMode() {
        this.resetReviewUI();
        this.playRecorder.applyFrame(this.playRecorder.frameCount - 1);
        if (this.activeResultPopup) this.activeResultPopup.show();
    }

    // Every path that moves the game on from the reviewed play routes through here, so
    // review state can't survive into a play it no longer describes.
    resetReviewUI() {
        this.reviewMode = false;
        this.reviewScrubber.hide();
        this.reviewButton.setLabel('Review Play');
    }

    createModeUI() {
        // Override in subclass to add mode-specific UI
    }

    update(time, delta) {
        const allPlayers = getAllPlayers(this);

        if (!this.playStarted && this.playPausedBeforeSnap) {
            const losX = this.lineOfScrimmage.x;
            const halfSize = 30;
            for (let i = 0; i < allPlayers.length; i++) {
                const player = allPlayers[i];
                if (!player || !player.active) continue;
                if (player === this.draggedPlayer) continue;

                const isOffense = player.teamHasPossession(this);
                const shouldBeLeft = (isOffense && this.offenseMovingRight) ||
                                     (!isOffense && !this.offenseMovingRight);

                let crossed = false;
                let newX;
                if (shouldBeLeft && player.x + halfSize > losX) {
                    newX = losX - halfSize;
                    crossed = true;
                } else if (!shouldBeLeft && player.x - halfSize < losX) {
                    newX = losX + halfSize;
                    crossed = true;
                }

                if (crossed) {
                    log(
                        `[LOS Enforce] Player ${player.id} (${player.team}) pushed back from x=${player.x.toFixed(1)} to x=${newX.toFixed(1)} | LOS x=${losX}`
                    );
                    player.x = newX;
                    if (player.body) {
                        this.matter.body.setPosition(player.body, { x: newX, y: player.y });
                        this.matter.body.setVelocity(player.body, { x: 0, y: 0 });
                    }
                }
            }
        }

        const isPlaying = this.playStarted && !this.scored;
        let ballCarrier = null;

        for (let i = 0; i < allPlayers.length; i++) {
            const player = allPlayers[i];
            if (!player || !player.active) continue;

            if (player.rotationHandle && player.rotationHandle.visible) {
                const angle = player.currentAngle;
                player.rotationHandle.setPosition(
                    player.x + Math.cos(angle) * 40,
                    player.y + Math.sin(angle) * 40
                );
            }

            if (player.targetCircle) {
                player.targetCircle.setPosition(player.x, player.y);
            }
            if (player.updateDebugText) {
                player.updateDebugText();
            }

            if (isPlaying && player.hasBall === true && player.teamHasPossession(this)) {
                ballCarrier = player;
            }
        }

        if (this.scored && this.framesAfterScore > 0) {
            this.framesAfterScore--;
            if (this.framesAfterScore < 1) {
                this.pausePlay(true);
                return;
            }
        }

        if (ballCarrier) {
            if (this.targetEndzone === "Right" && ballCarrier.x > this.rightGoalLineX) {
                this.handleTackle(ballCarrier, null, "Touchdown");
                this.showTouchdownUI();
                this.scored = true;
            } else if (this.targetEndzone === "Left" && ballCarrier.x < this.leftGoalLineX) {
                this.handleTackle(ballCarrier, null, "Touchdown");
                this.showTouchdownUI();
                this.scored = true;
            }
        }

        if (this.playStarted) {
            const baseForceMagnitude = 0.0004;
            const dt = delta / 16.667;
            const endzoneDir = this.targetEndzone === "Right" ? 1 : -1;

            for (let i = 0; i < allPlayers.length; i++) {
                const player = allPlayers[i];
                if (!player.body || !player.active) continue;

                const veerParams = {
                    veerTargetFlipChance: this.veerTargetFlipChance,
                    maxVeerMomentum: this.maxVeerMomentum,
                    veerCorrectionRate: this.veerCorrectionRate,
                    veerInertiaFactor: this.veerInertiaFactor,
                    maxVeerAngle: this.maxVeerAngle
                };

                player.updateVeer(dt, veerParams);

                const teamSign = player.team === "Home" ? 1 : -1;
                let directionSign = player.teamHasPossession(this) ? endzoneDir : -endzoneDir;
                if (this.playType === "Pass" && player.offensivePosition === "QB" && player.teamHasPossession(this)) {
                    directionSign = -.01 * endzoneDir;
                }
                player.applyMovementForce(dt, baseForceMagnitude, teamSign, directionSign, this.vibrationStrength);
                this.updateTargetCircle(player);
            }

            this.playRecorder.captureFrame(allPlayers);
        }

        this.updateMode(time, delta);
    }

    updateMode(_time, _delta) {
        // Override in subclass for mode-specific update logic
    }

    updateTargetCircle(player) {
        log(player);
            if (player.targetCircle && !this.playPaused && this.playType === "Pass" &&
               player.canReceivePass &&
                player.teamHasPossession(this) && !this.scramble) {
                player.targetCircle.setVisible(true);
                player.targetCircle.setPosition(player.x, player.y);
            }
            if (player.targetCircle && this.scramble) {
                player.targetCircle.setVisible(false);
            }

            if (!player.teamHasPossession(this) && player.targetCircle) {
                player.targetCircle.setVisible(false);
            }
    }

    hideUIPopups() {
        this.incompletePopup.hide();
        this.downPopup.hide();
        this.touchdownPopup.hide();
        this.turnoverPopup.hide();
        this.activeResultPopup = null;
        deselectAllPlayers(this);
    }

    showIncompleteNextPlay() {
        this.incompletePopup.show();
        this.activeResultPopup = this.incompletePopup;
    }

    showTouchdownUI() {
        this.touchdownPopup.show();
        this.activeResultPopup = this.touchdownPopup;
    }

    showDownUI() {
        if (this.turnoverOnDowns) {
            this.turnoverPopup.show();
            this.activeResultPopup = this.turnoverPopup;
        } else {
            this.downPopup.show();
            this.activeResultPopup = this.downPopup;
        }
    }

    updateLOSBarrier(x) {
        if (this.lineOfScrimmage.barrier && this.lineOfScrimmage.barrier.body) {
            this.lineOfScrimmage.barrier.x = x;
            this.matter.body.setPosition(this.lineOfScrimmage.barrier.body, { x, y: this.startY });
        }
    }

    setLOSBarrierSensor(isSensor) {
        if (this.lineOfScrimmage.barrier && this.lineOfScrimmage.barrier.body) {
            this.lineOfScrimmage.barrier.body.isSensor = isSensor;
        }
        if (this.fieldBarriers) {
            this.fieldBarriers.forEach(barrier => {
                if (barrier.body) barrier.body.isSensor = isSensor;
            });
        }
    }

    restart() {
        // scene.restart() with no argument keeps whatever data the scene was originally
        // started with (Phaser: "If no value is given it will not overwrite any previous data
        // that may exist"). If this scene was entered via Resume, that's still {resume: true} --
        // so restart would silently reload the old save instead of starting fresh. Pass an
        // empty object to clear it.
        this.scene.restart({});
    }

    returnToMenu() {
        this.pausePlay();
        this.scene.start("MainMenu");
    }

    // --- Delegated methods ---

    changeformation() {
        this.formationManager.toggleOffensiveFormation();
        saveGame(this);
    }

    changeDefensiveFormation() {
        this.formationManager.toggleDefensiveFormation();
        saveGame(this);
    }

    changePlayType() {
        this.formationManager.togglePlayType();
        saveGame(this);
    }

    checkBallCarrier() {
        this.formationManager.checkBallCarrier();
    }

    changePossession(keepLOS = false) {
        this.playStateManager.changePossession(keepLOS);
        saveGame(this);
    }

    startPlay() {
        this.playStateManager.startPlay();
        // Defensive: no live path reaches a snap while reviewing today (every play-ending
        // pause passes ballCarrierDown, so Start stays disabled). Kept because a stale
        // reviewMode would silently block pass targeting for the whole play.
        this.resetReviewUI();
        this.reviewButton.disable();
    }

    pausePlay(ballCarrierDown) {
        this.playStateManager.pausePlay(ballCarrierDown);
    }

    nextPlay() {
        this.playStateManager.nextPlay();
        // nextPlay() has already reset every player to the new down's formation, so any
        // in-progress review of the prior play is no longer safe to resume into (Resume
        // would overwrite the fresh formation with the old play's recorded positions) —
        // tear the review UI down rather than just hiding it.
        this.resetReviewUI();
        this.reviewButton.disable();
        saveGame(this);
    }

    handleTackle(ballCarrier, tackler, type) {
        this.playStateManager.handleTackle(ballCarrier, tackler, type);
        saveGame(this);
    }

    // Called from pausePlay() once a play has truly ended, not from handleTackle(). A
    // touchdown keeps simulating for the celebration window after the endzone sensor fires,
    // and that run belongs in the replay -- stopping at handleTackle() would cut it off at
    // the goal line and light up Review Play while players were still moving.
    endPlayRecording() {
        this.playRecorder.stop();
        if (this.playRecorder.hasReplay()) this.reviewButton.enable();
    }

    incrementDown() {
        this.playStateManager.incrementDown();
    }
}
