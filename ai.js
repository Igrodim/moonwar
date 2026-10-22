import { canShoot, executeShot, checkLineIntersection } from './combat.js';
import { PLANET_RADIUS, VISION_RADIUS } from './entities.js';

export function playAITurn(gameContext) {
    const { scene, camera, controls, bases, currentPlayer, playerEnergy, playerGenerators, onTurnEnd, onGameOver, onGeneratorBuilt, updateFog } = gameContext;

    const minRoll = 5 + playerGenerators[currentPlayer];
    const maxRoll = 8 + playerGenerators[currentPlayer];
    const rolledEnergy = Math.floor(Math.random() * (maxRoll - minRoll + 1)) + minRoll;
    playerEnergy[currentPlayer] += rolledEnergy;
    
    if (gameContext.updateUI) gameContext.updateUI();

    const performAIAction = () => {
        if (playerEnergy[currentPlayer] < 1) {
            setTimeout(onTurnEnd, 1000);
            return;
        }

        let myBases = bases.filter(b => b.owner === currentPlayer && (b.type === 'hub' || b.type === 'relay'));
        if (myBases.length === 0) {
            setTimeout(onTurnEnd, 1000);
            return;
        }

        let startBase = myBases[Math.floor(Math.random() * myBases.length)];

        // 1. Поиск видимых врагов
        let visibleEnemies = [];
        for (let enemy of bases) {
            if (enemy.owner === currentPlayer) continue;
            for (let ally of myBases) {
                const radius = ally.visionRadius || VISION_RADIUS;
                if (ally.position.distanceTo(enemy.position) < radius) {
                    visibleEnemies.push(enemy);
                    break;
                }
            }
        }

        let module = 'bomb';
        let cost = 1;
        let bestAngle = 0;
        let allowed = false;
        let check;
        let targetBase = null;

        // 2. Логика: Атака или Расширение?
        if (visibleEnemies.length > 0) {
            targetBase = visibleEnemies.reduce((prev, curr) => {
                return (curr.position.distanceTo(startBase.position) < prev.position.distanceTo(startBase.position)) ? curr : prev;
            });

            const distToEnemy = startBase.position.distanceTo(targetBase.position);
            const maxRange = 10 * 0.15; 

            if (distToEnemy < maxRange) {
                if (playerEnergy[currentPlayer] >= 3) { module = 'homing'; cost = 3; }
                else { module = 'bomb'; cost = 1; }
            } else {
                if (playerEnergy[currentPlayer] >= 7) { module = 'relay'; cost = 7; }
                else { module = 'bomb'; cost = 1; }
            }
        } else {
            if (playerEnergy[currentPlayer] >= 7) {
                module = Math.random() > 0.3 ? 'relay' : 'generator'; 
                cost = 7;
            } else {
                module = 'bomb'; 
                cost = 1;
            }
        }

        // 3. Вычисление угла
        if (targetBase) {
            const normal = startBase.position.clone().normalize();
            const toEnemy = targetBase.position.clone().sub(startBase.position);
            const tangentDir = toEnemy.clone().sub(normal.clone().multiplyScalar(toEnemy.dot(normal))).normalize();
            
            let baseVector = new THREE.Vector3(1, 0, 0);
            if (Math.abs(normal.y) > 0.9) baseVector.set(0, 0, 1);
            let baseTangent = baseVector.cross(normal).normalize();
            
            let angleRad = Math.atan2(tangentDir.dot(new THREE.Vector3().crossVectors(normal, baseTangent)), tangentDir.dot(baseTangent));
            bestAngle = THREE.MathUtils.radToDeg(angleRad);
        } else {
            bestAngle = Math.random() * 360;
        }

        // 4. Поиск безопасного сектора
        for (let i = 0; i < 16; i++) {
            let testAngle = bestAngle + (i * 22.5);
            check = canShoot(bases, startBase, testAngle, module);
            
            if (check.allowed) {
                if (['relay', 'generator'].includes(module)) {
                    const normal = startBase.position.clone().normalize();
                    let baseVector = new THREE.Vector3(1, 0, 0);
                    if (Math.abs(normal.y) > 0.9) baseVector.set(0, 0, 1);
                    let tangent = baseVector.cross(normal).normalize();
                    tangent.applyAxisAngle(normal, THREE.MathUtils.degToRad(check.snappedAngle));
                    
                    const dist = 10 * 0.15;
                    const targetPos = startBase.position.clone().add(tangent.clone().multiplyScalar(dist)).normalize().multiplyScalar(PLANET_RADIUS);

                    if (!checkLineIntersection(bases, startBase.position, targetPos)) {
                        allowed = true;
                        bestAngle = check.snappedAngle;
                        break; 
                    }
                } else {
                    allowed = true;
                    bestAngle = check.snappedAngle;
                    break;
                }
            }
        }

        // 5. Выстрел / Постройка
        if (allowed && playerEnergy[currentPlayer] >= cost) {
            playerEnergy[currentPlayer] -= cost;
            if (gameContext.updateUI) gameContext.updateUI();

            camera.position.copy(startBase.position.clone().normalize().multiplyScalar(PLANET_RADIUS + 10));
            controls.target.copy(startBase.position);
            controls.update();

            let power = ['relay', 'generator'].includes(module) ? 10 : 8;

            executeShot(scene, bases, startBase, bestAngle, power, module, check.sector, playerGenerators, onGeneratorBuilt, onGameOver, () => {
                if (updateFog) updateFog(); 
                setTimeout(performAIAction, 1000); 
            });
        } else {
            setTimeout(onTurnEnd, 1000);
        }
    };

    setTimeout(() => {
        performAIAction();
    }, 1500);
}
