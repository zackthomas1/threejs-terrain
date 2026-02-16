import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';


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

    async _initialize() {
        // set up clock
        this._clock     = new THREE.Clock();

        // set up scene and camera
        this._scene     = new THREE.Scene();
        this._camera    = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
        // set up renderer
        this._renderer  = new THREE.WebGPURenderer({ antialias: true });
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

        // Create geometry, apply material, and insert into scene
        const planeGeo  = new THREE.PlaneGeometry(10, 10, 256, 256);

        // --- TSL Terrain Material Setup ---
        const material = new THREE.MeshPhongNodeMaterial({
            color: 0x444444,
            shininess: 30,
            wireframe: false,
            flatShading: true,
            side: THREE.DoubleSide
        });

        // 1. Calculate distance from center (0,0) in local space
        const dist = TSL.length(TSL.positionLocal.xy);
        
        // 2. Calculate normalized height factor (0.0 to 1.0)
        // logic: h = max(0.0, 1.0 - (dist / 5.0))
        const h = TSL.float(1.0).sub(dist.div(5.0)).max(0.0);
        
        // 3. Apply quintic ease curve: h^3 * (h * (h * 6 - 15) + 10)
        const h3 = h.mul(h).mul(h);
        
        // 6.0 * h - 15.0
        const inner = h.mul(6.0).sub(15.0);
        // (h * inner + 10.0)
        const mid = h.mul(inner).add(10.0);
        // h^3 * mid
        const height = h3.mul(mid);

        // 4. Update the vertex position
        // We want to offset Z by 'height * 2.0'
        // New Position = Original Position + vec3(0, 0, height*2)
        const displacement = TSL.vec3(0, 0, height.mul(2.0));
        
        // Assign the new position node to the material
        material.positionNode = TSL.positionLocal.add(displacement);

        // 5. Analytical Normal Calculation
        // Use TSL's cross product of derivatives to simulate the normal for displaced geometry.
        // This is equivalent to `normalize(cross(dFdx(pos), dFdy(pos)))`
        // Note: For a truly continuous normal, we would take the analytical derivative of the quintic function.
        // But for procedural terrain, this derivative method is very robust.
        
        // We need to calculate the normal based on the *world* position change.
        // Or simply assign the cross of the derivatives of the *local* position.
        
        const pos = material.positionNode;
        material.normalNode = TSL.cross(TSL.dFdx(pos), TSL.dFdy(pos)).normalize();

        const plane = new THREE.Mesh(planeGeo, material);
        plane.position.x = -1;
        plane.position.y = -1;
        plane.rotation.x = -Math.PI/2.0;

        this._materials.push(material);
        this._meshes.push(plane);
        this._scene.add(plane);

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
            light.position.y = Math.sin(time) * 5;
        });

        this._renderer.render(this._scene, this._camera);
    }

    _constructMesh(geometry, material) { 
        const mesh      = new THREE.Mesh(geometry, material);

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
