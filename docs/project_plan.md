## Phase 1. Basic three.js scene and Mesh Generation

- [x] **Basic Scene**: Create a basic three.js scene. Scene includes lights, camera, and plane mesh with phong material applied. Initialize the scene using WebGPURenderer.

- [x] **TSL Vertex Displacement**: Modify the plane mesh geometry using vertex shader to set the height of each vertex based on its distance from the origin. Define the terrain's positionNode using TSL. use MeshStandardNodeMaterial to allow procedural logic to drive vertex offsets directly in the shader.
[TSL: A Better Way to Write Shaders in Three.js](https://threejsroadmap.com/blog/tsl-a-better-way-to-write-shaders-in-threejs)

- [x] **Analytical Normal Calculation**: Procedural displacement requires the manual calculation of surface normals. Implement a TSL function that calculates the analytical derivatives of your noise function. This ensures that lighting and shadows react correctly to the peaks and valleys

- [x] **Heightmap Sampling**: Implement heightmap sampling with bilinear filtering in the shader to prevent blocky artifacts (stair-stepping) when the camera is close to the surface.

## Phase 2. Applying perlin noise and fractional brownian motion 
Transition from simple noise to complex, multi-scale terrain.

- [x] **Implement Terrain Chunking**: Create TerrainChunk that encapulates. New Terrain Chunks instantiated to generate new terrain as camera moves through scene

- [ ] **Ridged Multifractal Synthesis**: Move beyond basic Perlin noise to Ridged Multifractal algorithms. By taking the absolute value of noise and inverting it, you can create sharp mountain ridges and smooth valleys that better mimic natural erosion.
[Prime gradient noise](https://iccvm.org/2021/papers/S5-3-CVMJ.pdf)

## Phase 3. Quadtree and Level of Details
Efficiently rendering infinite worlds requires a dynamic Level of Detail (LOD) system.

- [ ] **Adaptive Quadtree**: Divide the terrain into a quadtree hierarchy. Nodes closer to the camera should recursively subdivide to provide higher resolution meshes.
[Efficient Debris-flow Simulation for Steep Terrain Erosion](https://www.cs.purdue.edu/cgvlab/www/resources/papers/Arymaan-ToG-2024-efficient.pdf)
[The Coding Train](https://www.youtube.com/watch?v=OJxEcs0w_kE)

- [ ] **Edge Stitching (Skirts)**:To prevent visible cracks (T-junctions) between chunks of different detail levels, implement skirts—strips of triangles that extend vertically downward from the edges of each chunk.

## Phase 4. Atmosphere and Water surface
Integrate physically-based atmospheric and water effects

- [ ] **Frustum Culling**: Only rendering objects that are within the camera's field of view.

- [ ] **Web Workers**: Offload the fBM (Fractional Brownian Motion) calculations to Web Workers. Use Transferable Objects (specifically ArrayBuffer) to pass geometry data back to the main thread without the performance cost of memory cloning.

- [ ] **Floating Origin System**: To prevent "jitter" caused by floating-point precision loss at great distances, implement a floating origin (or "origin shifting"). Periodically reset the camera and all active terrain chunks to the world center (0,0,0) as the player explores.

## Phase 5. Atmosphere and Water surface
Integrate physically-based atmospheric and water effects

- [ ] **Atmospheric Scattering**: Implement a TSL-based sky shader using Rayleigh (for blue sky) and Mie (for hazy horizons) scattering models.

- [ ] **Fresnel Water Surface**:Create a dynamic water plane using scrolling normal maps. Implement Fresnel reflections, making the water more reflective at grazing angles and more transparent when looking straight down

## Phase 6. Biomes
Populate the world with varied biomes and high-density vegetation without overloading the CPU.

- [ ] **Distinct geographical**: region with specific climate. Based on height and temperature parameter in terrain. Biome system based on Whittaker classified biomes using two abiotic factors: precipitation and temperature. [Biome wiki](https://en.wikipedia.org/wiki/Biome)

- [ ] **Slope-Based Biome Blending**: Use the surface normal vector to drive biome transitions. For example, use a rock texture on slopes $>45^\circ$, grass on flat lowlands, and snow at high elevations ($y > threshold$). Implement this blending using TSL mix() functions for smooth transitions.

- [ ] **GPU Instancing (InstancedMesh)**: Rendering thousands of identical objects (grass, rocks) in a single draw call.

## Phase 7. Geomorphological Refinement (Erosion)
Apply geological aging to the mathematical noise to achieve high-fidelity "lived-in" environments.

- [ ] **Particle-Based Hydraulic Erosion**: Implement a simulation where virtual "droplets" spawn and traverse the terrain.
[hydraulic erosion](https://medium.com/@ivo.thom.vanderveen/improved-terrain-generation-using-hydraulic-erosion-2adda8e3d99b)

- [ ] **Thermal Erosion (Slope Method)**: Implement the Slope Method to approximate thermal weathering.
[Procedural Feature Generation for Volumetric Terrains](https://history.siggraph.org/wp-content/uploads/2022/09/2017-Poster-64-Dey_Procedural-Feature-Generation-for-Volumetric-Terrains.pdf)