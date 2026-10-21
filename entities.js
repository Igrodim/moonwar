export const PLANET_RADIUS = 10;
export const BASE_HEIGHT = 0.1;
export const DOME_RADIUS = 0.35;
export const AAO_RADIUS = 0.35; 

// Генерируем 32 уникальных цвета по кругу (радуга)
export const playerColors = [];
for (let i = 0; i < 32; i++) {
    const color = new THREE.Color().setHSL(i / 32, 0.8, 0.6);
    playerColors.push(color.getHex());
}

export function getGeometry(type) {
    if (type === 'aao') return new THREE.CylinderGeometry(0.06, 0.06, BASE_HEIGHT, 3);
    if (type === 'generator') return new THREE.BoxGeometry(0.08, BASE_HEIGHT, 0.08);
    return new THREE.CylinderGeometry(0.05, 0.05, BASE_HEIGHT, 16);
}

export function layFlatOnSphere(mesh, position) {
    const normal = position.clone().normalize();
    const offsetPos = normal.clone().multiplyScalar(PLANET_RADIUS + (BASE_HEIGHT / 2));
    mesh.position.copy(offsetPos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
}

export function createEnergyLine(scene, startPos, endPos, owner) {
    const midPoint = startPos.clone().lerp(endPos, 0.5);
    const controlPoint = midPoint.clone().normalize().multiplyScalar(PLANET_RADIUS + 0.3);
    const curve = new THREE.QuadraticBezierCurve3(startPos, controlPoint, endPos);
    const tubeGeometry = new THREE.TubeGeometry(curve, 20, 0.008, 8, false);
    const tubeMaterial = new THREE.MeshBasicMaterial({ color: playerColors[owner - 1] });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    scene.add(tube);
    return tube;
}

export function createNewBase(scene, bases, pos, parentBase, moduleType, sector, playerGenerators, onGeneratorBuilt) {
    const playerColor = playerColors[parentBase.owner - 1];
    let newBaseColor = playerColor;
    
    if (moduleType === 'generator') newBaseColor = 0x00ff00; 
    if (moduleType === 'dome') newBaseColor = 0xffff00; 
    if (moduleType === 'aao') newBaseColor = 0xff00ff; 

    const newBase = new THREE.Mesh(getGeometry(moduleType), new THREE.MeshBasicMaterial({ color: newBaseColor }));
    layFlatOnSphere(newBase, pos);
    scene.add(newBase);
    
    const lineMesh = createEnergyLine(scene, parentBase.position, pos, parentBase.owner);

    const baseObj = { 
        mesh: newBase, position: pos.clone(), owner: parentBase.owner, 
        hp: 100, maxHp: 100, type: moduleType, parent: parentBase, sector: sector, lineMesh: lineMesh
    };
    
    if (moduleType === 'dome') { baseObj.shieldHits = 0; baseObj.isDisabled = false; }
    if (moduleType === 'aao') { baseObj.isActive = true; }

    bases.push(baseObj);

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
    console.log(`Уничтожена база типа ${base.type} Игрока ${base.owner}`);

    const children = bases.filter(b => b.parent === base);
    children.forEach(child => destroyBaseAndChain(scene, bases, child, onGameOver));

    scene.remove(base.mesh);
    if (base.lineMesh) scene.remove(base.lineMesh);
    if (base.domeMesh) scene.remove(base.domeMesh); 
    
    const index = bases.indexOf(base);
    if (index > -1) bases.splice(index, 1);

    if (base.type === 'hub') {
        if (onGameOver) onGameOver(base.owner);
    }
}
