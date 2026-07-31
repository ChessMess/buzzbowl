// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Phaser from 'phaser';
import { StandardGameScene } from '../../src/game/scenes/StandardGameScene.js';
import { getAllPlayers, getHomePlayers, getAwayPlayers } from '../../src/game/helpers.js';
import { hasSave, loadGame } from '../../src/game/saveGame.js';

let game;
let scene;

function bootScene() {
    return new Promise((resolve) => {
        game = new Phaser.Game({
            type: Phaser.HEADLESS,
            width: 1600,
            height: 900,
            physics: { default: 'matter', matter: { gravity: { y: 0 }, setBounds: true } },
            scene: [StandardGameScene],
            audio: { noAudio: true },
            banner: false,
            callbacks: {
                postBoot: () => {
                    scene = game.scene.getScene('StandardGame');
                    scene.events.once('create', () => resolve());
                },
            },
        });
    });
}

beforeEach(async () => {
    await bootScene();
});

afterEach(() => {
    game.destroy(true);
    game = null;
    scene = null;
});

describe('scene boot', () => {
    // createPlayers joins two independent config trees by player id. Nothing else in the
    // suite proves config.json, Player and the scene actually fit together.
    it('spawns 22 players, 11 a side, each with an offensive and defensive assignment', () => {
        const players = getAllPlayers(scene);

        expect(players).toHaveLength(22);
        expect(getHomePlayers(scene)).toHaveLength(11);
        expect(getAwayPlayers(scene)).toHaveLength(11);

        for (const player of players) {
            expect(player.offensivePosition, `player ${player.id} offense`).toBeTruthy();
            expect(player.defensivePosition, `player ${player.id} defense`).toBeTruthy();
        }

        expect(players.filter((p) => p.hasBall)).toHaveLength(1);
    });

    // BaseGameScene keeps one-line delegating methods so call sites stay on this.game.*
    // (a documented convention). This proves that delegation is actually wired, not that
    // the down rule works -- the unit tests own the rule.
    it('routes handleTackle through to the play state manager', () => {
        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);
        scene.lineOfScrimmage.x = 600;
        scene.firstDownMarker.x = 900;
        ballCarrier.x = 650;

        scene.handleTackle(ballCarrier, null, 'Tackle');

        expect(scene.down).toBe(2);
        expect(scene.lineOfScrimmage.x).toBe(680);
    });
});

describe('game clock', () => {
    it('runs only while a play is live', () => {
        expect(scene.gameClock).toBe(scene.quarterLength);

        scene.startPlay();
        expect(scene.clockRunning).toBe(true);

        scene.update(0, 1000);
        expect(scene.gameClock).toBeCloseTo(scene.quarterLength - 1, 5);

        scene.pausePlay();
        expect(scene.clockRunning).toBe(false);

        scene.update(1000, 1000);
        expect(scene.gameClock).toBeCloseTo(scene.quarterLength - 1, 5);
    });
});

describe('field bounds after resetPosition', () => {
    // Defensive formation offsets (up to 260px, for deep safeties) never got the field-bounds
    // clamp offense already had. A drive pinned at the goal line -- exactly where
    // handleNonTouchdown's own LOS clamp (145/1455) kicks in -- pushed defenders hundreds of
    // pixels past the 1600-wide canvas.
    it('keeps every player on-canvas after a snap deep in the red zone', () => {
        scene.possession = 'Home';
        scene.targetEndzone = 'Right';
        scene.offenseMovingRight = true;
        scene.down = 3;
        scene.lineOfScrimmage.x = 1440;
        scene.firstDownMarker.x = 1470;

        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);
        ballCarrier.x = 1440;
        scene.handleTackle(ballCarrier, null, 'Tackle');
        scene.nextPlay();

        for (const player of getAllPlayers(scene)) {
            expect(player.x, `player ${player.id} x`).toBeGreaterThanOrEqual(10);
            expect(player.x, `player ${player.id} x`).toBeLessThanOrEqual(1590);
        }
    });

    it('keeps every player on-canvas after a turnover on downs pinned deep', () => {
        scene.possession = 'Home';
        scene.targetEndzone = 'Right';
        scene.offenseMovingRight = true;
        scene.down = 4;
        scene.lineOfScrimmage.x = 1440;
        scene.firstDownMarker.x = 1470;

        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);
        ballCarrier.x = 1440;
        scene.handleTackle(ballCarrier, null, 'Tackle');
        expect(scene.turnoverOnDowns).toBe(true);

        scene.nextPlay();
        expect(scene.possession).toBe('Away');

        for (const player of getAllPlayers(scene)) {
            expect(player.x, `player ${player.id} x`).toBeGreaterThanOrEqual(10);
            expect(player.x, `player ${player.id} x`).toBeLessThanOrEqual(1590);
        }
    });
});

describe('touchdown at the goal line', () => {
    // The bug in #8/#17: the old touchdown trigger points were hardcoded numbers that
    // weren't actually symmetric to their own goal lines (left was 9px past its line, right
    // only 1px off), so the "fires early" bug was obvious on the left and easy to miss on
    // the right. leftGoalLineX/rightGoalLineX are now derived from one formula and shared by
    // both the Matter end zone sensor and update()'s position-based backstop below -- this
    // doesn't exercise the Matter sensor itself (that needs a physics step this harness
    // doesn't do), but since both trigger points read from these same values, pinning them
    // here still catches the actual regression: the two goal lines drifting out of sync.
    it('exposes the same goal-line x for both end zones the sensors were built from', () => {
        expect(scene.leftGoalLineX).toBe(135);
        expect(scene.rightGoalLineX).toBe(1455);
    });

    it('scores a touchdown once the ball carrier passes the right goal line, not before', () => {
        scene.possession = 'Home';
        scene.targetEndzone = 'Right';
        scene.startPlay();
        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);

        ballCarrier.x = scene.rightGoalLineX;
        scene.update(0, 16);
        expect(scene.scored).toBe(false);

        ballCarrier.x = scene.rightGoalLineX + 1;
        scene.update(16, 16);
        expect(scene.scored).toBe(true);
    });

    it('scores a touchdown once the ball carrier passes the left goal line, not before', () => {
        scene.possession = 'Home';
        scene.targetEndzone = 'Left';
        scene.startPlay();
        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);

        ballCarrier.x = scene.leftGoalLineX;
        scene.update(0, 16);
        expect(scene.scored).toBe(false);

        ballCarrier.x = scene.leftGoalLineX - 1;
        scene.update(16, 16);
        expect(scene.scored).toBe(true);
    });
});

describe('play review', () => {
    // hasReplay() needs 2+ recorded frames, and only a live play records.
    function recordAFewFrames() {
        scene.startPlay();
        scene.update(0, 16);
        scene.update(16, 16);
    }

    // applyRecordedFrame leans on Matter's Transform component: setPosition/setRotation
    // write through to the physics body, so it does not touch scene.matter itself. If that
    // ever stops holding, players would visually replay while their bodies stayed put.
    it('scrubbing moves the physics body, not just the sprite', () => {
        recordAFewFrames();
        const runner = getAllPlayers(scene).find((p) => p.hasBall);
        const startX = runner.body.position.x;

        runner.applyRecordedFrame({ x: startX + 200, y: 300, angle: 1, hasBall: true });

        expect(runner.body.position.x).toBeCloseTo(startX + 200);
        expect(runner.body.position.y).toBeCloseTo(300);
        expect(runner.body.angle).toBeCloseTo(1);
    });

    // enterReviewMode used to call hideUIPopups(), which nulls activeResultPopup -- so
    // exitReviewMode had nothing left to restore and Resume silently dropped the
    // end-of-play popup, leaving the Next Play button as the only way forward.
    it('restores the end-of-play popup when a review is resumed', () => {
        scene.lineOfScrimmage.x = 600;
        scene.firstDownMarker.x = 900;
        recordAFewFrames();

        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);
        ballCarrier.x = 650;
        scene.handleTackle(ballCarrier, null, 'Tackle');
        expect(scene.downPopup.bgRect.visible).toBe(true);

        scene.enterReviewMode();
        expect(scene.downPopup.bgRect.visible).toBe(false);

        scene.exitReviewMode();
        expect(scene.downPopup.bgRect.visible).toBe(true);
    });

    // The persistent Next Play button stays enabled underneath the review UI, so this is
    // reachable with one click. nextPlay() has already reset everyone to the new down's
    // formation, so a surviving review would let Resume stamp the old play's positions back
    // over it.
    it('tears down an open review when Next Play is clicked', () => {
        scene.lineOfScrimmage.x = 600;
        scene.firstDownMarker.x = 900;
        recordAFewFrames();

        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);
        ballCarrier.x = 650;
        scene.handleTackle(ballCarrier, null, 'Tackle');

        scene.enterReviewMode();
        expect(scene.reviewMode).toBe(true);

        scene.nextPlay();
        expect(scene.reviewMode).toBe(false);
        expect(scene.reviewScrubber.handle.visible).toBe(false);
        expect(scene.reviewButton.rect.input.enabled).toBe(false);
    });

    // Defensive rather than a live path: every play-ending pause passes ballCarrierDown, so
    // Start is disabled while reviewing. A stale reviewMode would silently block pass
    // targeting for the whole play, which is not a failure you would trace back to here.
    it('never carries review mode into a snapped play', () => {
        recordAFewFrames();
        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);
        scene.handleTackle(ballCarrier, null, 'Tackle');
        scene.enterReviewMode();

        scene.startPlay();

        expect(scene.reviewMode).toBe(false);
        expect(scene.reviewScrubber.handle.visible).toBe(false);
    });

    // Upstream #19 keeps the play simulating for framesAfterScore after the endzone sensor
    // fires, so the ball carrier runs on into the endzone. Recording used to stop in
    // handleTackle, which cut the replay off at the goal line and lit up Review Play while
    // players were still moving.
    it('records the run into the endzone, not just up to the goal line', () => {
        scene.possession = 'Home';
        scene.targetEndzone = 'Right';
        recordAFewFrames();

        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);
        ballCarrier.x = scene.rightGoalLineX + 1;
        scene.update(32, 16);
        expect(scene.scored).toBe(true);

        // Still celebrating: play is live, so the recorder must still be running and the
        // review button must not be offering a scrub of a moving field.
        const framesAtScore = scene.playRecorder.frameCount;
        expect(scene.playStarted).toBe(true);
        expect(scene.reviewButton.rect.input.enabled).toBe(false);

        // Drive the carrier deeper into the endzone through the celebration window.
        // framesAfterScore counts down as we go, so snapshot the bound first.
        const celebrationFrames = scene.framesAfterScore + 5;
        for (let i = 0; i < celebrationFrames && scene.playStarted; i++) {
            ballCarrier.x = scene.rightGoalLineX + 2 + i;
            scene.update(48 + i * 16, 16);
        }

        expect(scene.playStarted).toBe(false);
        expect(scene.playRecorder.frameCount).toBeGreaterThan(framesAtScore);
        expect(scene.reviewButton.rect.input.enabled).toBe(true);

        const finalFrame = scene.playRecorder.frames[scene.playRecorder.frameCount - 1];
        expect(finalFrame[ballCarrier.id].x).toBeGreaterThan(scene.rightGoalLineX + 2);
    });
});

describe('save on tackle', () => {
    beforeEach(() => {
        const store = new Map();
        globalThis.localStorage = {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
        };
    });

    // Normal tackles save the play result immediately so a refresh during the
    // end-of-play popup preserves down/LOS progress.
    it('saves play result on a normal tackle', () => {
        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);
        scene.lineOfScrimmage.x = 600;
        scene.firstDownMarker.x = 900;
        ballCarrier.x = 650;

        scene.handleTackle(ballCarrier, null, 'Tackle');

        expect(hasSave('StandardGame')).toBe(true);
        const reloaded = { scene: { key: 'StandardGame' }, lineOfScrimmage: {}, firstDownMarker: {} };
        loadGame(reloaded);
        expect(reloaded.down).toBe(scene.down);
    });

    // Turnover on downs also saves immediately, but the possession change is
    // deferred to nextPlay. On resume, loadGame detects the saved
    // turnoverOnDowns flag and applies the pending change.
    it('saves on a tackle that causes a turnover on downs and resolves possession on resume', () => {
        scene.possession = 'Home';
        scene.down = 4;
        scene.offenseMovingRight = true;
        scene.targetEndzone = 'Right';
        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);
        scene.lineOfScrimmage.x = 600;
        scene.firstDownMarker.x = 900;
        ballCarrier.x = 400;

        scene.handleTackle(ballCarrier, null, 'Tackle');

        expect(scene.turnoverOnDowns).toBe(true);
        expect(hasSave('StandardGame')).toBe(true);

        const reloaded = {
            scene: { key: 'StandardGame' },
            lineOfScrimmage: {},
            firstDownMarker: {},
            possession: 'Home',
            targetEndzone: 'Right',
            offenseMovingRight: true,
            down: 1,
        };
        loadGame(reloaded);
        expect(reloaded.possession).toBe('Away');
        expect(reloaded.down).toBe(1);
    });

    // After nextPlay resolves the deferred possession change, the save
    // always captures a fully-consistent state with no pending flags.
    it('saves on nextPlay with consistent state', () => {
        const ballCarrier = getAllPlayers(scene).find((p) => p.hasBall);
        scene.lineOfScrimmage.x = 600;
        scene.firstDownMarker.x = 900;
        ballCarrier.x = 650;

        scene.handleTackle(ballCarrier, null, 'Tackle');
        scene.nextPlay();

        expect(hasSave('StandardGame')).toBe(true);
        const reloaded = { scene: { key: 'StandardGame' }, lineOfScrimmage: {}, firstDownMarker: {} };
        loadGame(reloaded);
        expect(reloaded.down).toBe(scene.down);
    });
});

describe('end of quarter', () => {
    it('swaps direction and hands the ball to Away at halftime', () => {
        scene.quarter = 2;
        scene.down = 3;
        scene.lineOfScrimmage.x = 600;

        scene.endQuarter();

        expect(scene.halftime).toBe(true);
        expect(scene.quarter).toBe(3);
        expect(scene.possession).toBe('Away');
        expect(scene.targetEndzone).toBe('Left');
        expect(scene.down).toBe(1);
        expect(scene.lineOfScrimmage.x).toBe(scene.canvasWidth - 600);
        expect(scene.gameClock).toBe(scene.quarterLength);
    });

    it('ends the game after the fourth quarter', () => {
        scene.quarter = 4;

        scene.endQuarter();

        expect(scene.quarterText.text).toBe('FINAL');
        // The clock must not roll over into a fifth quarter.
        expect(scene.quarter).toBe(4);
    });
});
