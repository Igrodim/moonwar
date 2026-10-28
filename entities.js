export let PLANET_RADIUS = 10; 
export const BASE_HEIGHT = 0.1;
export const DOME_RADIUS = 0.35;
export const AAO_RADIUS = 0.35; 
export const VISION_RADIUS = 0.75;        
export const RECON_VISION_RADIUS = 1.5;   

export function setPlanetRadius(radius) {
    PLANET_RADIUS = radius;
}

export const playerColors = [];
for (let i = 0; i < 48; i++) {
    const color = new THREE.Color().setHSL(i / 48, 0.8, 0.6);
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

// ПЕРЕМЕННАЯ ДЛЯ ПЕРЕДАЧИ ДАННЫХ ТУМАНА В ШЕЙДЕР ЛИНИЙ
let globalFogUniforms = null;
export function setGlobalFogUniforms(uniforms) {
    globalFogUniforms = uniforms;
}

export function createHealthBar(scene, base) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter; 
    
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.15, 0.04, 1); 
    sprite.renderOrder = 1000;
    
    const normal = base.position.clone().normalize();
    sprite.position.copy(base.position).add(normal.clone().multiplyScalar(0.2));
    
    base.healthSprite = sprite;
    base.healthCanvas = canvas;
    base.healthCtx = ctx;
    base.healthTex = tex;
    scene.add(sprite);
    updateHealthBar(base);
}

export function updateHealthBar(base) {
    if (!base.healthSprite) return;
    const ctx = base.healthCtx;
    const percent = Math.max(0, Math.floor((base.hp / base.maxHp) * 100));
    
    ctx.clearRect(0, 0, 64, 16);
    ctx.beginPath();
    ctx.roundRect(0, 0, 64, 16, 8); 
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fill();
    
    if (percent > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(2, 2, 60, 12, 6); 
        ctx.clip(); 
        ctx.fillStyle = percent > 50 ? '#00ff00' : (percent > 25 ? '#ffaa00' : '#ff0000');
        const fillWidth = 60 * (percent / 100);
        ctx.fillRect(2, 2, fillWidth, 12);
        ctx.restore();
    }
    base.healthTex.needsUpdate = true;
}

export function createEnergyLine(scene, startPos, endPos, owner) {
    const midPoint = startPos.clone().lerp(endPos, 0.5);
    const controlPoint = midPoint.clone().normalize().multiplyScalar(PLANET_RADIUS + 0.3);
    const curve = new THREE.QuadraticBezierCurve3(startPos, controlPoint, endPos);
    
    const tubeGeometry = new THREE.TubeGeometry(curve, 20, 0.008, 8, false);
    const tubeMaterial = new THREE.MeshStandardMaterial({ 
        color: playerColors[owner - 1], emissive: playerColors[owner - 1], emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.8
    });

    // МАГИЯ: Внедряем шейдер, который обрезает линию по границе тумана
    tubeMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.uSources = globalFogUniforms || { value: Array(32).fill(null).map(() => new THREE.Vector4(0,0,0,-1)) };
        
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vWorldPos;'
        ).replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vWorldPos;\nuniform vec4 uSources[32];'
        ).replace(
            'void main() {',
            `void main() {
                vec3 normPos = normalize(vWorldPos);
                float fogAlpha = 0.0;
                for(int i = 0; i < 32; i++) {
                    if (uSources[i].w > 0.0) {
                        vec3 src = normalize(uSources[i].xyz);
                        float dist = distance(normPos, src);
                        float localAlpha = 1.0 - smoothstep(uSources[i].w, uSources[i].w + 0.03, dist);
                        fogAlpha = max(fogAlpha, localAlpha);
                    }
                }
                if (fogAlpha < 0.05) discard; // Отрезаем пиксели, ушедшие в туман
            `
        );
    };
    
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

    const material = new THREE.MeshStandardMaterial({
        color: newBaseColor, emissive: newBaseColor, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.2
    });

    const newBase = new THREE.Mesh(getGeometry(moduleType), material);
    layFlatOnSphere(newBase, pos);
    scene.add(newBase);
    
    const lineData = createEnergyLine(scene, parentBase.position, pos, parentBase.owner);

    const baseObj = { 
        mesh: newBase, position: pos.clone(), owner: parentBase.owner, hp: 100, maxHp: 100, type: moduleType, 
        parent: parentBase, sector: sector, lineMesh: lineData.tube, curve: lineData.curve,
        visionRadius: moduleType === 'drone' ? RECON_VISION_RADIUS : VISION_RADIUS, aimAngle: 0 
    };
    
    if (moduleType === 'dome') { baseObj.shieldHits = 0; baseObj.isDisabled = false; }
    if (moduleType === 'aao') { baseObj.isActive = true; }

    bases.push(baseObj);
    createHealthBar(scene, baseObj);

    if (moduleType === 'generator') {
        playerGenerators[parentBase.owner]++;
        if (parentBase.owner === 1 && onGeneratorBuilt) onGeneratorBuilt(playerGenerators[1]);
    }
    
    if (moduleType === 'dome') {
        const domeGeo = new THREE.SphereGeometry(DOME_RADIUS, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshStandardMaterial({ 
            color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0.3, transparent: true, opacity: 0.2, side: THREE.DoubleSide 
        });
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
    if (base.healthSprite) scene.remove(base.healthSprite);
    
    if (base.mesh.material) base.mesh.material.dispose();
    if (base.mesh.geometry) base.mesh.geometry.dispose();

    const index = bases.indexOf(base);
    if (index > -1) bases.splice(index, 1);

    if (base.type === 'hub') {
        if (onGameOver) onGameOver(base.owner);
    }
}
