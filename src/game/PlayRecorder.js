import { getAllPlayers } from "./helpers";

// ponytail: hard cap rather than a ring buffer. Measured ~3KB/frame recorded, so this
// bounds a live play's recording to ~5.4MB even if it never draws a tackle (normal
// plays run a few hundred frames; nothing legitimate should ever hit this). If a play
// runs past it, review just shows however far it got before capture stopped rather than
// the true ending. Upgrade to a ring buffer (drop oldest, keep newest MAX_FRAMES) if
// showing the actual tackle spot of a runaway play ever matters more than the fixed cap.
export const MAX_FRAMES = 1800; // ~30s at 60fps

export class PlayRecorder {
    constructor(game) {
        this.game = game;
        this.frames = [];
        this.recording = false;
    }

    // Pause -> Start calls this again mid-play. Only handleTackle stops the recorder, so
    // still-recording means we're resuming, not snapping a new play: keep the frames from
    // before the pause instead of restarting the replay partway through the run.
    start() {
        if (this.recording) return;
        this.frames = [];
        this.recording = true;
    }

    captureFrame(players) {
        if (!this.recording || this.frames.length >= MAX_FRAMES) return;
        const frame = {};
        players.forEach((player) => {
            frame[player.id] = { x: player.x, y: player.y, angle: player.currentAngle, hasBall: player.hasBall };
        });
        this.frames.push(frame);
    }

    stop() {
        if (this.recording) this.captureFrame(getAllPlayers(this.game));
        this.recording = false;
    }

    get frameCount() {
        return this.frames.length;
    }

    hasReplay() {
        return this.frames.length > 1;
    }

    applyFrame(index) {
        const clamped = Math.max(0, Math.min(this.frames.length - 1, index));
        const frame = this.frames[clamped];
        if (!frame) return;
        getAllPlayers(this.game).forEach((player) => {
            if (frame[player.id]) player.applyRecordedFrame(frame[player.id]);
        });
    }
}
