export const PLANET_RADIUS = 10;
export const BASE_HEIGHT = 0.1;

export const playerColors = [];
for (let i = 0; i < 32; i++) {
    const color = new THREE.Color().setHSL(i / 32, 0.8, 0.6);
    playerColors.push(color.getHex());
}

export function getGeometry(type) {
    if (type === 'aao') return new THREE.CylinderGeometry(0.06, 0.06, BASE_HEIGHT, 3);
    if (type === 'generator') return new THREE.BoxGeometry(0.08, BASE_HEIGHT, 0.08);
    if (type === 'drone') return new THREE.ConeGeometry(0.06, BASE_HEIGHT * 3, 16);
    return new THREE.CylinderGeometry(0.05, 0.05, BASE_HEIGHT, 16);
}

export function layFlatOnSphere(mesh, position) {
    const normal = position.clone().normalize();
    const offsetPos = normal.clone().multiplyScalar(PLANET_RADIUS + (BASE_HEIGHT / 2));
    mesh.position.copy(offsetPos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
}

export function createHealthBar(scene, base) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.24, 0.06, 1);
    const normal = base.position.clone().normalize();
    sprite.position.copy(base.position).add(normal.clone().multiplyScalar(0.2));
    base.healthSprite = sprite;
    base.healthCtx = ctx;
    base.healthTex = tex;
    scene.add(sprite);
    updateHealthBar(base);
}

export function updateHealthBar(base) {
    if (!base.healthSprite) return;
    const percent = Math.max(0, Math.floor((base.hp / base.maxHp) * 100));
    const ctx = base.healthCtx;
    ctx.clearRect(0, 0, 128, 32);
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = percent > 50 ? '#00ff00' : (percent > 25 ? '#ffaa00' : '#ff0000');
    ctx.fillRect(2, 2, 124, 28);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${percent}%`, 64, 16);
    base.healthTex.needsUpdate = true;
}

export function createNewBase(scene, bases, pos, parentBase, moduleType, angle) {
    let newBaseColor = playerColors[parentBase.owner - 1];
    if (moduleType === 'generator') newBaseColor = 0x00ff00;
    if (moduleType === 'dome') newBaseColor = 0xffff00;
    if (moduleType === 'aao') newBaseColor = 0xff00ff;

    const newBase = new THREE.Mesh(getGeometry(moduleType), new THREE.MeshBasicMaterial({ color: newBaseColor }));
    layFlatOnSphere(newBase, pos);
    scene.add(newBase);

    const baseObj = { 
        mesh: newBase, position: pos.clone(), owner: parentBase.owner, hp: 100, maxHp: 100,
        type: moduleType, parent: parentBase, angle: angle, aimAngle: angle
    };
    
    bases.push(baseObj);
    createHealthBar(scene, baseObj);
    return baseObj;
}

export function destroyBaseAndChain(scene, bases, base, onGameOver) {
    const children = bases.filter(b => b.parent === base);
    children.forEach(child => destroyBaseAndChain(scene, bases, child, onGameOver));
    scene.remove(base.mesh);
    if (base.healthSprite) scene.remove(base.healthSprite);
    const index = bases.indexOf(base);
    if (index > -1) bases.splice(index, 1);
    if (base.type === 'hub' && onGameOver) onGameOver(base.owner);
}
