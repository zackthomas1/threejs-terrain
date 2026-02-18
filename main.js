import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { NoiseGenerator } from './noise';

class HeightMap {
    _heightmapNode      = null;
    _resolutionUniform  = null;

    constructor(params) {
        if (!params || !Number.isFinite(params.chunkSize) || params.chunkSize < 1) {
            throw new Error('HeightMap._initialize: params.chunkSize must be a positive number.');
        }
        if (!Number.isFinite(params.chunkSegments) || params.chunkSegments < 1) {
            throw new Error('HeightMap._initialize: params.chunkSegments must be a positive number.');
        }
        if (!params.material) {
            throw new Error('HeightMap._initialize: missing params.material.');
        }
        
        // UV setup for heightmap sampling: map local space [-(chunkSize/2), (chunkSize/2)] to UV [0,1])
        const uv = TSL.positionLocal.xy.div(params.chunkSize).add(0.5);
        
        // TSL Terrain Material Node configuration
        // Setup heightmap texture and sample from heightmap
        this._heightmapNode = TSL.texture(params.textureMap);
        // Resolution uniform matches texture size (segments + 1)
        const textureResolution = params.textureMap.image?.width || (params.chunkSegments + 1);
        this._resolutionUniform = TSL.uniform(textureResolution);
        const sample = this._bilinearSample(this._heightmapNode, uv, this._resolutionUniform);

        // Calculate analytic normal
        params.material.positionNode = TSL.positionLocal.add(TSL.vec3(0, 0, sample));
        const pos = params.material.positionNode;
        params.material.normalNode = TSL.cross(TSL.dFdx(pos), TSL.dFdy(pos)).normalize();
    }

    // Manual Bilinear Filtering implementation in TSL: 
    // ensures smooth transitions between discrete heightmap samples
    _bilinearSample(texNode, uv, filtersize) {
        return TSL.Fn(({ texNode, uv, filtersize }) => {
            const size = TSL.vec2(filtersize, filtersize);
            const texelSize = TSL.vec2(1.0).div(size);
            
            // Map UV [0,1] to texel coordinates [0, resolution-1]
            // For vertex-aligned sampling: UV=0 → texel 0, UV=1 → texel (resolution-1)
            const coord = uv.mul(size.sub(1.0));
            const i = TSL.floor(coord);
            const f = TSL.fract(coord);
            
            // Clamp integer index to valid range
            const maxIndex = size.sub(1.0);
            const i_clamped = TSL.clamp(i, TSL.vec2(0.0), maxIndex);
            
            // Calculate neighbor indices with clamping
            const i_next = TSL.min(i_clamped.add(1.0), maxIndex);
            
            // Sample 4 neighboring texels at texel centers
            const a = texNode.sample(i_clamped.mul(texelSize).add(texelSize.mul(0.5))).r;
            const b = texNode.sample(TSL.vec2(i_next.x, i_clamped.y).mul(texelSize).add(texelSize.mul(0.5))).r;
            const c = texNode.sample(TSL.vec2(i_clamped.x, i_next.y).mul(texelSize).add(texelSize.mul(0.5))).r;
            const d = texNode.sample(i_next.mul(texelSize).add(texelSize.mul(0.5))).r;
            
            // Perform bilinear interpolation
            return TSL.mix(
                TSL.mix(a, b, f.x),
                TSL.mix(c, d, f.x),
                f.y
            );
        })({ texNode, uv, filtersize });
    }


    setTexture(texture) {
        if (texture === null) {
            throw new Error('HeightMap.setTexture: texture is required');
        }

        // Update the texture node's value so all dependent TSL nodes update
        this._heightmapNode.value = texture;

        // Update the resolution uniform based on the new texture dimensions 
        // Note: texture resolution is (segments+1), but uniform should be segments for correct filtering
        const texRes = texture.image?.width;
        if (Number.isFinite(texRes)) {
            this._resolutionUniform.value = texRes;
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
            chunkSegments: params.chunkSegments,
            material: this._material,
            textureMap: params.heightMapTexture,
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

    setTexture(texture) {
        if (!this._heightMap) {
            throw new Error('TerrainChunk.setTexture: height map is not initialized');
        }

        this._heightMap.setTexture(texture);
    }
}

class TerrainChunkManager {
    _group      = null;
    _chunks     = {};
    _chunkSize  = 64;
    _chunkSegements = 256;
    _noiseGenerator = null;
    _noiseParams = {};

    constructor(params) {
        this._inititializeNoise(params);
        this._initializeTerrain(params);
    }

    _inititializeNoise(params) {

        params.guiParams.noise = {
            noiseType: 'simplex',
            scale: 256.0,
            octaves: 10,
            persistence: 0.5,
            lacunarity: 2.0,
            exponentiation: 3.9,
            height: 64,
            seed: 1
        }

        this._noiseParams = params.guiParams.noise;
        
        const noiseRollup = params.gui.addFolder("Noise"); 
        noiseRollup.add(params.guiParams.noise, "noiseType", ["simplex", "perlin"]).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "scale", 64.0, 512.0).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "octaves", 1, 20, 1).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "persistence", 0.01, 1.0).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "lacunarity", 0.01, 4.0).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "exponentiation", 0.1, 10.0).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "height", 0, 128).onFinishChange(
            () => { this.onNoiseChange(); });

        this._noiseGenerator = new NoiseGenerator(this._noiseParams);
    }

    _initializeTerrain (params) {
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

    _generateHeightMapTexture(x,y) {
        // PlaneGeometry with N segments has (N+1) vertices per axis
        // Texture resolution must match vertex count for proper edge continuity
        const resolution = this._chunkSegements + 1;
        const data = new Float32Array(resolution * resolution);
        
        // DataTexture data is row-major: data[row * width + col] = data[y * width + x]
        for (let row = 0; row < resolution; row++) {
            // Calculate world-space Y position (row index maps to Y axis)
            const worldY = (y * this._chunkSize) - (this._chunkSize / 2) + (row * this._chunkSize / this._chunkSegements);
            for (let col = 0; col < resolution; col++) {
                // Calculate world-space X position (column index maps to X axis)
                const worldX = (x * this._chunkSize) - (this._chunkSize / 2) + (col * this._chunkSize / this._chunkSegements);
                data[(row * resolution) + col] = this._noiseGenerator.get2D(worldX, worldY);
            }
        }

        const texture       = new THREE.DataTexture(data,
            resolution, resolution, 
            THREE.RedFormat, THREE.FloatType);
        texture.minFilter   = THREE.LinearFilter;
        texture.magFilter   = THREE.LinearFilter;
        texture.wrapS       = THREE.ClampToEdgeWrapping;
        texture.wrapT       = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        
        return texture;
    }

    _key (x, y) {
        return x + "." + y;
    }

    _keyCoord(keyStr) {
        const parts = keyStr.split(".");
        return {
            x: parseInt(parts[0], 10),
            y: parseInt(parts[1], 10)
        };
    }

    _addChunk(x, y) {

        const texture = this._generateHeightMapTexture(x,y);

        // create chunk
        const terrainChunk = new TerrainChunk({
            position: new THREE.Vector2(x * this._chunkSize, y * this._chunkSize),
            group: this._group,
            scale: 1,
            chunkSize: this._chunkSize,
            chunkSegments: this._chunkSegements,
            heightMapTexture: texture,
        });

        this._chunks[this._key(x,y)] = terrainChunk;
    }

    // Event handlers
    onWireframe() {
        console.log("Toggle wireframe");
        for (const k in this._chunks) {
            const chunk = this._chunks[k];
            chunk._material.wireframe = !chunk._material.wireframe;
        }
    }

    onNormals() {
        console.log("Toggle Normals");
        
        for (const k in this._chunks) {
            const chunk = this._chunks[k];
            
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

    onNoiseChange() {
        console.log("TerrainChunkManager.onNoiseChange")
        this._noiseGenerator.setParams(this._noiseParams);
        for (const k in this._chunks) {
            const coords = this._keyCoord(k);
            const texture = this._generateHeightMapTexture(coords.x, coords.y);
            const chunk = this._chunks[k];
            chunk.setTexture(texture);
        }
    }

    update(deltaTime) {
        // TODO: Implement update function 
        return
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
        this._renderer.setAnimationLoop(() => this._update());
        document.body.appendChild(this._renderer.domElement); // add renderer element to HTML document

        // set up scene and camera
        this._scene     = new THREE.Scene();
        this._camera    = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        // set up orbit controls
        this._controls = new OrbitControls(this._camera, this._renderer.domElement);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.05;

        // Position camera
        this._camera.position.z = 10;
        this._camera.position.y = 30;

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

    _update() {
        // update controls
        this._controls.update();

        const deltaTime = this._clock.getDelta();
        // update entities
        for (const k in this._entites) {
            const entity = this._entites[k];
            entity.update(deltaTime);
        }

        this._lights

        // render frame
        this._renderer.render(this._scene, this._camera);
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