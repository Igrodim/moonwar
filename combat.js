import { PLANET_RADIUS, AAO_RADIUS, createNewBase, destroyBaseAndChain } from './entities.js';

export function canShoot(bases, startBase, angle, moduleToBuild) {
    const ANGLE_STEP = 22.5;
    const snappedAngle = Math.round(angle / ANGLE_STEP) * ANGLE_STEP;
    let sector = Math.round(snappedAngle / ANGLE_STEP) % 16;
    if (sector < 0) sector += 16; 

    const isBuildingModule = ['relay', 'dome', 'generator', 'aao', 'drone'].includes(moduleToBuild);
    if (isBuildingModule) {
        const existingBuild = bases.find(b => b.parent === startBase && b.sector === sector);
        if (existingBuild) return { allowed: false, reason: "В этом направлении уже построен модуль!" };
    }
    return { allowed: true, snappedAngle: snappedAngle, sector: sector };
}

export function executeShot(scene, bases, startBase, angle, powerValue, moduleToBuild, sector, playerGenerators, onGeneratorBuilt, onGameOver, onComplete) {
    const normal = startBase.position.clone().normalize();
    let baseVector = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.y) > 0.9) baseVector.set(0, 0, 1);
    let tangent = baseVector.cross(normal).normalize();
    tangent.applyAxisAngle(normal, THREE.MathUtils.degToRad(angle));
    
    const distance = powerValue * 0.15;
    const targetPos = startBase.position.clone().add(tangent.clone().multiplyScalar(distance)).normalize().multiplyScalar(PLANET_RADIUS);

    let projectileColor = 0xffaa00;
    if (moduleToBuild === 'bomb') projectileColor = 0xff0000;
    if (moduleToBuild === 'homing') projectileColor = 0xff00ff; 
    if (moduleToBuild === 'drone') projectileColor = 0x00ffff; // Синий снаряд радара

    const projectile = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: projectileColor }));
    projectile.position.copy(startBase.position);
    scene.add(projectile);

    const startTime = performance.now();
    const duration = 1000;
    const travelDistance = startBase.position.distanceTo(targetPos);
    const maxHeight = Math.min(travelDistance * 0.2, 0.4);

    function animateFlight() {
        const elapsed = performance.now() - startTime;
        let t = elapsed / duration;
        
        if (t <= 1) {
            for (let b of bases) {
                if (b.type === 'aao' && b.isActive && b.owner !== startBase.owner) {
                    if (b.position.distanceTo(projectile.position) < AAO_RADIUS) {
                        b.isActive = false;
                        b.mesh.material.color.setHex(0x555555); 
                        explode(scene, bases, projectile.position, 0, 0.1, null, onGameOver); 
                        scene.remove(projectile);
                        if (onComplete) onComplete();
                        return; 
                    }
                }
            }

            const surfacePoint = new THREE.Vector3().copy(startBase.position).lerp(targetPos, t).normalize().multiplyScalar(PLANET_RADIUS);
            const heightOffset = Math.sin(t * Math.PI) * maxHeight;
            const norm = surfacePoint.clone().normalize();
            projectile.position.copy(surfacePoint).add(norm.multiplyScalar(heightOffset));
            requestAnimationFrame(animateFlight);
        } else {
            scene.remove(projectile);
            handleLanding(scene, bases, targetPos, startBase, moduleToBuild, sector, playerGenerators, onGeneratorBuilt, onGameOver); 
            if (onComplete) onComplete();
        }
    }
    animateFlight();
}

export function checkLineIntersection(bases, startPos, endPos) {
    const midPoint = startPos.clone().lerp(endPos, 0.5);
    const controlPoint = midPoint.clone().normalize().multiplyScalar(PLANET_RADIUS + 0.3);
    const newCurve = new THREE.QuadraticBezierCurve3(startPos, controlPoint, endPos);
    const newPoints = newCurve.getPoints(15);

    for (let b of bases) {
        if (!b.parent || !b.curve) continue; 
        const existingPoints = b.curve.getPoints(15);
        for (let p1 of newPoints) {
            for (let p2 of existingPoints) {
                if (p1.distanceTo(p2) < 0.12) return true;
            }
        }
    }
    return false;
}

function handleLanding(scene, bases, targetPos, parentBase, moduleToBuild, sector, playerGenerators, onGeneratorBuilt, onGameOver) {
    let domeInRange = bases.find(b => b.type === 'dome' && b.owner !== parentBase.owner && b.position.distanceTo(targetPos) < 0.35);

    if (domeInRange && !domeInRange.isDisabled) {
        if (moduleToBuild === 'bomb') domeInRange.shieldHits += 1;
        if (moduleToBuild === 'homing') domeInRange.shieldHits += 2;
        if (domeInRange.shieldHits >= 2) {
            domeInRange.isDisabled = true;
            if (domeInRange.domeMesh) domeInRange.domeMesh.visible = false;
        }
        explode(scene, bases, targetPos, 0, 0.1, null, onGameOver);
        return; 
    }

    if (moduleToBuild === 'bomb') { explode(scene, bases, targetPos, 25, 0.10, null, onGameOver); return; }
    if (moduleToBuild === 'homing') { explode(scene, bases, targetPos, 50, 0.20, null, onGameOver); return; }

    if (checkLineIntersection(bases, parentBase.position, targetPos)) {
        explode(scene, bases, targetPos, 25, 0.30, null, onGameOver); 
        return;
    }

    let collision = false;
    for (let b of bases) {
        if (b === parentBase) continue; 
        if (b.position.distanceTo(targetPos) < 0.15) {
            collision = true;
            explode(scene, bases, targetPos, 25, 0.30, null, onGameOver);
            b.hp -= 25; 
            if (b.hp <= 0) destroyBaseAndChain(scene, bases, b, onGameOver);
            break;
        }
    }

    if (!collision) {
        createNewBase(scene, bases, targetPos, parentBase, moduleToBuild, sector, playerGenerators, onGeneratorBuilt);
    }
}

export function explode(scene, bases, pos, damage, radius, owner, onGameOver) {
    const explosionGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const explosionMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 1 });
    const explosion = new THREE.Mesh(explosionGeo, explosionMat);
    
    const explosionCenter = pos.clone().normalize().multiplyScalar(PLANET_RADIUS);
    explosion.position.copy(explosionCenter);
    scene.add(explosion);

    let scale = 1;
    const interval = setInterval(() => {
        scale += 0.1;
        explosion.scale.set(scale, scale, scale);
        explosionMat.opacity -= 0.05;
        if (explosionMat.opacity <= 0) {
            clearInterval(interval);
            scene.remove(explosion);
        }
    }, 30);

    if (damage === 0) return; 

    const basesCopy = [...bases];
    for (let b of basesCopy) {
        if (b.position.distanceTo(explosionCenter) < radius) { 
            b.hp -= damage;
            showDamageText(scene, b.position, damage);
            if (b.hp <= 0) destroyBaseAndChain(scene, bases, b, onGameOver);
        }
    }
}

function showDamageText(scene, position, damage) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff0000'; 
    context.font = 'bold 40px Arial';
    context.textAlign = 'center';
    context.fillText(`-${damage}`, 64, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    
    const normal = position.clone().normalize();
    sprite.position.copy(position).add(normal.multiplyScalar(0.3));
    
    sprite.scale.set(0.5, 0.25, 1);
    scene.add(sprite);

    let life = 1;
    const animateText = () => {
        if (life <= 0) {
            scene.remove(sprite);
            return;
        }
        life -= 0.02;
        sprite.position.add(normal.clone().multiplyScalar(0.01)); 
        sprite.material.opacity = life;
        requestAnimationFrame(animateText);
    };
    animateText();
}
