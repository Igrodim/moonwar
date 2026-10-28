import { PLANET_RADIUS, AAO_RADIUS, createNewBase, destroyBaseAndChain, updateHealthBar } from './entities.js';
import { projectilePool, explosionPool, damageTextPool } from './pool.js';

export function canShoot(bases, startBase, angle, moduleToBuild) {
    const ANGLE_STEP = 11.25; 
    const snappedAngle = Math.round(angle / ANGLE_STEP) * ANGLE_STEP;
    let sector = Math.round(snappedAngle / ANGLE_STEP) % 32;
    if (sector < 0) sector += 32; 

    const isBuildingModule = ['relay', 'dome', 'generator', 'aao', 'drone'].includes(moduleToBuild);
    if (isBuildingModule) {
        const existingBuild = bases.find(b => b.parent === startBase && b.sector === sector);
        if (existingBuild) return { allowed: false, reason: "В этом направлении уже построен модуль!" };
    }
    return { allowed: true, snappedAngle: snappedAngle, sector: sector };
}

export function executeShot(scene, bases, startBase, angle, powerValue, moduleToBuild, sector, playerGenerators, onGeneratorBuilt, onGameOver, onComplete, playerId, VISION_RADIUS, speedMultiplier = 1) {
    const normal = startBase.position.clone().normalize();
    let baseVector = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.y) > 0.9) baseVector.set(0, 0, 1);
    let tangent = baseVector.cross(normal).normalize();
    tangent.applyAxisAngle(normal, THREE.MathUtils.degToRad(angle));
    
    const distance = 0.3 + powerValue * 0.15;
    const targetPos = startBase.position.clone().add(tangent.clone().multiplyScalar(distance)).normalize().multiplyScalar(PLANET_RADIUS);

    if (speedMultiplier >= 100) {
        handleLanding(scene, bases, targetPos, startBase, moduleToBuild, sector, playerGenerators, onGeneratorBuilt, onGameOver); 
        if (onComplete) onComplete();
        return;
    }

    let projectileColor = 0xffaa00;
    if (moduleToBuild === 'bomb') projectileColor = 0xff0000;
    if (moduleToBuild === 'homing') projectileColor = 0xff00ff; 
    if (moduleToBuild === 'drone') projectileColor = 0x00ffff; 

    const projectile = projectilePool.get();
    projectile.visible = true;
    projectile.material.color.setHex(projectileColor);
    projectile.position.copy(startBase.position);
    scene.add(projectile);

    const startTime = performance.now();
    const duration = 1000 / speedMultiplier; 
    
    const travelDistance = startBase.position.distanceTo(targetPos);
    const maxHeight = Math.min(travelDistance * 0.2, 0.4);
    const midPoint = startBase.position.clone().lerp(targetPos, 0.5);
    const controlPoint = midPoint.clone().normalize().multiplyScalar(PLANET_RADIUS + maxHeight);
    const flightCurve = new THREE.QuadraticBezierCurve3(startBase.position, controlPoint, targetPos);

    function animateFlight() {
        const elapsed = performance.now() - startTime;
        let t = elapsed / duration;
        
        if (t <= 1) {
            if (startBase.owner !== 1) {
                let visible = false;
                for (let b of bases) {
                    if (b.owner === 1 && b.position.distanceTo(projectile.position) < (b.visionRadius || VISION_RADIUS)) { visible = true; break; }
                }
                projectile.visible = visible;
            } else { projectile.visible = true; }

            for (let b of bases) {
                if (b.type === 'aao' && b.isActive && b.owner !== startBase.owner) {
                    if (b.position.distanceTo(projectile.position) < AAO_RADIUS) {
                        b.isActive = false;
                        b.mesh.material.color.setHex(0x555555); 
                        explode(scene, bases, projectile.position, 0, 0.1, null, onGameOver); 
                        projectilePool.release(projectile); 
                        if (onComplete) onComplete();
                        return; 
                    }
                }
            }
            projectile.position.copy(flightCurve.getPoint(t));
            requestAnimationFrame(animateFlight);
        } else {
            projectilePool.release(projectile); 
            handleLanding(scene, bases, targetPos, startBase, moduleToBuild, sector, playerGenerators, onGeneratorBuilt, onGameOver); 
            if (onComplete) onComplete();
        }
    }
    animateFlight();
}

export function checkLineIntersection(bases, startPos, endPos, parentBase) {
    const midPoint = startPos.clone().lerp(endPos, 0.5);
    const controlPoint = midPoint.clone().normalize().multiplyScalar(PLANET_RADIUS + 0.3);
    const newCurve = new THREE.QuadraticBezierCurve3(startPos, controlPoint, endPos);
    const newPoints = newCurve.getPoints(20);

    for (let b of bases) {
        if (!b.parent || !b.curve) continue; 
        if (b.parent === parentBase) continue; 
        const existingPoints = b.curve.getPoints(20);
        for (let p1 of newPoints) {
            if (p1.distanceTo(startPos) < 0.25) continue; 
            for (let p2 of existingPoints) {
                if (p2.distanceTo(startPos) < 0.25) continue; 
                if (p1.distanceTo(p2) < 0.06) return true;
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

    if (moduleToBuild === 'bomb') { explode(scene, bases, targetPos, 25, 0.20, null, onGameOver); return; }
    if (moduleToBuild === 'homing') { explode(scene, bases, targetPos, 50, 0.30, null, onGameOver); return; }

    if (checkLineIntersection(bases, parentBase.position, targetPos, parentBase)) {
        explode(scene, bases, targetPos, 25, 0.30, null, onGameOver); 
        return;
    }

    let collision = false;
    for (let b of bases) {
        if (b === parentBase) continue; 
        if (b.position.distanceTo(targetPos) < 0.2) { 
            collision = true;
            explode(scene, bases, targetPos, 25, 0.30, null, onGameOver);
            b.hp -= 25; 
            updateHealthBar(b);
            if (b.hp <= 0) destroyBaseAndChain(scene, bases, b, onGameOver);
            break;
        }
    }

    if (!collision) { createNewBase(scene, bases, targetPos, parentBase, moduleToBuild, sector, playerGenerators, onGeneratorBuilt); }
}

export function explode(scene, bases, pos, damage, radius, owner, onGameOver) {
    const explosion = explosionPool.get();
    explosion.visible = true;
    explosion.scale.set(1, 1, 1);
    explosion.material.opacity = 1;
    
    const explosionCenter = pos.clone().normalize().multiplyScalar(PLANET_RADIUS);
    explosion.position.copy(explosionCenter);
    scene.add(explosion);

    const startTime = performance.now();
    const duration = 600;

    function animateExplosion() {
        const elapsed = performance.now() - startTime;
        const t = elapsed / duration;

        if (t >= 1) {
            explosionPool.release(explosion); 
            return;
        }
        const scale = 1 + t * 3;
        explosion.scale.set(scale, scale, scale);
        explosion.material.opacity = 1 - t;
        requestAnimationFrame(animateExplosion);
    }
    animateExplosion();

    if (damage === 0) return; 
    const basesCopy = [...bases];
    for (let b of basesCopy) {
        if (b.position.distanceTo(explosionCenter) < radius) { 
            b.hp -= damage;
            updateHealthBar(b);
            showDamageText(scene, b.position, damage);
            if (b.hp <= 0) destroyBaseAndChain(scene, bases, b, onGameOver);
        }
    }
}

function showDamageText(scene, position, damage) {
    const sprite = damageTextPool.get();
    sprite.visible = true;
    sprite.userData.life = 1;
    
    const ctx = sprite.userData.ctx;
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = '#ff0000'; 
    ctx.font = 'bold 40px Arial'; 
    ctx.textAlign = 'center';
    ctx.fillText(`-${damage}`, 64, 40);
    sprite.userData.tex.needsUpdate = true;
    
    const normal = position.clone().normalize();
    sprite.position.copy(position).add(normal.multiplyScalar(0.3));
    sprite.scale.set(0.5, 0.25, 1);
    sprite.material.opacity = 1;
    scene.add(sprite);

    const animateText = () => {
        if (sprite.userData.life <= 0) {
            damageTextPool.release(sprite);
            return;
        }
        sprite.userData.life -= 0.02;
        sprite.position.add(normal.clone().multiplyScalar(0.01)); 
        sprite.material.opacity = sprite.userData.life;
        requestAnimationFrame(animateText);
    };
    animateText();
}
