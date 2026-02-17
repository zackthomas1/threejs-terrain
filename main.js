import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';

class NoiseMap {

}

class HeightMap {
    _heightmapNode          = null;
    _heightmapResUniform    = null;

    constructor(params) {
        if (!params || !Number.isFinite(params.chunkSize) || params.chunkSize < 1) {
            throw new Error('HeightMap._initialize: params.chunkSize must be a positive number.');
        }
        if (!params.material) {
            throw new Error('HeightMap._initialize: missing params.material.');
        }
        
        // UV setup for heightmap sampling (map local space -5 to 5 to 0..1 UV)
        const uv = TSL.positionLocal.xy.div(params.chunkSize).add(0.5);
        
        // create default height map texture
        const defaultRes = 256;
        const texture    = new THREE.DataTexture(
            new Float32Array(defaultRes * defaultRes),
            defaultRes, defaultRes, 
            THREE.RedFormat, THREE.FloatType
        );
        texture.minFilter   = THREE.LinearFilter;
        texture.magFilter   = THREE.LinearFilter;
        texture.wrapS       = THREE.ClampToEdgeWrapping;
        texture.wrapT       = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;

        // Setup heightmap texture and sample from heightmap
        this._heightmapNode         = TSL.texture(texture);
        this._heightmapResUniform   = TSL.uniform(defaultRes);
        const sample = this._bilinearSample(this._heightmapNode, uv, this._heightmapResUniform);

        // Calculate analytic normal
        params.material.positionNode = TSL.positionLocal.add(TSL.vec3(0, 0, sample));
        const pos = params.material.positionNode;
        params.material.normalNode = TSL.cross(TSL.dFdx(pos), TSL.dFdy(pos)).normalize();
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

    setTexture(texture) {
        if (texture == null) {
            throw new Error('HeightMap.setTexture: texture is required');
        }

        // Update the texture node's value so all dependent TSL nodes update
        this._heightmapNode.value = texture;

        // Update the resolution uniform based on the new texture dimensions 
        // assumes square texture for simplicity
        const res = texture.image?.width;
        if (Number.isFinite(res)) {
            this._heightmapResUniform.value = res;
        }
    }
}

class TerrainChunk {
    _mesh                   = null;
    _material               = null;
    _heightMap              = null;
    _materialNodes          = {};

    constructor(params) {
        // Create geometry, apply material, and insert into scene
        const geometry  = new THREE.PlaneGeometry(
            params.chunkSize, params.chunkSize, 
            params.chunkSegments, params.chunkSegments
        );
        
        // --- TSL Terrain Material Setup ---
        this._material = new THREE.MeshPhongNodeMaterial({
            color: 0x444444,
            shininess: 30,
            wireframe: false,
            flatShading: false,
            side: THREE.DoubleSide
        });
        this._materialNodes["diffuseColor"] = TSL.color( this._material.color); // Store original color

        this._heightMap = new HeightMap({
            chunkSize: params.chunkSize,
            material: this._material
        });

        // Debug Visualization
        // Create a node to visualize the normal as a color (0..1 range)
        this._materialNodes["normalColor"] = this._material.normalNode.mul(0.5).add(0.5);

        // Create Mesh and set transform
        this._mesh = new THREE.Mesh(geometry, this._material);
        this._mesh.position.x = params.position.x;
        this._mesh.position.y = params.position.y;

        params.group.add(this._mesh);
    }

    RebuildChunk(params) {
        // Dispose of old geometry to prevent memory leaks
        // We do this after assigning the new one to ensure the mesh always has a geometry
        const oldGeometry = this._mesh.geometry;
        if (oldGeometry) {
            oldGeometry.dispose();
        }

        // Create new plane geometry with updated segments
        this._mesh.geometry = new THREE.PlaneGeometry(
            params.chunkSize, params.chunkSize,
            params.chunkSegments, params.chunkSegments
        );
    }
}

class TerrainChunkManager {
    _group      = null;
    _chunks     = {};
    _chunkSize  = 64;
    _chunkSegements = 32;

    constructor(params) {
        // Initialize GUI parameters
        params.guiParams.terrain = {
            wireframe : false,
            normals : false,
        }

        // Create GUI Terrain rollup
        const terrainRollup = params.gui.addFolder("Terrain");
        terrainRollup.add({ wireframe: false }, 'wireframe')
            .onChange(() => { this.onWireframe(); })
            .name('Wireframe');
        terrainRollup.add({ normals: false }, 'normals')
            .onChange(() => { this.onNormals(); })
            .name('Show Normals');

        // create mesh group and add to scene
        this._group = new THREE.Group();
        this._group.rotation.x = -Math.PI / 2;
        params.scene.add(this._group);

        // create chunks
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                this._addChunk(x, y);
            }
        }
    }

    _addChunk(x, y) {
        // create chunk
        const terrainChunk = new TerrainChunk({
            position: new THREE.Vector2(x * this._chunkSize, y * this._chunkSize),
            group: this._group,
            scale: 1,
            chunkSize: this._chunkSize,
            chunkSegments: this._chunkSegements,
        });

        const key = x + "." + y;
        this._chunks[key] = terrainChunk;
    }

    onWireframe() {
        console.log("Toggle wireframe");
        for (let k in this._chunks) {
            let chunk = this._chunks[k];
            chunk._material.wireframe = !chunk._material.wireframe;
        }
    }

    onNormals() {
        console.log("Toggle Normals");
        
        for (let k in this._chunks) {
            let chunk = this._chunks[k];
            
            // Check if we are currently showing normals
            if (chunk._material.colorNode === chunk._materialNodes["normalColor"]) {
                // show diffuse
                chunk._material.colorNode   = chunk._materialNodes["diffuseColor"];
                chunk._material.lights      = true;
            } else {
                // Show normals
                chunk._material.colorNode   = chunk._materialNodes["normalColor"];
                chunk._material.lights      = false;
            }
            chunk._material.needsUpdate = true;
        }
    }

    update(deltaTime) {

    }

}

class Application {
    _gui        = null;
    _guiParams  = {};

    _entites    = {};

    _renderer   = null;
    _scene      = null;
    _camera     = null;
    _lights     = [];
    _controls   = null;
    _clock      = null;

    constructor() {
        // initialize gui
        this._guiParams = {
            general : {},
        }; 
        this._gui = new GUI();

        const generalRollup = this._gui.addFolder('General');
        generalRollup.close();

        // set up clock
        this._clock     = new THREE.Clock();

        // set up renderer
        this._renderer  = new THREE.WebGPURenderer({ antialias: true });
        this._renderer.setSize(window.innerWidth, window.innerHeight);
        this._renderer.setAnimationLoop(() => this._animate());
        document.body.appendChild(this._renderer.domElement); // add renderer element to HTML document

        // set up scene and camera
        this._scene     = new THREE.Scene();
        this._camera    = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        // set up orbit controls
        this._controls = new OrbitControls(this._camera, this._renderer.domElement);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.05;

        // Position camera
        this._camera.position.z = 5;
        this._camera.position.y = 1;

        // create a light 
        const light = new THREE.DirectionalLight(0xFFFFFF, 3);  // color, intensity
        light.position.set(-1,2,4);
        this._lights.push(light);
        this._scene.add(light);

        // set scene background
        this._scene.background = new THREE.Color(0x667789);
    
        // Create terrain
        this._entites['terrain'] = new TerrainChunkManager({
            scene : this._scene,
            gui : this._gui,
            guiParams : this._guiParams
        });
    }

    _animate() {
        // update controls
        this._controls.update();

        const time = this._clock.getElapsedTime();

        // update entities

        this._renderer.render(this._scene, this._camera);
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
    window.addEventListener('resize', () => app.onWindowResize());
}

_Main();