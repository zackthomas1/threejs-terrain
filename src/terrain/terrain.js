import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { NoiseGenerator } from '../noise';
import { TerrainAtmosphere } from './terrain-atmosphere';
import { OrbitController, FPSController } from '../controller';
import * as UTIL from '../util';
import { QuadTree } from '../quadtree';

class HeightMap {
    _heightmapNode      = null;
    _resolutionUniform  = null;

    constructor(params) {
        if (!params || !Number.isFinite(params.chunkSize) || params.chunkSize < 1) {
            throw new Error('HeightMap.constructor: params.chunkSize must be a positive number.');
        }
        if (!Number.isFinite(params.chunkSegments) || params.chunkSegments < 1) {
            throw new Error('HeightMap.constructor: params.chunkSegments must be a positive number.');
        }
        if (!params.material) {
            throw new Error('HeightMap.constructor: missing params.material.');
        }
        
        // UV setup for heightmap sampling: map local space [-(chunkSize/2), (chunkSize/2)] to UV [0,1])
        const uv = TSL.positionLocal.xy.div(params.chunkSize).add(0.5);
        
        // TSL Terrain Material Node configuration
        // Setup heightmap texture and sample from heightmap
        this._heightmapNode = TSL.texture(params.textureMap);
        // Resolution uniform matches texture size (segments + 3 with a 1-texel padding border)
        const textureResolution = params.textureMap.image?.width || (params.chunkSegments + 3);
        this._resolutionUniform = TSL.uniform(textureResolution);

        // Remap chunk UV into the texture interior [1, resolution-2] so border texels are used only for gradients
        const uvSamplingScale = (textureResolution - 3) / (textureResolution - 1);
        const uvSamplingOffset = 1.0 / (textureResolution - 1);
        const uvSample = uv.mul(uvSamplingScale).add(uvSamplingOffset);

        const sample = this._bilinearSample(this._heightmapNode, uvSample, this._resolutionUniform);

        // Displace terrain vertices using sampled height
        params.material.positionNode = TSL.positionLocal.add(TSL.vec3(0, 0, sample));

        // Compute normal from local-space height gradient for stable smooth shading
        const uvTexelStep = TSL.float(1.0).div(this._resolutionUniform.sub(1.0));
        const uvOffsetX = TSL.vec2(uvTexelStep, 0.0);
        const uvOffsetY = TSL.vec2(0.0, uvTexelStep);

        const hL = this._bilinearSample(this._heightmapNode, uvSample.sub(uvOffsetX), this._resolutionUniform);
        const hR = this._bilinearSample(this._heightmapNode, uvSample.add(uvOffsetX), this._resolutionUniform);
        const hD = this._bilinearSample(this._heightmapNode, uvSample.sub(uvOffsetY), this._resolutionUniform);
        const hU = this._bilinearSample(this._heightmapNode, uvSample.add(uvOffsetY), this._resolutionUniform);

        const localGridStep = (params.chunkSize / params.chunkSegments) * 2.0;
        const tangentX = TSL.vec3(localGridStep, 0.0, hR.sub(hL));
        const tangentY = TSL.vec3(0.0, localGridStep, hU.sub(hD));
        params.material.normalNode = TSL.cross(tangentX, tangentY).normalize();
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
    _heightMapTexture       = null;
    _materialNodes          = {};

    constructor(params) {
        // Create geometry, apply material, and insert into scene
        const geometry  = new THREE.PlaneGeometry(
            params.chunkSize, params.chunkSize, 
            params.chunkSegments, params.chunkSegments
        );
        
        // --- TSL Terrain Material Setup ---
        this._material = new THREE.MeshLambertNodeMaterial({
            color: '#444444',
            wireframe: false,
            flatShading: false,
            side: THREE.FrontSide
        });
        this._materialNodes["diffuseColor"] = TSL.color( this._material.color); // Store original color

        this._heightMap = new HeightMap({
            chunkSize: params.chunkSize,
            chunkSegments: params.chunkSegments,
            material: this._material,
            textureMap: params.heightMapTexture,
        });
        this._heightMapTexture = params.heightMapTexture;

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

        if (texture === null) {
            throw new Error('TerrainChunk.setTexture: texture is required');
        }

        const oldTexture = this._heightMapTexture;
        if (oldTexture === texture) {
            return;
        }

        this._heightMap.setTexture(texture);
        this._heightMapTexture = texture;
        if (oldTexture) {
            oldTexture.dispose();
        }
    }

    dispose() {
        if (this._mesh?.parent) {
            this._mesh.parent.remove(this._mesh);
        }

        if (this._mesh?.geometry) {
            this._mesh.geometry.dispose();
        }

        if (this._heightMapTexture) {
            this._heightMapTexture.dispose();
            this._heightMapTexture = null;
        }

        if (this._material) {
            this._material.dispose();
        }

        this._heightMap = null;
        this._materialNodes = {};
        this._mesh = null;
        this._material = null;
    }
}

class TerrainChunkManager {
    _group      = null;
    _chunks     = {};
    _chunkSize  = 128;
    _chunkSegments = 64;
    _noiseGenerator = null;
    _terrainParams = {};
    _noiseParams = {};
    _FPSPosition = null

    constructor(params) {
        this._FPSPosition = params.terrainHost.getFPSControllerPosition;
        this._initializeNoise(params);
        this._initializeTerrain(params);
    }

    _initializeNoise(params) {
        // setup noise GUI fields
        params.guiParams.noise = {
            noiseType: 'simplex',
            scale: 64.0,
            octaves: 6,
            persistence: 0.5,
            lacunarity: 2.0,
            exponentiation: 3.9,
            height: 16.0,
            seed: 1
        }
        this._noiseParams = params.guiParams.noise;
        
        const noiseRollup = params.gui.addFolder("Noise"); 
        noiseRollup.add(params.guiParams.noise, "noiseType", ["simplex", "perlin"]).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "scale", 1.0, 128.0).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "octaves", 1, 8, 1).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "persistence", 0.01, 1.0).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "lacunarity", 0.01, 4.0).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "exponentiation", 0.1, 10.0).onFinishChange(
            () => { this.onNoiseChange(); });
        noiseRollup.add(params.guiParams.noise, "height", 0, 64).onFinishChange(
            () => { this.onNoiseChange(); });

        this._noiseGenerator = new NoiseGenerator(this._noiseParams);
    }

    _initializeTerrain (params) {
        // Setup terrrain GUI parameters
        params.guiParams.terrain = {
            wireframe : false,
            normals : false,
        }
        this._terrainParams = params.guiParams.terrain;

        // Create GUI Terrain rollup
        const terrainRollup = params.gui.addFolder("Terrain");
        terrainRollup.add(params.guiParams.terrain, 'wireframe')
            .onChange(() => { this.onWireframe(); })
            .name('Display wireframe');
        terrainRollup.add(params.guiParams.terrain, 'normals')
            .onChange(() => { this.onNormals(); })
            .name('Display normals');

        // create mesh group and add to scene
        this._group = new THREE.Group();
        this._group.rotation.x = -Math.PI / 2;
        params.scene.add(this._group);

        // create chunks
        // for (let x = -1; x <= 1; x++) {
        //     for (let y = -1; y <= 1; y++) {
        //         this._addChunk(x, y);
        //     }
        // }
        // this._addChunk(0, 0);
    }

    _generateHeightMapTexture(centerX, centerY, chunkSize = this._chunkSize) {
        // PlaneGeometry with N segments has (N+1) vertices per axis.
        // Add a 1-texel border on each side so edge normals can sample central differences across chunk seams.
        const resolution = this._chunkSegments + 3;
        const sampleStep = chunkSize / this._chunkSegments;
        const data = new Float32Array(resolution * resolution);
        
        // DataTexture data is row-major: data[row * width + col] = data[y * width + x]
        for (let row = 0; row < resolution; row++) {
            // Row 0 starts one sample outside the chunk, then covers all vertex samples, then one sample outside.
            const worldY = centerY - (chunkSize / 2) - sampleStep + (row * sampleStep);
            for (let col = 0; col < resolution; col++) {
                const worldX = centerX - (chunkSize / 2) - sampleStep + (col * sampleStep);
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

    _quadTreeKey(centerX, centerY, size) {
        // Round to integer grid to normalize key precision and prevent floating-point drift
        const x = Math.round(centerX);
        const y = Math.round(centerY);
        return x + "." + y + "[" + size + "]";
    }

    _keyCoord(keyStr) {
        const parts = keyStr.split(".");
        return {
            x: parseInt(parts[0], 10),
            y: parseInt(parts[1], 10)
        };
    }

    _addChunk(x, y) {
        const centerX = x * this._chunkSize;
        const centerY = y * this._chunkSize;
        const texture = this._generateHeightMapTexture(centerX, centerY, this._chunkSize);

        // create chunk
        const terrainChunk = new TerrainChunk({
            position: new THREE.Vector2(centerX, centerY),
            group: this._group,
            scale: 1,
            chunkSize: this._chunkSize,
            chunkSegments: this._chunkSegments,
            heightMapTexture: texture,
        });

        this._chunks[this._key(x,y)] = {
            position: [x,y],
            center: [centerX, centerY],
            size: this._chunkSize,
            chunk: terrainChunk,
        };
    }

    _cellIndex(pos) {
        const px = pos.x;
        const py = Number.isFinite(pos.z) ? pos.z : pos.y;
        if (!Number.isFinite(px) || !Number.isFinite(py)) {
            throw new Error('TerrainChunkManager._cellIndex: invalid position parameter');
        }

        const xp = px + this._chunkSize * 0.5;
        const yp = py + this._chunkSize * 0.5;
        const x = Math.floor(xp / this._chunkSize);
        const y = -Math.floor(yp / this._chunkSize);
        return[x,y];
    }

    update(_deltaTime) {
        const updateQuadTree = () => {
            const QUADTREE_SIZE = 256;
            const quadTree = new QuadTree({
                min: new THREE.Vector2(-QUADTREE_SIZE, -QUADTREE_SIZE),
                max: new THREE.Vector2(QUADTREE_SIZE, QUADTREE_SIZE),
                nodeSize: this._chunkSize,
            });
            quadTree.insert(this._FPSPosition());

            const children = quadTree.getChildren();

            let newTerrainChunks = {};
            const center = new THREE.Vector2();
            const dimensions = new THREE.Vector2();
            for (const c of children) {
                c.bounds.getCenter(center);
                c.bounds.getSize(dimensions);
                const chunkCenterX = center.x;
                const chunkCenterY = -center.y;
                const chunkWidth = dimensions.x;
            
                const child = { 
                    center: [chunkCenterX, chunkCenterY],
                    bounds: c.bounds,
                    dimensions: [dimensions.x, dimensions.y],
                };

                const k = this._quadTreeKey(chunkCenterX, chunkCenterY, chunkWidth);
                newTerrainChunks[k] = child;
            }

            const intersection = UTIL.DictIntersection(this._chunks, newTerrainChunks);
            const difference = UTIL.DictDifference(newTerrainChunks, this._chunks);
            const recycle = UTIL.DictDifference(this._chunks, newTerrainChunks);

            newTerrainChunks = intersection;

            for (const k in recycle) {
                recycle[k].chunk.dispose();
                delete this._chunks[k];
            }

            for (const k in difference) {
                // console.log(Object.keys(newTerrainChunks).length);
                const [chunkCenterX, chunkCenterY] = difference[k].center;
                const chunkWidth = difference[k].dimensions[0];
                const texture = this._generateHeightMapTexture(chunkCenterX, chunkCenterY, chunkWidth);

                const terrainChunk = new TerrainChunk({
                    position: new THREE.Vector2(chunkCenterX, chunkCenterY),
                    group: this._group,
                    scale: 1,
                    chunkSize: chunkWidth,
                    chunkSegments: this._chunkSegments,
                    heightMapTexture: texture,
                });

                newTerrainChunks[k] = {
                    center: [chunkCenterX, chunkCenterY],
                    size: chunkWidth,
                    chunk: terrainChunk,
                };
            }

            this._chunks = newTerrainChunks;
        };

        const updateFixedGrid = () => {
            const FIXED_GRID_SIZE = 2;
            const [xc, yc] = this._cellIndex(this._FPSPosition());
            
            const keys = {};
            for (let x = -FIXED_GRID_SIZE; x <= FIXED_GRID_SIZE; x++) {
                for (let y= -FIXED_GRID_SIZE; y <= FIXED_GRID_SIZE; y++) {
                    const key = this._key(x + xc, y + yc);
                    keys[key] = { 
                        position : [x + xc, y + yc]
                    };
                }
            }

            const difference = UTIL.DictDifference(keys, this._chunks);
            const recycle = UTIL.DictDifference(this._chunks, keys);
            for (const k in recycle) {
                recycle[k].chunk.dispose();
                delete this._chunks[k];
            }

            for (const k in difference) {
                if (k in this._chunks) {
                    continue;
                }
                const [xp, yp] = difference[k].position;
                // const offset = new THREE.Vector2(xp * this._chunkSize, yp * this._chunkSize);
                this._addChunk(xp,yp);
            }
        };

        const updatedSingle = () => {
            const [xc, yc] = this._cellIndex(this._FPSPosition());
            const key = this._key(xc, yc);
            if (key in this._chunks) { return; }

            console.log("ADD CHUNK" + xc + yc);
            this._addChunk(xc, yc);
        };

        updatedSingle();
    }

    dispose() {
        for (const k in this._chunks) {
            const chunk = this._chunks[k].chunk;
            chunk.dispose();
        }

        this._chunks = {};

        if (this._group?.parent) {
            this._group.parent.remove(this._group);
        }

        this._group = null;
        this._noiseGenerator = null;
    }

    // Event handlers
    onWireframe() {
        for (const k in this._chunks) {
            const chunk = this._chunks[k].chunk;
            chunk._material.wireframe = this._terrainParams.wireframe;
        }
    }

    onNormals() {
        for (const k in this._chunks) {
            const chunk = this._chunks[k].chunk;
            
            // Check if we are currently showing normals
            if (!this._terrainParams.normals) {
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
        this._noiseGenerator.setParams(this._noiseParams);
        for (const k in this._chunks) {
            const chunkData = this._chunks[k];
            const chunk = chunkData.chunk;
            const center = chunkData.center || [chunkData.position[0] * this._chunkSize, chunkData.position[1] * this._chunkSize];
            const size = chunkData.size || this._chunkSize;
            const texture = this._generateHeightMapTexture(center[0], center[1], size);
            chunk.setTexture(texture);
        }
    }
}

export class TerrainScene {
    _entities = {};
    _scene = null;
    _activeController = null;
    _sceneParams = null;

    constructor(params) {
        this._scene     = new THREE.Scene();

        // Set up scene GUI
        params.guiParams.scene = {
            activeController : "Orbit",
        }
        this._sceneParams = params.guiParams.scene;

        const sceneRollup = params.gui.addFolder('Scene');
        sceneRollup.add(this._sceneParams, "activeController", ["Orbit", "FPS"])
            .onChange(() => { this.onActiveControllerChange(); })
            .name("active controller");
    
        // Create Scene entities
        this._entities['atmosphere'] = new TerrainAtmosphere({
            scene : this._scene,
            gui : params.gui,
            guiParams : params.guiParams,
            atmosphereHost : {
                setFog: (fogOrNull) => {
                    this._scene.fog = fogOrNull;
                },
            }
        });

        this._entities['terrain'] = new TerrainChunkManager({
            scene : this._scene,
            gui : params.gui,
            guiParams : params.guiParams,
            terrainHost : {
                getFPSControllerPosition: () => {
                    return this._entities['fps-controller'].getPosition();
                }
            }
        });

        this._entities['orbit-controller'] = new OrbitController({
            scene : this._scene,
            gui : params.gui,
        });

        this._entities['fps-controller'] = new FPSController({
            scene : this._scene,
            gui : params.gui
        });

        this.onActiveControllerChange();
    }

    update(deltaTime) {
        // update entities
        for (const k in this._entities) {
            const entity = this._entities[k];
            entity.update(deltaTime);
        }
    }

    render(renderer) {
        // render frame
        renderer.render(this._scene, this._activeController.getCamera());
    }

    dispose() {
        for (const k in this._entities) {
            const entity = this._entities[k];
            if (typeof entity?.dispose === 'function') {
                entity.dispose();
            }
        }

        if (this._controls) {
            this._controls.dispose();
            this._controls = null;
        }

        this._entities = {};
        this._scene = null;
        this._camera = null;
    }

    // Event call back functions
    onActiveControllerChange() {
        if (this._activeController !== null) {
            this._activeController.setActive(false);
        }
        switch(this._sceneParams.activeController) {
            case "Orbit":
                this._activeController = this._entities['orbit-controller'];
                break;
            case "FPS":
                this._activeController = this._entities['fps-controller'];
                break;
            default:
                this._activeController = this._entities['orbit-controller'];
                break;
        }
        this._activeController.setActive(true);
    }

    onWindowResize() {
        // Update camera
        this._entities['orbit-controller'].onWindowResize();
        this._entities['fps-controller'].onWindowResize();
    }
}
