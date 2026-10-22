import { canShoot, executeShot } from './combat.js';

export function playAITurn(gameContext) {
    const { scene, camera, controls, bases, currentPlayer, playerEnergy, playerGenerators, PLANET_RADIUS, onTurnEnd, onGameOver, onGeneratorBuilt } = gameContext;

    // Крутим энергию
    const minRoll = 5 + playerGenerators[currentPlayer];
    const maxRoll = 8 + playerGenerators[currentPlayer];
    const rolledEnergy = Math.floor(Math.random() * (maxRoll - minRoll + 1)) + minRoll;
    playerEnergy[currentPlayer] += rolledEnergy;
    if (gameContext.updateUI) gameContext.updateUI();

    // Функция выполнения одного шага ИИ
    const performAIAction = () => {
        // 1. Ищем свою базу для стрельбы (Хаб или Реле)
        let myBases = bases.filter(b => b.owner === currentPlayer && (b.type === 'hub' || b.type === 'relay'));
        if (myBases.length === 0) return false;

        let startBase = myBases[Math.floor(Math.random() * myBases.length)];

        // 2. Ищем цель (главную базу врага)
        let enemyHubs = bases.filter(b => b.owner !== currentPlayer && b.type === 'hub');
        let targetBase = enemyHubs.length > 0 ? enemyHubs[0] : null;

        // Определяем, что строить
        let module = 'bomb';
        let cost = 1;
        
        // Если энергии много и есть враг - бьем ракетой
        if (playerEnergy[currentPlayer] >= 3 && Math.random() > 0.5 && targetBase) {
            module = 'homing'; cost = 3;
        } else if (playerEnergy[currentPlayer] >= 7 && Math.random() > 0.7) {
            // Строим реле для расширения или генератор
            module = Math.random() > 0.5 ? 'relay' : 'generator'; cost = 7;
        }

        if (playerEnergy[currentPlayer] < cost) {
            // Если на это не хватает, пробуем бомбу
            module = 'bomb'; cost = 1;
            if (playerEnergy[currentPlayer] < 1) return false; // Совсем нет энергии
        }

        // Ищем угол
        let bestAngle = 0;
        let check;

        if (targetBase && (module === 'bomb' || module === 'homing')) {
            // Целимся во врага
            const normal = startBase.position.clone().normalize();
            const toEnemy = targetBase.position.clone().sub(startBase.position);
            // Проецируем вектор на касательную плоскость
            const tangentDir = toEnemy.clone().sub(normal.clone().multiplyScalar(toEnemy.dot(normal))).normalize();
            
            // Вычисляем угол (приблизительно)
            let baseVector = new THREE.Vector3(1, 0, 0);
            if (Math.abs(normal.y) > 0.9) baseVector.set(0, 0, 1);
            let baseTangent = baseVector.cross(normal).normalize();
            
            let angleRad = Math.atan2(tangentDir.dot(new THREE.Vector3().crossVectors(normal, baseTangent)), tangentDir.dot(baseTangent));
            bestAngle = THREE.MathUtils.radToDeg(angleRad);
        } else {
            // Строим в случайную сторону
            bestAngle = Math.floor(Math.random() * 16) * 22.5;
        }

        // Ищем свободный сектор (до 10 попыток)
        let allowed = false;
        for (let i = 0; i < 10; i++) {
            check = canShoot(bases, startBase, bestAngle, module);
            if (check.allowed) { allowed = true; break; }
            bestAngle += 22.5; // Сдвигаем угол, если занято
        }

        if (allowed) {
            playerEnergy[currentPlayer] -= cost;
            if (gameContext.updateUI) gameContext.updateUI();

            camera.position.copy(startBase.position.clone().normalize().multiplyScalar(PLANET_RADIUS + 10));
            controls.target.copy(startBase.position);
            controls.update();

            // Если бьем по врагу, берем максимальную силу
            let randomPower = (module === 'bomb' || module === 'homing') ? 10 : (Math.random() * 6 + 2);

            executeShot(scene, bases, startBase, check.snappedAngle, randomPower, module, check.sector, playerGenerators, onGeneratorBuilt, onGameOver, () => {
                // После выстрела ИИ проверяет, осталась ли энергия, и если да - делает еще один ход
                setTimeout(() => {
                    if (playerEnergy[currentPlayer] >= 1) {
                        performAIAction();
                    } else {
                        setTimeout(onTurnEnd, 1000);
                    }
                }, 1000);
            });
            return true;
        }
        return false;
    };

    // Запускаем первый шаг ИИ
    setTimeout(() => {
        if (!performAIAction()) {
            // Если ИИ не смог ничего сделать, передаем ход
            setTimeout(onTurnEnd, 1000);
        }
    }, 1500);
}
