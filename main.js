import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class TerrainChunk {
    constructor() {
        this._mesh                  = null;
        this._segments              = 256;
        this._size                  = 10;
        this._material              = null;
        this._normalColorNode       = null;
        this._heightmapNode         = null;
        this._heightmapResUniform   = null;
        this._originalColorNode     = null;

        this._initialize();
    }

    async _initialize() {
        // Create geometry, apply material, and insert into scene
        const geometry  = new THREE.PlaneGeometry(this._size, this._size, this._segments, this._segments);
        
        // --- TSL Terrain Material Setup ---
        this._material = new THREE.MeshPhongNodeMaterial({
            color: 0x444444,
            shininess: 30,
            wireframe: false,
            flatShading: false,
            side: THREE.DoubleSide
        });

        // UV setup for heightmap sampling (map local space -5 to 5 to 0..1 UV)
        const uv = TSL.positionLocal.xy.div(this._size).add(0.5);
        
        // Setup heightmap texture and sample from heightmap
        const defaultRes = 256;
        this._heightmapNode         = TSL.texture(this._generateHeightmap(defaultRes));
        this._heightmapResUniform   = TSL.uniform(defaultRes);
        const sample = this._bilinearSample(this._heightmapNode, uv, this._heightmapResUniform);

        // Calculate analytic normal
        this._material.positionNode = TSL.positionLocal.add(TSL.vec3(0, 0, sample));
        const pos = this._material.positionNode;
        this._material.normalNode = TSL.cross(TSL.dFdx(pos), TSL.dFdy(pos)).normalize();

        // Debug Visualization
        // Create a node outputs the normal as a color (0..1 range)
        // Normal range is -1..1, so we map it: normal * 0.5 + 0.5
        this._normalColorNode       = this._material.normalNode.mul(0.5).add(0.5);
        this._originalColorNode     = TSL.color(0x444444); // Store original color

        // Create Mesh and set transform
        this._mesh = new THREE.Mesh(geometry, this._material);
        this._mesh.position.x = -1;
        this._mesh.position.y = -1;
        this._mesh.rotation.x = -Math.PI/2.0;
    }

    _generateHeightmap(size = 256) {
        const data = new Float32Array(size * size);

        const texture       = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.FloatType);
        texture.minFilter   = THREE.LinearFilter;
        texture.magFilter   = THREE.LinearFilter;
        texture.wrapS       = THREE.ClampToEdgeWrapping;
        texture.wrapT       = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    // 2. Manual Bilinear Filtering implementation in TSL
    // This ensures smooth transitions between discrete heightmap samples
    // and provides high-precision interpolation for vertex displacement.
    _bilinearSample(texNode, uv, filtersize) {
        return TSL.Fn(({ texNode, uv, filtersize }) => {
            const size = TSL.vec2(filtersize, filtersize);
            const texelSize = TSL.vec2(1.0).div(size);
            
            // Shift UV by half-texel to center the sampling grid
            const coord = uv.mul(size).sub(0.5);
            const i = TSL.floor(coord);
            const f = TSL.fract(coord);
            
            // Helper to sample a single texel.
            const sample = (offset) => texNode.sample(i.add(offset).add(0.5).mul(texelSize)).r;
            
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
        })({ texNode, uv, filtersize });
    }

    updateHeightmap(texture) {
        // Update the texture node's value so all dependent TSL nodes update
        this._heightmapNode.value = texture;

        // Update the resolution uniform based on the new texture dimensions
        // assuming square texture for simplicity, or we could use a vec2 if needed
        const res = texture.image.width;
        this._heightmapResUniform.value = res;

        console.log(`Heightmap updated. New resolution: ${res}x${res}`);
    }

    updateSegments(segments) {
        if (this._segments === segments) return;
        this._segments = segments;

        const oldGeometry = this._mesh.geometry;
        
        // Create new plane geometry with updated segments
        this._mesh.geometry = new THREE.PlaneGeometry(this._size, this._size, segments, segments);
        
        // Dispose of old geometry to prevent memory leaks
        // We do this after assigning the new one to ensure the mesh always has a geometry
        if (oldGeometry) {
            oldGeometry.dispose();
        }
        
        console.log(`Updated segments to: ${segments}`);
    }
}

class Application {
    constructor() {
        this._renderer      = null;
        this._scene         = null;
        this._camera        = null;
        this._terrain       = null;
        this._lights        = [];
        this._controls      = null;
        this._clock         = null;

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

        // Create terrain
        this._terrain       = new TerrainChunk();
        this._scene.add(this._terrain._mesh);

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

    toggleWireframe() {
        console.log("Toggle wireframe");
        this._terrain._material.wireframe = !this._terrain._material.wireframe;
    }

    toggleNormals() {
        console.log("Toggle Normals");
        
        // Check if we are currently showing normals
        if (this._terrain._material.colorNode === this._terrain._normalColorNode) {
            // Revert to original flat color
            this._terrain._material.colorNode = this._terrain._originalColorNode;
            this._terrain._material.lights = true;
        } else {
            // Show normals
            this._terrain._material.colorNode = this._terrain._normalColorNode;
            this._terrain._material.lights = false;
        }
        this._terrain._material.needsUpdate = true;
    }

    sampleHeightMap(url) {
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
        if (!isNaN(value) && value > 0) {
            app._terrain.updateSegments(value);
        }
    });

    document.getElementById("heightmapInput").addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const texture = await app.sampleHeightMap(e.target.result);
                app._terrain.updateHeightmap(texture);
            };
            reader.readAsDataURL(file);
        }
    });

    window.addEventListener('resize', () => app.onWindowResize());
}

_Main();