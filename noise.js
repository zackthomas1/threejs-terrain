

import { createNoise2D, createNoise3D } from 'simplex-noise';

class SimplexGenerator {
    constructor(seed = Date.now()) {
        this.noise2D = createNoise2D(() => seed);
        this.noise3D = createNoise3D(() => seed);
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
        // TODO: Perlin noise immplementation
    }

    get2D(x, y) {
        // TODO: implement 2D perlin
        return 0.0;
    }

    get3D(x, y, z) {
        // TODO: implement 2D perlin
        return 0.0;
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
        this._type          = params.noiseType;
        this._scale          = params.scale;
        this._octaves        = params.octaves;
        this._persistence    = params.persistence;
        this._lacunarity     = params.lacunarity;
        this._exponentiation = params.exponentiation;
        this._height         = params.height;
        this._seed           = params.seed;
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
            const noiseValue = noiseFunc.noise3D(
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