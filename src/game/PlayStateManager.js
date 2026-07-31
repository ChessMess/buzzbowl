import config from "./configLoader.js";
import { yardsToPixels, getHomePlayers, getAwayPlayers, getAllPlayers, deselectAllPlayers } from "./helpers.js";
import { log } from "./logger";

export class PlayStateManager {
    constructor(game) {
        this.game = game;
    }

    startPlay() {
        if (this.game.playStarted) return;

        deselectAllPlayers(this.game);
        this.game.playStarted = true;
        this.game.playPaused = false;
        this.game.playPausedBeforeSnap = false;
        this.game.lineOfScrimmage.previousX = this.game.lineOfScrimmage.x;
        this.game.passAttempted = false;
        this.game.snapAt = this.game.time.now;
        this.game.playRecorder.start();

        const snapBallCarrier = getAllPlayers(this.game).find(p => p.hasBall);
        console.log(
            `[DEBUG] startPlay: possession=${this.game.possession} down=${this.game.down} ` +
            `LOS=${this.game.lineOfScrimmage.x.toFixed(1)} playType=${this.game.playType} ` +
            `ballCarrier=${snapBallCarrier ? `id=${snapBallCarrier.id} x=${snapBallCarrier.x.toFixed(1)}` : "none"}`
        );

        this.game.setLOSBarrierSensor(true);

        this.game.startButton.disable();
        this.game.nextPlayButton.disable();
        this.game.pauseButton.enable();

        this.forEachPlayer((player) => {
            if (player && player.makeDynamic) {
                player.makeDynamic();
            }
        });
    }

    pausePlay(ballCarrierDown) {
        if (!this.game.playStarted) return;

        this.game.playStarted = false;
        this.game.playPaused = true;

        this.game.setLOSBarrierSensor(false);

        this.forEachPlayer((player) => {
            if (player && player.stop) {
                player.stop();
            }
        });

        if (!ballCarrierDown) {
            this.game.startButton.enable();
        }
        this.game.pauseButton.disable();

        // ballCarrierDown distinguishes a play ending from a mid-play Pause, and this is the
        // first point at which nothing is moving any more -- for a touchdown that is 120
        // frames after the endzone sensor fired, so the run into the endzone gets recorded.
        if (ballCarrierDown) {
            this.game.endPlayRecording();
        }
    }

    changePossession(keepLOS = false) {
        console.log(
            `[DEBUG] changePossession: ${this.game.possession} -> ${this.game.possession === "Home" ? "Away" : "Home"} ` +
            `keepLOS=${keepLOS} LOS=${this.game.lineOfScrimmage.x.toFixed(1)}`
        );

        this.game.possession = this.game.possession === "Home" ? "Away" : "Home";
        this.game.targetEndzone = this.game.targetEndzone === "Right" ? "Left" : "Right";
        this.game.offenseMovingRight = this.game.targetEndzone === "Right";
        this.game.down = 1;

        this.resetAllPlayerColors();

        this.game.lineOfScrimmage.previousX = this.game.lineOfScrimmage.x;

        if (!keepLOS) {
            const losResetX = this.game.targetEndzone === "Right"
                ? this.game.canvasWidth * 0.38
                : this.game.canvasWidth * 0.62;
            this.game.lineOfScrimmage.x = losResetX;
            this.game.lineOfScrimmage.marker.updateX(losResetX);
            this.game.updateLOSBarrier(losResetX);
        }

        const fdDirection = this.game.targetEndzone === "Right" ? 1 : -1;
        const fdX = this.game.lineOfScrimmage.x + fdDirection * yardsToPixels(config.field.yardsToFirstDown);
        this.game.firstDownMarker.x = fdX;
        this.game.firstDownMarker.marker.updateX(fdX);

        this.game.scoreboard.updateDown(this.game.downLabels[this.game.down]);

        this.forEachPlayer((player) => {
            if (player && player.resetPosition) {
                player.resetPosition(this.game);
            }
        });

        this.game.checkBallCarrier();

        this.setDefensiveTeamColor();

        this.resetPlayState();
        this.game.startButton.enable();
        this.game.nextPlayButton.disable();
    }
    
    nextPlay() {
        console.log(
            `[DEBUG] nextPlay: scored=${this.game.scored} turnoverOnDowns=${this.game.turnoverOnDowns} ` +
            `down=${this.game.down} possession=${this.game.possession}`
        );

        if (this.game.scored) {
            this.changePossession();
        }

        if (this.game.turnoverOnDowns) {
            this.game.turnoverOnDowns = false;
            this.changePossession(true);
        }

        this.pausePlay();
        this.game.hideUIPopups();
        this.game.playPausedBeforeSnap = true;
        this.game.playStarted = false;
        this.game.playPaused = false;
        this.game.framesAfterScore = 40;

        log(`new lOS: ${this.game.lineOfScrimmage.x}`);

        this.forEachPlayer((player) => {
            if (player && player.resetPosition) {
                player.resetPosition(this.game);
            }
        });

        this.game.checkBallCarrier();

        this.forEachPlayer((player) => this.game.updateTargetCircle(player));

        this.game.startButton.enable();
        this.game.nextPlayButton.disable();
        this.game.playStarted = false;
    }

    handleTackle(ballCarrier, tackler, type) {
        this.game.playPausedBeforeSnap = false;

        const elapsedMs = this.game.snapAt != null ? (this.game.time.now - this.game.snapAt).toFixed(0) : "?";
        const traveled = ballCarrier ? (ballCarrier.x - this.game.lineOfScrimmage.previousX).toFixed(1) : "n/a";
        console.log(
            `[DEBUG] handleTackle type=${type || "Tackle"} elapsedMs=${elapsedMs} ` +
            `ballCarrier=${ballCarrier ? `id=${ballCarrier.id} team=${ballCarrier.team} x=${ballCarrier.x.toFixed(1)}` : "none"} ` +
            `tackler=${tackler ? `id=${tackler.id} team=${tackler.team} entityType=${tackler.entityType}` : "none"} ` +
            `traveledSinceSnap=${traveled}px LOS=${this.game.lineOfScrimmage.x.toFixed(1)}`
        );

        if (config.debug) {
            try {
                log("ball carrier");
                if (ballCarrier) ballCarrier.logPlayer();
                log("tackler");
                if (tackler) tackler.logPlayer();
            } catch {
                log("tackle was made by sideline/endzone");
            }
        }

        let tackleX;

        if (ballCarrier) {
            tackleX = ballCarrier.x.toFixed(2);
        } else if (type === "Incomplete") {
            tackleX = this.game.lineOfScrimmage.x;
        }

        if (type === "Touchdown") {
            this.handleTouchdown();
        } else {
            this.handleNonTouchdown(tackleX, type);
        }
    }

    handleTouchdown() {
        log("Touchdown of " +
            (this.game.lineOfScrimmage.x - this.game.lineOfScrimmage.previousX).toFixed(2) + "px");

        this.game.showTouchdownUI();
        this.game.scored = true;

        if (this.game.possession === "Home") {
            this.game.homeScore += 7;
            this.game.scoreboard.updateScore("Home", this.game.homeScore);
        } else {
            this.game.awayScore += 7;
            this.game.scoreboard.updateScore("Away", this.game.awayScore);
        }
    }

    handleNonTouchdown(tackleX, type) {
        if (type !== "Incomplete") {
            this.game.lineOfScrimmage.previousX = this.game.lineOfScrimmage.x;
            const losDir = this.game.targetEndzone === "Right" ? 1 : -1;
            let newLOS = Number(tackleX) + losDir * 30;
            if (newLOS < 145) newLOS = 145;
            if (newLOS > 1455) newLOS = 1455;

            this.game.lineOfScrimmage.x = newLOS;
            this.game.lineOfScrimmage.marker.updateX(newLOS);
            this.game.updateLOSBarrier(newLOS);

            const reachedFirstDown = this.game.targetEndzone === "Right"
                ? this.game.lineOfScrimmage.x >= this.game.firstDownMarker.x
                : this.game.lineOfScrimmage.x <= this.game.firstDownMarker.x;

            if (reachedFirstDown) {
                const fdX = newLOS + losDir * (yardsToPixels(10) + 30);
                this.game.firstDownMarker.x = fdX;
                this.game.firstDownMarker.marker.updateX(fdX);
                this.game.down = 1;
                this.game.scoreboard.updateDown(this.game.downLabels[this.game.down]);
            } else {
                this.incrementDown();
            }
            console.log(
                `[DEBUG] handleNonTouchdown: newLOS=${newLOS.toFixed(1)} firstDownMarker=${this.game.firstDownMarker.x.toFixed(1)} ` +
                `reachedFirstDown=${reachedFirstDown} down=${this.game.down} turnoverOnDowns=${this.game.turnoverOnDowns}`
            );
            this.game.showDownUI();
        } else if (type === "Incomplete") {
            this.incrementDown();
        }

        this.game.nextPlayButton.enable();
        this.pausePlay(true);
        this.game.playStarted = false;
    }

    incrementDown() {
        this.game.down++;
        if (this.game.down > 4) {
            this.game.down = 1;
            this.game.turnoverOnDowns = true;
        }
        this.game.scoreboard.updateDown(this.game.downLabels[this.game.down]);
    }

    forEachPlayer(callback) {
        getAllPlayers(this.game).forEach(callback);
    }

    resetAllPlayerColors() {
        getAllPlayers(this.game).forEach(player => {
            player.hasBall = false;
            player.fillColor = player.team === "Home" ? this.game.homeColor : this.game.awayColor;
            this.game.updateTargetCircle(player);
        });
    }

    setDefensiveTeamColor() {
        const defPlayers = this.game.possession === "Home" ? getAwayPlayers(this.game) : getHomePlayers(this.game);
        const defTeamColor = this.game.possession === "Home" ? this.game.awayColor : this.game.homeColor;
        defPlayers.forEach(player => { player.fillColor = defTeamColor; });
    }

    resetPlayState() {
        this.game.scored = false;
        this.game.playStarted = false;
        this.game.playPaused = false;
        this.game.playPausedBeforeSnap = true;
        this.game.framesAfterScore = 120;
    }
}
