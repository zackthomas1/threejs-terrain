import * as THREE from 'three/webgpu';

export class QuadTree { 
    _root = null;
    _minNodeSize = 0;

    constructor(params) {
        const boundingBox = new THREE.Box2(params.min, params.max);
        this._root = {
            bounds: boundingBox,
            children: [],
            center: boundingBox.getCenter(new THREE.Vector2()),
            size: boundingBox.getSize(new THREE.Vector2()),
        }
        this._minNodeSize = params.nodeSize;
    }

    getChildren() {
        const getChildrenRecursive = (node, target) => {
            // base case: leaf node
            if (node.children.length === 0) {
                target.push(node);
                return;
            }

            // recursive step
            for (const c of node.children) {
                getChildrenRecursive(c, target);
            }
        }

        const children = []; 
        getChildrenRecursive(this._root, children);
        return children;
    }

    insert(position) {
        const insertRecursive = (child, position) => {
            const distanceToChild = (child, position) => {
                return child.center.distanceTo(position);
            };

            const createChildren = (child) => {
                const midpoint = child.bounds.getCenter(new THREE.Vector2());

                // bottom left
                const b1 = new THREE.Box2(child.bounds.min, midpoint);

                // bottom right
                const b2 = new THREE.Box2(
                    new THREE.Vector2(midpoint.x, child.bounds.min.y),
                    new THREE.Vector2(child.bounds.max.x, midpoint.y)
                );
                
                // top left
                const b3 = new THREE.Box2(
                    new THREE.Vector2(child.bounds.min.x, midpoint.y),
                    new THREE.Vector2(midpoint.x, child.bounds.max.y)
                );
                
                // top right
                const b4 = new THREE.Box2(midpoint, child.bounds.max);
                
                // construct children list
                const children = [b1,b2,b3,b4].map(
                    (b) => {
                        return {
                            bounds : b,
                            children: [],
                            center: b.getCenter(new THREE.Vector2()),
                            size: b.getSize(new THREE.Vector2()),
                        }
                    }
                );
                return children;
            };

            const distToChild = distanceToChild(child, position);

            if (distToChild < child.size.x && child.size.x > this._minNodeSize) {
                child.children = createChildren(child);
                for (const c of child.children) {
                    insertRecursive(c, position);
                }
            }
        }

        insertRecursive(this._root, new THREE.Vector2(position.x, position.y));
    }
}