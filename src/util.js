export function toUint32Seed(seed) {
    if (!Number.isFinite(seed)) {
        return 1;
    }

    const normalized = Math.floor(seed);
    return (normalized >>> 0) || 1;
}

export function mulberry32(seed) {
    let state = toUint32Seed(seed);

    return () => {
        state += 0x6D2B79F5;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function DictIntersection(dictA, dictB) {
    const intersection = {}; 
    for (const k in dictB) {
        if (k in dictA) {
            intersection[k] = dictA[k];
        }
    }
    return intersection;
}

export function DictDifference(dictA, dictB) {
    const diff = {...dictA}; 
    for (const k in dictB) {
        delete diff[k];
    }
    return diff;
}