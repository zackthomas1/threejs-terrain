import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';

const SKYBOXSCALE = 4096;
const SUNLIGHTCOLOR = '#FFFFFF'
const HEMISPHERE_LIGHT_SKY_COLOR = '#bbf7ff';
const HEMISPHERE_LIGHT_GROUND_COLOR = '#33335f';
const SUNLIGHT_INTENSITY = 2.0;
const HEMISPHERE_LIGHT_INTENSITY = 0.6;
const SUNLIGHT_DISTANCE = 256;

export class TerrainAtmosphere {
    _sky = null;
    _fog = null;
    _atmosphereHost = null;
    _atmosphereRollup = null;
    _lightGroup = null;
    _skyParams  = {};
    _sunParams  = {};
    _fogParams  = {};
    _sunLight   = null;
    _fillLight  = null;
    _hemiLight  = null;
    _sunTarget  = null;
    _sunLightHelper = null;
    _fillLightHelper = null;
    _hemiLightHelper = null;

    constructor(params) {
        // guard check params are valid
        if (typeof params.atmosphereHost?.setFog !== 'function') {
            throw new Error('TerrainAtmosphere: params.atmosphereHost.setFog must be a function.');
        }

        // Setup GUI controls for sun and sky
        params.guiParams.sky = { 
            turbidity: 0.2,
            rayleigh: 0.3,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.6,
        };

        params.guiParams.sun = { 
            intensity: 7.0,
            inclination: 35.0,
            azimuth: 96.0,
        };

        params.guiParams.fog = {
            enable: false,
            color: '#96afca',
            near: 64,
            far: 1024,
        };

        this._skyParams = params.guiParams.sky;
        this._sunParams = params.guiParams.sun;
        this._fogParams = params.guiParams.fog;

        this._atmosphereRollup = params.gui.addFolder("Atmosphere");
        const skyRollup = this._atmosphereRollup.addFolder("Sky");
        const sunRollup = this._atmosphereRollup.addFolder("Sun");
        const fogRollup = this._atmosphereRollup.addFolder("Fog");

        // sky
        skyRollup.add(params.guiParams.sky, "turbidity", 0.01, 1.0)
            .onChange(() => { this.onSunSkyChange(); });
        skyRollup.add(params.guiParams.sky, "rayleigh", 0.01, 1.0)
            .onChange(() => { this.onSunSkyChange(); });
        skyRollup.add(params.guiParams.sky, "mieCoefficient", 0.0001, 0.1)
            .onChange(() => { this.onSunSkyChange(); });
        skyRollup.add(params.guiParams.sky, "mieDirectionalG", 0.0, 1.0)
            .onChange(() => { this.onSunSkyChange(); });

        // sun
        sunRollup.add(params.guiParams.sun, "intensity", 1.0, 10.0)
            .onChange(() => { this.onSunSkyChange(); })
            .name("intensity");
        sunRollup.add(params.guiParams.sun, "inclination", 0.0, 180.0)
            .onChange(() => { this.onSunSkyChange(); })
            .name("inclination (degrees)");
        sunRollup.add(params.guiParams.sun, "azimuth", 0.0, 360.0)
            .onChange(() => { this.onSunSkyChange(); })
            .name("azimuth (degrees)");

        // fog
        fogRollup.add(params.guiParams.fog, "enable", true)
            .onChange(() => { this._atmosphereHost.setFog(this._fogParams.enable ? this._fog : null); })
            .name("enabled");
        fogRollup.addColor(params.guiParams.fog, "color")
            .onChange(() => { this.onFogChange(); })
            .name("color");
        fogRollup.add(params.guiParams.fog, "near", 1.0, 128.0)
            .onChange(() => { this.onFogChange(); })
            .name("near clip");
        fogRollup.add(params.guiParams.fog, "far", 128.0, SKYBOXSCALE)
            .onChange(() => { this.onFogChange(); })
            .name("far clip");

        // Setup Sky
        this._sky = new SkyMesh();
        this._sky.scale.setScalar(SKYBOXSCALE);
        params.scene.add(this._sky);

        // Setup atmospheric fog
        this._fog = new THREE.Fog(this._fogParams.color, this._fogParams.near, this._fogParams.far);
        this._atmosphereHost = params.atmosphereHost;

        // create lights
        const lightGroup = new THREE.Group();
        this._lightGroup = lightGroup;

        // Sun light
        this._sunTarget = new THREE.Object3D();
        this._sunTarget.position.set(0, 0, 0);

        this._sunLight = new THREE.DirectionalLight(SUNLIGHTCOLOR, SUNLIGHT_INTENSITY);
        this._sunLight.target = this._sunTarget;
        this._sunLight.position.set(-1, 2, 4);
        lightGroup.add(this._sunTarget);
        lightGroup.add(this._sunLight);

        // hemisphere light
        const hemiLight = new THREE.HemisphereLight(HEMISPHERE_LIGHT_SKY_COLOR, HEMISPHERE_LIGHT_GROUND_COLOR, HEMISPHERE_LIGHT_INTENSITY);
        this._hemiLight = hemiLight;
        lightGroup.add(hemiLight);

        // Add light helpers for visualization
        const sunLightHelper = new THREE.DirectionalLightHelper(this._sunLight, 20);
        this._sunLightHelper = sunLightHelper;
        lightGroup.add(sunLightHelper);
        
        const hemiLightHelper = new THREE.HemisphereLightHelper(hemiLight, 256);
        this._hemiLightHelper = hemiLightHelper;
        lightGroup.add(hemiLightHelper);

        params.scene.add(lightGroup);

        // Initialize atmosphere 
        this.onSunSkyChange();
        this.onFogChange();
        this._atmosphereHost.setFog(this._fogParams.enable ? this._fog : null);
    }

    update(_deltaTime) {
        // TODO: Implement update function 
        return;
    }

    // event handlers
    onSunSkyChange() {
        
        // Inclination is the vertical angle (0 = bottom, PI/2 = horizon, PI = top)
        // Azimuth is the horizontal rotation (0 to 2*PI)
        const theta = Math.PI / 2 - THREE.MathUtils.degToRad(this._sunParams.inclination);
        const phi = THREE.MathUtils.degToRad(this._sunParams.azimuth);
        
        const sunPosition = new THREE.Vector3(
            Math.sin(theta) * Math.cos(phi),
            Math.cos(theta),
            Math.sin(theta) * Math.sin(phi)
        ).normalize();
        
        // Update SkyMesh parameters via its uniform nodes
        if (this._sky) {
            if (this._sky.sunPosition?.value) {
                this._sky.sunPosition.value.copy(sunPosition);
            }
            if (this._sky.turbidity?.value !== undefined) {
                this._sky.turbidity.value = this._skyParams.turbidity;
            }
            if (this._sky.rayleigh?.value !== undefined) {
                this._sky.rayleigh.value = this._skyParams.rayleigh;
            }
            if (this._sky.mieCoefficient?.value !== undefined) {
                this._sky.mieCoefficient.value = this._skyParams.mieCoefficient;
            }
            if (this._sky.mieDirectionalG?.value !== undefined) {
                this._sky.mieDirectionalG.value = this._skyParams.mieDirectionalG;
            }
        }

        // update sun position
        ((position) => {
            if (!this._sunLight || !this._sunTarget || !position) {
                console.error("Missing required sunLight");
                return;
            }

            // Position sun light
            this._sunLight.position.copy(
                position.clone().multiplyScalar(SUNLIGHT_DISTANCE)
            );


            this._sunTarget.position.set(0, 0, 0);
            this._sunTarget.updateMatrixWorld();
        })(sunPosition);

        if (this._sunLight) {
            this._sunLight.intensity = this._sunParams.intensity;
        }
    }

    onFogChange() {
        if (!this._fog) {
            return;
        }

        // Ensure color assignment works with number or Color input
        this._fog.color.set(this._fogParams.color);
        this._fog.near = this._fogParams.near;
        this._fog.far = this._fogParams.far;
    }

    dispose() {
        this._atmosphereHost?.setFog(null);

        if (this._sunLightHelper) {
            this._sunLightHelper.parent?.remove(this._sunLightHelper);
            this._sunLightHelper.dispose();
            this._sunLightHelper = null;
        }

        if (this._fillLightHelper) {
            this._fillLightHelper.parent?.remove(this._fillLightHelper);
            this._fillLightHelper.dispose();
            this._fillLightHelper = null;
        }

        if (this._hemiLightHelper) {
            this._hemiLightHelper.parent?.remove(this._hemiLightHelper);
            this._hemiLightHelper.dispose();
            this._hemiLightHelper = null;
        }

        if (this._sky) {
            this._sky.parent?.remove(this._sky);
            this._sky.geometry?.dispose?.();
            this._sky.material?.dispose?.();
            this._sky = null;
        }

        this._sunTarget?.parent?.remove(this._sunTarget);
        this._sunLight?.parent?.remove(this._sunLight);
        this._fillLight?.parent?.remove(this._fillLight);
        this._hemiLight?.parent?.remove(this._hemiLight);
        this._lightGroup?.parent?.remove(this._lightGroup);

        if (this._atmosphereRollup) {
            this._atmosphereRollup.destroy();
            this._atmosphereRollup = null;
        }

        this._fog = null;
        this._sunTarget = null;
        this._sunLight = null;
        this._fillLight = null;
        this._hemiLight = null;
        this._lightGroup = null;
        this._atmosphereHost = null;
    }
}
