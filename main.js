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
        this._material  = null;
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
        const cubeGeo   = new THREE.BoxGeometry(1,1,1);

        this._makeGeometry(cubeGeo, 0x44aa88, 0);
        this._makeGeometry(cubeGeo, 0x8844aa, -2);
        this._makeGeometry(cubeGeo, 0xaa8844, 2);

        const planeGeo  = new THREE.PlaneGeometry(10, 10, 20, 20);
        let plane = this._makeGeometry(planeGeo, 0x444444, -1);
        plane.position.y = -1;
        plane.rotation.x = -Math.PI/2.0;


        this._meshes.forEach((cube) => {
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

        this._meshes.forEach((mesh, index) => {
            if (index == 0 || index == 1 || index == 2) { 
                const rot = (1 + index) * 0.01;
                mesh.rotation.x += rot;
                mesh.rotation.y += rot;
            }
        })

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

}


function _Main() {
    const app = new Application();

    document.getElementById("wireframeToggle").addEventListener('click', () => {
        app.toggleWireframe();
    })
}

_Main();
