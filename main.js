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
        this._cubes      = null;
        this._controls  = null;
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

        // set up orbit controls
        this._controls = new OrbitControls(this._camera, this._renderer.domElement);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.05;

        // Create geometry, apply a material to it, and insert into scene
        const geometry  = new THREE.BoxGeometry(1,1,1);
        this._cubes     = [
            this._makeGeometry(geometry, 0x44aa88, 0),
            this._makeGeometry(geometry, 0x8844aa, -2),
            this._makeGeometry(geometry, 0xaa8844, 2),
        ];
        
        this._cubes.forEach((cube) => {
            this._scene.add(cube);
        });

        // create a light 
        const light = new THREE.DirectionalLight(0xFFFFFF, 3);  // color, intensity
        light.position.set(-1,2,4);
        this._scene.add(light);

        // set scene background
        this._scene.background = new THREE.Color(0x666666);

        // Position camera
        this._camera.position.z = 5;
    }

    _animate() {
        // update controls
        this._controls.update();

        // animate cube

        this._cubes.forEach((cube, ndx) => {
            const rot = (1 + ndx) * 0.01;
            cube.rotation.x += rot;
            cube.rotation.y += rot;
        })


        this._renderer.render(this._scene, this._camera);
    }

    _makeGeometry(geometry, color, xpos) { 
        const material  = new THREE.MeshPhongMaterial({color});
        const cube      = new THREE.Mesh(geometry, material);
        cube.position.x = xpos;
        return cube;
    }

}


function _Main() {
    const app = new Application();
}

_Main();