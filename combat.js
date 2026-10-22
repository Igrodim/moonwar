import { PLANET_RADIUS, createNewBase, destroyBaseAndChain, updateHealthBar } from './entities.js';

export function canShoot(bases, startBase, angle, moduleToBuild) {
    const finalAngle = Math.round(angle / 11.25) * 11.25 % 360;
    const isBuildingModule = ['relay', 'dome', 'generator', 'aao', 'drone'].includes(moduleToBuild);
    
    if (isBuildingModule) {
        const children = bases.filter(b => b.parent === startBase);
        for (let child of children) {
            let diff = Math.abs(child.angle - finalAngle);
            if (diff > 180) diff = 360 - diff;
            if (diff < 7) return { allowed: false, reason: "Слишком близко к другому модулю!" };
        }
    }
    return { allowed: true, snappedAngle: finalAngle };
}

export function executeShot(scene, bases, startBase, angle, powerValue, moduleToBuild, playerGenerators, onGeneratorBuilt, onGameOver, onComplete) {
    const normal = startBase.position.clone().normalize();
    let baseVector = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.y) > 0.9) baseVector.set(0, 0, 1);
    let tangent = baseVector.cross(normal).normalize();
    tangent.applyAxisAngle(normal, THREE.MathUtils.degToRad(angle));
    
    const distance = 0.3 + powerValue * 0.15;
    const targetPos = startBase.position.clone().add(tangent.clone().multiplyScalar(distance)).normalize().multiplyScalar(PLANET_RADIUS);

    let color = 0xffaa00;
    if (moduleToBuild === 'bomb') color = 0xff0000;
    if (moduleToBuild === 'homing') color = 0xff00ff; 

    const projectile = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ color: color }));
    projectile.position.copy(startBase.position);
    scene.add(projectile);

    const startTime = performance.now();
    const duration = 1000;
    const maxHeight = 0.5;

    function animateFlight() {
        const elapsed = performance.now() - startTime;
        let t = elapsed / duration;
        
        if (t <= 1) {
            const surfacePoint = new THREE.Vector3().copy(startBase.position).lerp(targetPos, t).normalize().multiplyScalar(PLANET_RADIUS);
            const heightOffset = Math.sin(t * Math.PI) * maxHeight;
            const norm = surfacePoint.clone().normalize();
            projectile.position.copy(surfacePoint).add(norm.multiplyScalar(heightOffset));
            requestAnimationFrame(animateFlight);
        } else {
            scene.remove(projectile);
            try {
                handleLanding(scene, bases, targetPos, startBase, moduleToBuild, angle, playerGenerators, onGeneratorBuilt, onGameOver); 
            } finally {
                if (onComplete) onComplete();
            }
        }
    }
    animateFlight();
}

function handleLanding(scene, bases, targetPos, parentBase, moduleToBuild, angle, playerGenerators, onGeneratorBuilt, onGameOver) {
    if (moduleToBuild === 'bomb') { explode(scene, bases, targetPos, 25, onGameOver); return; }
    if (moduleToBuild === 'homing') { explode(scene, bases, targetPos, 50, onGameOver); return; }

    createNewBase(scene, bases, targetPos, parentBase, moduleToBuild, angle, playerGenerators, onGeneratorBuilt);
}

export function explode(scene, bases, pos, damage, onGameOver) {
    const explosion = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 1 }));
    const explosionCenter = pos.clone().normalize().multiplyScalar(PLANET_RADIUS);
    explosion.position.copy(explosionCenter);
    scene.add(explosion);

    let scale = 1;
    const interval = setInterval(() => {
        scale += 0.1;
        explosion.scale.set(scale, scale, scale);
        explosion.material.opacity -= 0.05;
        if (explosion.material.opacity <= 0) {
            clearInterval(interval);
            scene.remove(explosion);
        }
    }, 30);

    const basesCopy = [...bases];
    for (let b of basesCopy) {
        if (b.position.distanceTo(explosionCenter) < 0.5) { 
            b.hp -= damage;
            updateHealthBar(b);
            if (b.hp <= 0) destroyBaseAndChain(scene, bases, b, onGameOver);
        }
    }
}
