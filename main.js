import * as THREE from 'three/webgpu';
import GUI from 'lil-gui';
import {TerrainScene} from './src/terrain/terrain';
import * as CONFIG from './src/config';

class Application {
    _gui        = null;
    _guiParams  = {};

    _renderer       = null;
    _clock          = null;
    _terrainScene   = null;

    constructor() {
        // initialize gui
        this._guiParams = {
            general : {},
        }; 
        this._gui = new GUI();

        const generalRollup = this._gui.addFolder('General');
        generalRollup.close();

        // create terrain scene
        this._terrainScene = new TerrainScene({
            gui : this._gui,
            guiParams : this._guiParams
        });

        // set up clock
        this._clock     = new THREE.Clock();
    }

    async init() {
        await this._initRenderer();
    }

    async _initRenderer() {
        this._renderer = new THREE.WebGPURenderer({ antialias: true });
        this._renderer.setSize(window.innerWidth, window.innerHeight);

        await this._renderer.init();

        CONFIG.CANVAS_TARGET.appendChild(this._renderer.domElement);
        this._renderer.setAnimationLoop(() => this._update());
    }

    _update() {
        const deltaTime = this._clock.getDelta();
        // const elapsedTime = this._clock.getElapsedTime();

        this._terrainScene.update(deltaTime);
        this._terrainScene.render(this._renderer);
    }

    onWindowResize() {
        if (!this._renderer) {
            return;
        }

        // Update scene camera
        this._terrainScene.onWindowResize();

        // Update renderer
        this._renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Entry point
async function _Main() {
    const app = new Application();
    await app.init();
    
    window.addEventListener('resize', () => app.onWindowResize());
}

_Main().catch((error) => {
    console.error('Failed to initialize application:', error);
});