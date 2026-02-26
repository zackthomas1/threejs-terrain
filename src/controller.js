import * as THREE from 'three/webgpu';
import * as CONFIG from './config';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';

export class FPSController {
    _camera = null;
    _controls = null;
    _mesh = null;
    _position = null;
    _isActive = false;

    constructor(params) {
        this._camera    = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this._position  = new THREE.Vector3(5, 10, 5);
        this._camera.position.copy(this._position);
        
        // set up fly controls
        this._controls = new FlyControls(this._camera, CONFIG.CANVAS_TARGET);
        this._controls.movementSpeed = 25.0;        // WSAD movement speed
        this._controls.rollSpeed = 0.5;           // Roll sensitivity
        this._controls.autoForward = false;         // Disable auto-forward
        this._controls.dragToLook = true;          // Free mouse look without dragging 

        // helper mesh to visualize contorller location
        const helperGeometry = new THREE.TetrahedronGeometry();
        const helperMaterial = new THREE.MeshBasicMaterial({ color: '#ff00ff' });
        this._mesh = new THREE.Mesh(helperGeometry, helperMaterial);
        this._mesh.position.copy(this._position);
        params.scene.add(this._mesh);
    }

    getCamera() {
        return this._camera;
    }

    getPosition() {
        return this._position;
    }

    setActive(active) {
        this._isActive = active;
        // Enable/disable the controls based on active state
        this._controls.enabled = active;
    }

    update(_deltaTime) {
        if (!this._isActive) { return; }

        const deltaTime = Number.isFinite(_deltaTime) ? _deltaTime : 0;
        this._controls.update(deltaTime);
        this._position.copy(this._controls.object.position);
        this._mesh.position.copy(this._position);
    }

    dispose() {
        this._controls?.dispose?.();

        if (this._mesh) {
            if (this._mesh.parent) {
                this._mesh.parent.remove(this._mesh);
            }

            this._mesh.geometry?.dispose?.();

            const material = this._mesh.material;
            if (Array.isArray(material)) {
                material.forEach((entry) => entry?.dispose?.());
            } else {
                material?.dispose?.();
            }
        }

        this._controls = null;
        this._mesh = null;
    }

    onWindowResize() {
        // Update camera
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
    }
}

export class OrbitController {
    controls = null;
    _camera = null;
    _mesh = null;
    _position = null;
    _isActive = false;
    
    constructor(params) {
        this._camera    = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this._position  = new THREE.Vector3(0, 10, 30);
        this._camera.position.copy(this._position);

        // set up orbit controls
        this._controls = new OrbitControls(this._camera, CONFIG.CANVAS_TARGET);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.05;

        // helper mesh to visualize contorller location
        const helperGeometry = new THREE.TetrahedronGeometry();
        const helperMaterial = new THREE.MeshBasicMaterial({ color: '#ffff00' });
        this._mesh = new THREE.Mesh(helperGeometry, helperMaterial);
        this._mesh.position.copy(this._position);
        params.scene.add(this._mesh);
    }

    getCamera() {
        return this._camera;
    }

    getPosition() {
        return this._position;
    }

    setActive(active) {
        if(active) {
            this._controls.reset();
        }else {
            this._controls.saveState();
        }
        this._isActive = active;
    }

    update(_deltaTime) {
        if (!this._isActive) { return; }

        // update camera controls
        this._controls.update();
        this._position.copy(this._controls.object.position);
        this._mesh.position.copy(this._position);
    }

    dispose() {
        this._controls?.dispose?.();

        if (this._mesh) {
            if (this._mesh.parent) {
                this._mesh.parent.remove(this._mesh);
            }

            this._mesh.geometry?.dispose?.();

            const material = this._mesh.material;
            if (Array.isArray(material)) {
                material.forEach((entry) => entry?.dispose?.());
            } else {
                material?.dispose?.();
            }
        }

        this._controls = null;
        this._mesh = null;
    }

    onWindowResize() {
        // Update camera
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
    }
}