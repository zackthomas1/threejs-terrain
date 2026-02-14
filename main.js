import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// import/create loader
// const loader    = new GLTFLoader();

class Application {
    constructor() {
        this._renderer  = null;
        this._scene     = null;
        this._camera    = null;
        this._cube      = null;
        this._initialize();
    }

    _initialize() {
        // set up scene and camera
        this._scene     = new THREE.Scene();
        this._camera    = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
        // set up renderer
        this._renderer  = new THREE.WebGLRenderer();
        this._renderer.setSize(window.innerWidth, window.innerHeight);
        this._renderer.setAnimationLoop(() => this._animate());
        document.body.appendChild(this._renderer.domElement); // add renderer element to HTML document

        // Create geometry, apply a material to it, and insert into scene
        const geometry  = new THREE.BoxGeometry(1,1,1);
        const material  = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this._cube      = new THREE.Mesh(geometry, material);
        this._scene.add(this._cube);

        // Position camera
        this._camera.position.z = 5;
    }

    _animate() {
        // animate cube 
        this._cube.rotation.x += 0.01;
        this._cube.rotation.y += 0.01;

        this._renderer.render(this._scene, this._camera);
    }
}

function _Main() {
    _APP = new Application();
}

_Main();