import { describe, it, expect } from 'vitest';
import { PlayRecorder, MAX_FRAMES } from '../../src/game/PlayRecorder.js';
import { makeFakeGame, makeFakePlayer } from '../fakes/makeFakeGame.js';

describe('PlayRecorder', () => {
    it('captures nothing before start() and nothing after stop()', () => {
        const game = makeFakeGame();
        const recorder = new PlayRecorder(game);

        recorder.captureFrame(game.home.children.entries.concat(game.away.children.entries));
        expect(recorder.frameCount).toBe(0);

        recorder.start();
        recorder.captureFrame(game.home.children.entries.concat(game.away.children.entries));
        recorder.stop();
        const countAfterStop = recorder.frameCount;

        recorder.captureFrame(game.home.children.entries.concat(game.away.children.entries));
        expect(recorder.frameCount).toBe(countAfterStop);
    });

    it('stop() captures one final frame even if the caller never called captureFrame', () => {
        const runner = makeFakePlayer({ id: 1, x: 500, y: 450, currentAngle: 0, hasBall: true });
        const game = makeFakeGame({ players: [runner] });
        const recorder = new PlayRecorder(game);

        recorder.start();
        runner.x = 650;
        recorder.stop();

        expect(recorder.frameCount).toBe(1);
        expect(recorder.hasReplay()).toBe(false);
    });

    it('hasReplay() is false with 0 or 1 frames, true with 2+', () => {
        const game = makeFakeGame();
        const recorder = new PlayRecorder(game);
        expect(recorder.hasReplay()).toBe(false);

        recorder.start();
        recorder.captureFrame(game.home.children.entries);
        expect(recorder.hasReplay()).toBe(false);

        recorder.captureFrame(game.home.children.entries);
        expect(recorder.hasReplay()).toBe(true);
    });

    it('applyFrame() replays recorded x/y/angle/hasBall onto each player by id', () => {
        const runner = makeFakePlayer({ id: 1, team: 'Home', x: 500, y: 450, currentAngle: 0, hasBall: true });
        const game = makeFakeGame({ players: [runner] });
        const recorder = new PlayRecorder(game);

        recorder.start();
        recorder.captureFrame(game.home.children.entries); // frame 0: x=500
        runner.x = 600;
        runner.currentAngle = 0.5;
        runner.hasBall = false;
        recorder.captureFrame(game.home.children.entries); // frame 1: x=600
        recorder.stop();

        recorder.applyFrame(0);
        expect(runner.applyRecordedFrame).toHaveBeenLastCalledWith({ x: 500, y: 450, angle: 0, hasBall: true });

        recorder.applyFrame(1);
        expect(runner.applyRecordedFrame).toHaveBeenLastCalledWith({ x: 600, y: 450, angle: 0.5, hasBall: false });
    });

    it('applyFrame() clamps out-of-range indexes to the nearest real frame', () => {
        const runner = makeFakePlayer({ id: 1, x: 500, y: 450 });
        const game = makeFakeGame({ players: [runner] });
        const recorder = new PlayRecorder(game);

        recorder.start();
        recorder.captureFrame(game.home.children.entries);
        recorder.captureFrame(game.home.children.entries);
        recorder.stop();

        recorder.applyFrame(-5);
        expect(runner.applyRecordedFrame).toHaveBeenLastCalledWith(expect.objectContaining({ x: 500 }));

        recorder.applyFrame(999);
        expect(runner.applyRecordedFrame).toHaveBeenLastCalledWith(expect.objectContaining({ x: 500 }));
    });

    it('stops growing at MAX_FRAMES instead of recording an unbounded play', () => {
        const runner = makeFakePlayer({ id: 1 });
        const game = makeFakeGame({ players: [runner] });
        const recorder = new PlayRecorder(game);

        recorder.start();
        for (let i = 0; i < MAX_FRAMES + 50; i++) {
            recorder.captureFrame(game.home.children.entries);
        }

        expect(recorder.frameCount).toBe(MAX_FRAMES);
    });

    // Pause -> Start re-enters startPlay() mid-play. Wiping there restarted the replay
    // from the resume point, so review skipped everything before the pause.
    it('start() keeps the frames so far when a paused play is resumed', () => {
        const runner = makeFakePlayer({ id: 1, x: 100 });
        const game = makeFakeGame({ players: [runner] });
        const recorder = new PlayRecorder(game);

        recorder.start();
        recorder.captureFrame(game.home.children.entries);
        recorder.captureFrame(game.home.children.entries);

        runner.x = 400;
        recorder.start(); // the resume
        recorder.captureFrame(game.home.children.entries);
        recorder.stop();

        expect(recorder.frameCount).toBe(4);
        recorder.applyFrame(0);
        expect(runner.applyRecordedFrame).toHaveBeenLastCalledWith(expect.objectContaining({ x: 100 }));
    });

    it('start() wipes any previously recorded play', () => {
        const runner = makeFakePlayer({ id: 1 });
        const game = makeFakeGame({ players: [runner] });
        const recorder = new PlayRecorder(game);

        recorder.start();
        recorder.captureFrame(game.home.children.entries);
        recorder.captureFrame(game.home.children.entries);
        recorder.stop();
        expect(recorder.hasReplay()).toBe(true);

        recorder.start();
        expect(recorder.frameCount).toBe(0);
        expect(recorder.hasReplay()).toBe(false);
    });
});
