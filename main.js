import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';


class Application {
    constructor() {
        this._renderer      = null;
        this._scene         = null;
        this._camera        = null;
        this._terrainMesh   = null;
        this._meshes        = [];
        this._materials     = [];
        this._lights        = [];
        this._controls      = null;
        this._clock         = null;
        this._currentSegments = 256;
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
            flatShading: false,
            side: THREE.DoubleSide
        });

        // 1. UV setup for heightmap sampling (map local space -5 to 5 to 0..1 UV)
        // Plane is 10x10 centered at 0,0, so local XY goes from -5 to 5.
        const uv = TSL.positionLocal.xy.div(10).add(0.5);
        
        // Create heightmap texture
        const defaultRes = 256;
        this._heightmap = this._generateHeightmap(defaultRes);
        this._heightmapNode = TSL.texture(this._heightmap);
        this._heightmapRes = TSL.uniform(defaultRes);

        // 2. Manual Bilinear Filtering implementation in TSL
        // This ensures smooth transitions between discrete heightmap samples
        // and provides high-precision interpolation for vertex displacement.
        const bilinearSample = TSL.Fn(({ texNode, uv, filtersize }) => {
            const size = TSL.vec2(filtersize, filtersize);
            const texelSize = TSL.vec2(1.0).div(size);
            
            // Shift UV by half-texel to center the sampling grid
            const coord = uv.mul(size).sub(0.5);
            const i = TSL.floor(coord);
            const f = TSL.fract(coord);
            
            // Helper to sample a single texel.
            const sample = (offset) => texNode.uv(i.add(offset).add(0.5).mul(texelSize)).r;
            
            // Sample 4 neighboring texels
            const a = sample(TSL.vec2(0, 0));
            const b = sample(TSL.vec2(1, 0));
            const c = sample(TSL.vec2(0, 1));
            const d = sample(TSL.vec2(1, 1));
            
            // Perform bilinear interpolation
            return TSL.mix(
                TSL.mix(a, b, f.x),
                TSL.mix(c, d, f.x),
                f.y
            );
        });

        // 3. Sample height from heightmap
        // Assign the new position node to the material
        const sample = bilinearSample({ texNode: this._heightmapNode, uv: uv, filtersize: this._heightmapRes });
        material.positionNode = TSL.positionLocal.add(TSL.vec3(0, 0, sample));

        // 5. Analytical Normal Calculation
        const pos = material.positionNode;
        material.normalNode = TSL.cross(TSL.dFdx(pos), TSL.dFdy(pos)).normalize();

        // 6. Optional: Debug Visualization
        // We can create a node that outputs the normal as a color (0..1 range)
        // Normal range is -1..1, so we map it: normal * 0.5 + 0.5
        this._normalColorNode = material.normalNode.mul(0.5).add(0.5);
        this._originalColorNode = TSL.color(0x444444); // Store original color

        this._terrainMesh = new THREE.Mesh(planeGeo, material);
        this._terrainMesh.position.x = -1;
        this._terrainMesh.position.y = -1;
        this._terrainMesh.rotation.x = -Math.PI/2.0;

        this._materials.push(material);
        this._meshes.push(this._terrainMesh);
        this._scene.add(this._terrainMesh);

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
            light.position.x = Math.sin(time) * 2;
            light.position.y = Math.sin(time) * 2;
        });

        this._renderer.render(this._scene, this._camera);
    }

    _generateHeightmap(size = 256) {
        const data = new Float32Array(size * size);
        for (let i = 0; i < size * size; i++) {
            const x = i % size;
            const y = Math.floor(i / size);
            
            const nx = x / size - 0.5;
            const ny = y / size - 0.5;
            
            // Simple mountain shape with some noise for detail
            let h = Math.max(0, 1.0 - Math.sqrt(nx * nx + ny * ny) * 2.5);
            
            // Add some artificial detail that bilinear filtering will sample
            h += Math.sin(nx * 15) * 0.1 * h;
            h += Math.cos(ny * 12) * 0.05 * h;
            
            data[i] = h;
        }

        const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.FloatType);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    _sampleHeightMap(url) {
        const loader = new THREE.TextureLoader();
        
        // Load the texture asynchronously
        return new Promise((resolve, reject) => {
            loader.load(url, (texture) => {
                // Set configuration to match the generated heightmap as closely as possible
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                texture.colorSpace = THREE.NoColorSpace;
                resolve(texture);
            }, undefined, reject);
        });
    }

    updateHeightmap(texture) {
        // Update the texture node's value so all dependent TSL nodes update
        this._heightmapNode.value = texture;
        
        // Update the resolution uniform based on the new texture dimensions
        // assuming square texture for simplicity, or we could use a vec2 if needed
        const res = texture.image.width;
        this._heightmapRes.value = res;
        console.log(`Heightmap updated. New resolution: ${res}x${res}`);
    }

    updateSegments(segments) {
        if (this._currentSegments === segments) return;
        this._currentSegments = segments;

        const oldGeometry = this._terrainMesh.geometry;
        
        // Create new plane geometry with updated segments
        this._terrainMesh.geometry = new THREE.PlaneGeometry(10, 10, segments, segments);
        
        // Dispose of old geometry to prevent memory leaks
        // We do this after assigning the new one to ensure the mesh always has a geometry
        if (oldGeometry) {
            oldGeometry.dispose();
        }
        
        console.log(`Updated segments to: ${segments}`);
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

    toggleNormals() {
        console.log("Toggle Normals");
        this._materials.forEach((mat) => {
            // Check if we are currently showing normals
            if (mat.colorNode === this._normalColorNode) {
                // Revert to original flat color
                mat.colorNode = this._originalColorNode;
                mat.lights = true;
            } else {
                // Show normals
                mat.colorNode = this._normalColorNode;
                mat.lights = false;
            }
            mat.needsUpdate = true;
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
    });

    document.getElementById("normalsToggle").addEventListener('click', () => {
        app.toggleNormals();
    });
    
    document.getElementById("segmentsInput").addEventListener('change', (event) => {
        const value = parseInt(event.target.value);
        if (!isNaN(value)) {
            app.updateSegments(value);
        }
    });

    document.getElementById("heightmapInput").addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const texture = await app._sampleHeightMap(e.target.result);
                app.updateHeightmap(texture);
            };
            reader.readAsDataURL(file);
        }
    });

    window.addEventListener('resize', () => app.onWindowResize());
}

_Main();
