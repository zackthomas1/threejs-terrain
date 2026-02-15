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
        this._meshes    = [];
        this._materials = [];
        this._lights    = [];
        this._controls  = null;
        this._clock = null;
        this._initialize();
    }

    _initialize() {
        // set up clock
        this._clock     = new THREE.Clock();

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

        // Position camera
        this._camera.position.z = 5;
        this._camera.position.y = 1;

        // Create geometry, apply a material to it, and insert into scene
        const planeGeo  = new THREE.PlaneGeometry(10, 10, 256, 256);
        let plane = this._makeGeometry(planeGeo, 0x444444, -1);
        plane.position.y = -1;
        plane.rotation.x = -Math.PI/2.0;

        this._meshes.forEach((cube) => {
            this._scene.add(cube);
        });

        const geometry = plane.geometry;
        const positionAttrib = geometry.getAttribute('position'); 

        for (let i = 0; i < positionAttrib.count; i++){
            const x = positionAttrib.getX(i);
            const y = positionAttrib.getY(i);
            const z = positionAttrib.getZ(i);

            const distance = Math.sqrt((x*x) + (y*y));
        
            let h = Math.max(0, 1.0 - (distance / 5.0));
            const height = h * h * h * (h * (h * 6 - 15) + 10);
            positionAttrib.setZ(i, height);
        }

        positionAttrib.needsUpdate = true;

        // create a light 
        const light = new THREE.DirectionalLight(0xFFFFFF, 3);  // color, intensity
        light.position.set(-1,2,4);
        this._lights.push(light);
        this._scene.add(light);

        // set scene background
        this._scene.background = new THREE.Color(0x667789);
    }

    _animate() {
        // update controls
        this._controls.update();

        const time = this._clock.getElapsedTime();

        // animate light
        this._lights.forEach((light) => {
            light.position.x = Math.sin(time) * 5;
            light.position.z = Math.sin(time) * 5;
        });

        this._renderer.render(this._scene, this._camera);
    }

    _makeGeometry(geometry, color, xpos) { 
        const material  = new THREE.MeshPhongMaterial({color});
        const mesh      = new THREE.Mesh(geometry, material);
        mesh.position.x = xpos;

        this._materials.push(material);
        this._meshes.push(mesh);
        return mesh;
    }

    toggleWireframe() {
        console.log("Toggle wireframe");
        this._materials.forEach((mat) => {
            mat.wireframe = !mat.wireframe;
        });
    }

    onWindowResize() {
        // Update camera
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
        
        // Update renderer
        this._renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

function _Main() {
    const app = new Application();

    // event listeners
    document.getElementById("wireframeToggle").addEventListener('click', () => {
        app.toggleWireframe();
    })
    window.addEventListener('resize', () => app.onWindowResize());
}

_Main();
