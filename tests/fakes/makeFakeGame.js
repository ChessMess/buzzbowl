import { vi } from 'vitest';
import config from '../../src/game/configLoader.js';

export function makeFakePlayer(overrides = {}) {
    const player = {
        id: 1,
        team: 'Home',
        hasBall: false,
        fillColor: 0x000088,
        offensivePosition: 'RB',
        defensivePosition: 'MLB',
        origY: 450,
        canReceivePass: false,
        x: 600,
        y: 450,
        baseAngle: 0,
        currentAngle: 0,
        initialX: 600,
        initialY: 450,
        body: null,
        targetCircle: { setVisible: vi.fn(), setPosition: vi.fn() },
        setPosition: vi.fn(function (x, y) { this.x = x; this.y = y; }),
        setRotation: vi.fn(),
        makeDynamic: vi.fn(),
        stop: vi.fn(),
        resetPosition: vi.fn(),
        applyRecordedFrame: vi.fn(),
        deselect: vi.fn(),
        logPlayer: vi.fn(),
        ...overrides,
    };
    player.teamHasPossession = (game) => player.team === game.possession;
    return player;
}

/**
 * Every field PlayStateManager and FormationManager read off `this.game`, with no Phaser.
 * `players` defaults to one Home RB / one Away MLB; pass your own for position-sensitive tests.
 */
export function makeFakeGame(overrides = {}) {
    const { players, ...rest } = overrides;
    const roster = players ?? [
        makeFakePlayer({ id: 1, team: 'Home', offensivePosition: 'RB', hasBall: true }),
        makeFakePlayer({ id: 12, team: 'Away', offensivePosition: 'RB', defensivePosition: 'MLB' }),
    ];

    const game = {
        possession: 'Home',
        targetEndzone: 'Right',
        offenseMovingRight: true,
        down: 1,
        downLabels: { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' },
        homeScore: 0,
        awayScore: 0,
        homeColor: config.colors.home,
        awayColor: config.colors.away,
        ballCarrierColor: config.colors.ballCarrier,

        canvasWidth: config.canvas.width,
        margin: config.layout.margin,
        fieldWidth: config.canvas.width - config.layout.margin * 2,

        formation: 'I',
        defensiveFormation: '4-3',
        playType: 'Run',
        formationText: { setText: vi.fn() },
        defensiveFormationText: { setText: vi.fn() },
        playTypeText: { setText: vi.fn() },

        playStarted: false,
        playPaused: false,
        playPausedBeforeSnap: true,
        passAttempted: false,
        scored: false,
        turnoverOnDowns: false,
        framesAfterScore: 40,

        lineOfScrimmage: { x: config.field.lineOfScrimmageX, previousX: null, marker: { updateX: vi.fn() } },
        firstDownMarker: { x: config.field.lineOfScrimmageX + 132, marker: { updateX: vi.fn() } },

        startButton: { enable: vi.fn(), disable: vi.fn() },
        pauseButton: { enable: vi.fn(), disable: vi.fn() },
        nextPlayButton: { enable: vi.fn(), disable: vi.fn() },
        scoreboard: { updateScore: vi.fn(), updateDown: vi.fn() },

        matter: { body: { setPosition: vi.fn(), setAngle: vi.fn() } },

        setLOSBarrierSensor: vi.fn(),
        updateLOSBarrier: vi.fn(),
        updateTargetCircle: vi.fn(),
        checkBallCarrier: vi.fn(),
        hideUIPopups: vi.fn(),
        showTouchdownUI: vi.fn(),
        showDownUI: vi.fn(),
        playRecorder: { start: vi.fn(), stop: vi.fn() },
        endPlayRecording: vi.fn(),

        ...rest,
    };

    game.home = { children: { entries: roster.filter((p) => p.team === 'Home') } };
    game.away = { children: { entries: roster.filter((p) => p.team === 'Away') } };

    return game;
}
