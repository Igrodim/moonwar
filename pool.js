// Пул объектов для переиспользования Mesh и спрайтов
export class ObjectPool {
    constructor(createFn, resetFn, initialSize = 20) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }
    get() {
        return this.pool.length > 0 ? this.pool.pop() : this.createFn();
    }
    release(obj) {
        this.resetFn(obj);
        this.pool.push(obj);
    }
}

// Пул для снарядов
export const projectilePool = new ObjectPool(
    () => {
        const geo = new THREE.SphereGeometry(0.08, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        return mesh;
    },
    (mesh) => {
        mesh.visible = false;
        mesh.position.set(0, 0, 0);
        if (mesh.parent) mesh.parent.remove(mesh);
    },
    50
);

// Пул для взрывов
export const explosionPool = new ObjectPool(
    () => {
        const geo = new THREE.SphereGeometry(0.1, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        return mesh;
    },
    (mesh) => {
        mesh.visible = false;
        mesh.scale.set(1, 1, 1);
        mesh.material.opacity = 1;
        if (mesh.parent) mesh.parent.remove(mesh);
    },
    20
);

// Пул для текста урона
export const damageTextPool = new ObjectPool(
    () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.visible = false;
        sprite.userData = { canvas, ctx, tex, life: 0 };
        return sprite;
    },
    (sprite) => {
        sprite.visible = false;
        sprite.userData.life = 0;
        if (sprite.parent) sprite.parent.remove(sprite);
    },
    10
);
