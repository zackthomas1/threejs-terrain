
import * as PERLIN from 'https://cdn.jsdelivr.net/gh/mikechambers/es6-perlin-module@master/perlin.js';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { mulberry32 } from './util'

class SimplexGenerator {
    constructor(seed = Date.now()) {
        const random = mulberry32(seed);
        this.noise2D = createNoise2D(random);
        this.noise3D = createNoise3D(random);
    }

    get2D(x, y) {
        return this.noise2D(x, y);
    }

    get3D(x, y, z) {
        return this.noise3D(x, y, z);
    }
}

class PerlinGenerator {
    constructor(seed = Date.now()) {
        const random = mulberry32(seed);
        this.offsetX = random() * 10000;
        this.offsetY = random() * 10000;
        this.offsetZ = random() * 10000;
    }

    get2D(x, y) {
        return PERLIN.noise2(x + this.offsetX, y + this.offsetY) * 2.0 - 1.0;
    }

    get3D(x, y, z) {
        return PERLIN.noise3(
            x + this.offsetX,
            y + this.offsetY,
            z + this.offsetZ
        ) * 2.0 - 1.0;
    }
}

export class NoiseGenerator {
    _noise          = {};
    _type           = 'simplex';
    _scale          = 256.0;
    _octaves        = 10;
    _persistence    = 0.5;
    _lacunarity     = 2.0;
    _exponentiation = 3.9;
    _height         = 64;
    _seed           = 1;

    constructor(params) {

       this._type           = params.noiseType;
       this._scale          = params.scale;
       this._octaves        = params.octaves;
       this._persistence    = params.persistence;
       this._lacunarity     = params.lacunarity;
       this._exponentiation = params.exponentiation;
       this._height         = params.height;
       this._seed           = params.seed;

        this._noise = {
            simplex: new SimplexGenerator(params.seed),
            perlin: new PerlinGenerator(params.seed)
        };
    }

    setParams(params) {
        const shouldRebuildGenerators = Number.isFinite(params.seed) && params.seed !== this._seed;

        this._type          = params.noiseType;
        this._scale          = params.scale;
        this._octaves        = params.octaves;
        this._persistence    = params.persistence;
        this._lacunarity     = params.lacunarity;
        this._exponentiation = params.exponentiation;
        this._height         = params.height;
        this._seed           = params.seed;

        if (shouldRebuildGenerators) {
            this._noise = {
                simplex: new SimplexGenerator(this._seed),
                perlin: new PerlinGenerator(this._seed)
            };
        }
    }

    get2D(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new Error("NoiseGenerator.get2D: invalid coordinate parameter");
        }

        const xs = x / this._scale;
        const ys = y / this._scale;
        const noiseFunc = this._noise[this._type];

        let amplitude = 1.0;
        let frequency = 1.0;
        let normalization = 0;
        let total = 0;
        for (let o = 0; o < this._octaves; o++) {
            const noiseValue = noiseFunc.get2D(
                xs * frequency, ys * frequency) * 0.5 + 0.5;
            total += noiseValue * amplitude;
            normalization += amplitude;
            amplitude *= this._persistence;
            frequency *= this._lacunarity;
        }
        total /= normalization;
        return Math.pow(total, this._exponentiation) * this._height;
    }

    get3D(x, y, z) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            throw new Error("NoiseGenerator.get3D: invalid coordinate parameter");
        }

        const xs = x / this._scale;
        const ys = y / this._scale;
        const zs = z / this._scale;
        
        const noiseFunc = this._noise[this._type];

        let amplitude = 1.0;
        let frequency = 1.0;
        let normalization = 0;
        let total = 0;
        for (let o = 0; o < this._octaves; o++) {
            const noiseValue = noiseFunc.get3D(
                xs * frequency, ys * frequency, zs * frequency) * 0.5 + 0.5;
            total += noiseValue * amplitude;
            normalization += amplitude;
            amplitude *= this._persistence;
            frequency *= this._lacunarity;
        }
        total /= normalization;
        return Math.pow(total, this._exponentiation) * this._height;
    }
}