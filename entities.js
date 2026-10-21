export const PLANET_RADIUS = 10;
export const BASE_HEIGHT = 0.1;
export const DOME_RADIUS = 0.35;
export const AAO_RADIUS = 0.35; 
export const VISION_RADIUS = 0.75;        
export const RECON_VISION_RADIUS = 1.5;   

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

// ПЛАШКА ЗДОРОВЬЯ
export function createHealthBar(scene, base) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.8, 0.2, 1);
    
    const normal = base.position.clone().normalize();
    sprite.position.copy(base.position).add(normal.clone().multiplyScalar(0.4));
    
    base.healthSprite = sprite;
    base.healthCanvas = canvas;
    base.healthCtx = ctx;
    base.healthTex = tex;
    scene.add(sprite);
    
    updateHealthBar(base); // Первичная отрисовка
}

export function updateHealthBar(base) {
    if (!base.healthSprite) return;
    const ctx = base.healthCtx;
    const percent = Math.max(0, Math.floor((base.hp / base.maxHp) * 100));
    
    ctx.clearRect(0, 0, 128, 32);
    
    // Черная обводка
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, 128, 32);
    
    // Цвет в зависимости от здоровья
    ctx.fillStyle = percent > 50 ? '#00ff00' : (percent > 25 ? '#ffaa00' : '#ff0000');
    ctx.fillRect(2, 2, 124, 28);
    
    // Текст
    ctx.fillStyle = '#000';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${percent}%`, 64, 16);
    
    base.healthTex.needsUpdate = true;
}

export function createEnergyLine(scene, startPos, endPos, owner) {
    const midPoint = startPos.clone().lerp(endPos, 0.5);
    const controlPoint = midPoint.clone().normalize().multiplyScalar(PLANET_RADIUS + 0.3);
    const curve = new THREE.QuadraticBezierCurve3(startPos, controlPoint, endPos);
    
    const tubeGeometry = new THREE.TubeGeometry(curve, 20, 0.008, 8, false);
    const tubeMaterial = new THREE.MeshBasicMaterial({ color: playerColors[owner - 1] });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    scene.add(tube);
    
    return { tube, curve };
}

export function createNewBase(scene, bases, pos, parentBase, moduleType, sector, playerGenerators, onGeneratorBuilt) {
    const playerColor = playerColors[parentBase.owner - 1];
    let newBaseColor = playerColor;
    
    if (moduleType === 'generator') newBaseColor = 0x00ff00; 
    if (moduleType === 'dome') newBaseColor = 0xffff00; 
    if (moduleType === 'aao') newBaseColor = 0xff00ff; 
    if (moduleType === 'drone') newBaseColor = 0x00ffff; 

    const newBase = new THREE.Mesh(getGeometry(moduleType), new THREE.MeshBasicMaterial({ color: newBaseColor }));
    layFlatOnSphere(newBase, pos);
    scene.add(newBase);
    
    const lineData = createEnergyLine(scene, parentBase.position, pos, parentBase.owner);

    const baseObj = { 
        mesh: newBase, 
        position: pos.clone(), 
        owner: parentBase.owner, 
        hp: 100, 
        maxHp: 100, 
        type: moduleType, 
        parent: parentBase, 
        sector: sector, 
        lineMesh: lineData.tube,
        curve: lineData.curve,
        visionRadius: moduleType === 'drone' ? RECON_VISION_RADIUS : VISION_RADIUS,
        aimAngle: 0 // Запоминаем угол прицела
    };
    
    if (moduleType === 'dome') { baseObj.shieldHits = 0; baseObj.isDisabled = false; }
    if (moduleType === 'aao') { baseObj.isActive = true; }

    bases.push(baseObj);
    createHealthBar(scene, baseObj); // Создаем плашку здоровья

    if (moduleType === 'generator') {
        playerGenerators[parentBase.owner]++;
        if (parentBase.owner === 1 && onGeneratorBuilt) onGeneratorBuilt(playerGenerators[1]);
    }
    
    if (moduleType === 'dome') {
        const domeGeo = new THREE.SphereGeometry(DOME_RADIUS, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
        const domeMesh = new THREE.Mesh(domeGeo, domeMat);
        const normal = pos.clone().normalize();
        domeMesh.position.copy(normal.clone().multiplyScalar(PLANET_RADIUS + (BASE_HEIGHT / 2)));
        domeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        scene.add(domeMesh);
        baseObj.domeMesh = domeMesh; 
    }
    return baseObj;
}

export function destroyBaseAndChain(scene, bases, base, onGameOver) {
    const children = bases.filter(b => b.parent === base);
    children.forEach(child => destroyBaseAndChain(scene, bases, child, onGameOver));

    scene.remove(base.mesh);
    if (base.lineMesh) scene.remove(base.lineMesh);
    if (base.domeMesh) scene.remove(base.domeMesh); 
    if (base.healthSprite) scene.remove(base.healthSprite); // Удаляем плашку
    
    const index = bases.indexOf(base);
    if (index > -1) bases.splice(index, 1);

    if (base.type === 'hub') {
        if (onGameOver) onGameOver(base.owner);
    }
}
