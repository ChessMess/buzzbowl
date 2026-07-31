import { StandardGameScene } from './scenes/StandardGameScene';
import { FreePlayScene } from './scenes/FreePlayScene';
import { MainMenu } from "./scenes/MainMenu";
import Phaser, { Game } from 'phaser';

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config = {
    type: Phaser.AUTO,
    width: 1600,
    height: 900,
    parent: 'game-container',
    backgroundColor: '#333333',
    resolution: Math.min(window.devicePixelRatio || 1, 1.5),
    antialias: true, // Keep anti-aliasing for smooth shapes/lines
    // pixelArt: true, // Keep commented out
    roundPixels: false, // Keep false for smooth movement and rotation
    input: {
        mouse: { preventDefaultWheel: false }, // let wheel events fall through to page scroll (mouse.capture is not a real Phaser config key, this is the flag that actually gates wheel preventDefault)
    },
    physics: {
        default: 'matter',
        matter: {
            debug: false,
            gravity: { y: 0 },
            setBounds: true,
            plugins: {
                attractors: true
            }
        }
    },
    scale: {
        mode: Phaser.Scale.FIT, // Still use FIT to scale to container
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1600,
        height: 900,
        parent: 'game-container',
    },
    scene: [
        MainMenu,
        FreePlayScene,
        StandardGameScene,
    ],
    audio: false,
};

const StartGame = (parent) => {
    const game = new Game({ ...config, parent });
    // Dev-only console handle. Phaser keeps no global registry and nothing consumes the
    // ref PhaserGame.jsx sets, so without this there is no way to inspect a live scene.
    if (import.meta.env.DEV) window.__game = game;
    return game;
}

export default StartGame;
