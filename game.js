const PLANET_RADIUS = 10;
const BASE_HEIGHT = 0.1; 

let scene, camera, controls;
let bases = [];
let selectedBase = null;
let currentAngle = 0;
let isCharging = false;
let power = 0;
let powerInterval = null;
const maxPower = 10;
let currentDirection = new THREE.Vector3(1, 0, 0);
let arrowHelper;

let currentPlayer = 1;
let totalPlayers = 2; 
let playerEnergy = {}; 
let playerGenerators = {}; 
let hasSpunThisTurn = false; 
let selectedModuleType = null; 
let gameOver = false;
let isAITurn = false;

const playerColors = [0x00aaff, 0xff0000, 0x00ff00, 0xffff00, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff];

const DOME_RADIUS = 0.35; 
const AAO_RADIUS = 0.35; 
const ANGLE_STEP = 22.5; 

function getGeometry(type) {
    if (type === 'aao') {
        return new THREE.CylinderGeometry(0.06, 0.06, BASE_HEIGHT, 3);
    } else if (type === 'generator') {
        return new THREE.BoxGeometry(0.08, BASE_HEIGHT, 0.08);
    } else {
        return new THREE.CylinderGeometry(0.05, 0.05, BASE_HEIGHT, 16);
    }
}

export function initGame(_scene, _camera, _controls) {
    scene = _scene;
    camera = _camera;
    controls = _controls;

    setupUI();
    setupRaycaster();
    
    document.getElementById('start-btn').addEventListener('click', () => {
        const aiCount = parseInt(document.getElementById('ai-count').value) || 1;
        totalPlayers = 1 + aiCount;
        
        for (let i = 1; i <= totalPlayers; i++) {
            playerEnergy[i] = 0;
            playerGenerators[i] = 0;
        }

        document.getElementById('start-screen').style.display = 'none';
        startGame();
    });
}

function setupUI() {
    const powerBar = document.getElementById('power-bar');
    const btnLeft = document.getElementById('turn-left');
    const btnRight = document.getElementById('turn-right');
    const fireBtn = document.getElementById('fire-btn');
    const spinBtn = document.getElementById('spin-btn');
    const endTurnBtn = document.getElementById('end-turn-btn');
    const moduleBtns = document.querySelectorAll('.module-btn');

    arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 0.6, 0xffff00, 0.15, 0.1);
    arrowHelper.visible = false;
    scene.add(arrowHelper);

    spinBtn.addEventListener('click', () => {
        if (hasSpunThisTurn || gameOver || isAITurn) return;
        spinEnergy();
    });

    moduleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (isAITurn) return;
            moduleBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedModuleType = btn.getAttribute('data-type');
            
            if (selectedModuleType === 'heal') {
                document.getElementById('ui-panel').style.display = 'none';
                arrowHelper.visible = false;
            }
        });
    });

    endTurnBtn.addEventListener('click', () => {
        if (gameOver || isAITurn) return;
        endTurn();
    });

    btnLeft.addEventListener('click', () => { if (selectedBase && !isAITurn) { currentAngle += ANGLE_STEP; updateArrowDirection(); } });
    btnRight.addEventListener('click', () => { if (selectedBase && !isAITurn) { currentAngle -= ANGLE_STEP; updateArrowDirection(); } });

    fireBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!selectedBase || gameOver || isAITurn) return;
        
        if (!selectedModuleType) {
            alert("Сначала выберите модуль внизу!");
            return;
        }

        const cost = getModuleCost(selectedModuleType);
        if (playerEnergy[currentPlayer] < cost) { alert("Не хватает энергии!"); return; }
        
        isCharging = true;
        power = 0;
        powerBar.style.width = '0%';
        powerInterval = setInterval(() => {
            if (power < maxPower) {
                power += 0.2;
                powerBar.style.width = (power / maxPower) * 100 + '%';
            }
        }, 50);
    });

    window.addEventListener('pointerup', () => {
        if (isCharging) {
            isCharging = false;
            clearInterval(powerInterval);
            powerBar.style.width = '0%';
            
            const cost = getModuleCost(selectedModuleType);
            if (power > 0 && playerEnergy[currentPlayer] >= cost) {
                
                // ПРОВЕРКА ДО СПИСАНИЯ ЭНЕРГИИ
                const check = canShoot(selectedBase, currentAngle, selectedModuleType);
                if (!check.allowed) {
                    alert(check.reason);
                    return; // Выходим, энергия не списывается
                }

                playerEnergy[currentPlayer] -= cost;
                updateUI();
                
                // Передаем вычисленный угол и сектор в функцию выстрела
                executeShot(selectedBase, check.snappedAngle, power, selectedModuleType, check.sector, () => {});
            } else if (power > 0) {
                alert("Не хватает энергии!");
            }
        }
    });
}

// НОВАЯ ФУНКЦИЯ ПРОВЕРКИ
function canShoot(startBase, angle, moduleToBuild) {
    const snappedAngle = Math.round(angle / ANGLE_STEP) * ANGLE_STEP;
    let sector = Math.round(snappedAngle / ANGLE_STEP) % 16;
    if (sector < 0) sector += 16; 

    const isBuildingModule = ['relay', 'dome', 'generator', 'aao'].includes(moduleToBuild);
    
    if (isBuildingModule) {
        const existingBuild = bases.find(b => b.parent === startBase && b.sector === sector);
        if (existingBuild) {
            return { allowed: false, reason: "В этом направлении уже построен модуль! Выберите другое." };
        }
    }
    return { allowed: true, snappedAngle: snappedAngle, sector: sector };
}

function spinEnergy() {
    const minRoll = 5 + playerGenerators[currentPlayer];
    const maxRoll = 8 + playerGenerators[currentPlayer];
    const rolledEnergy = Math.floor(Math.random() * (maxRoll - minRoll + 1)) + minRoll;
    
    playerEnergy[currentPlayer] += rolledEnergy;
    hasSpunThisTurn = true;
    const spinBtn = document.getElementById('spin-btn');
    spinBtn.disabled = true;
    spinBtn.innerText = `+${rolledEnergy}`;
    setTimeout(() => { spinBtn.innerText = 'КРУТИТЬ'; }, 1000);
    updateUI();
    return rolledEnergy;
}

function endTurn() {
    if (gameOver) return;
    
    bases.forEach(b => {
        if (b.type === 'dome') {
            b.shieldHits = 0;
            b.isDisabled = false;
            if (b.domeMesh) b.domeMesh.visible = true;
        }
        if (b.type === 'aao') {
            b.isActive = true;
            b.mesh.material.color.setHex(playerColors[b.owner - 1]); 
        }
    });

    currentPlayer++;
    if (currentPlayer > totalPlayers) currentPlayer = 1;

    hasSpunThisTurn = false;
    selectedModuleType = null;
    document.querySelectorAll('.module-btn').forEach(b => b.classList.remove('selected'));
    selectedBase = null;
    document.getElementById('ui-panel').style.display = 'none';
    arrowHelper.visible = false;
    
    const spinBtn = document.getElementById('spin-btn');
    spinBtn.disabled = false;
    spinBtn.innerText = 'КРУТИТЬ';

    updateUI();

    if (currentPlayer > 1) {
        isAITurn = true;
        document.getElementById('bottom-panel').style.pointerEvents = 'none';
        document.getElementById('bottom-panel').style.opacity = '0.5';
        setTimeout(playAITurn, 1500);
    } else {
        isAITurn = false;
        document.getElementById('bottom-panel').style.pointerEvents = 'auto';
        document.getElementById('bottom-panel').style.opacity = '1';
        let hub = bases.find(b => b.owner === 1 && b.type === 'hub');
        if (hub) {
            camera.position.copy(hub.position.clone().normalize().multiplyScalar(PLANET_RADIUS + 10));
            controls.target.copy(hub.position);
            controls.update();
        }
    }
}

function playAITurn() {
    if (gameOver) return;
    spinEnergy();
    
    setTimeout(() => {
        let myBases = bases.filter(b => b.owner === currentPlayer && (b.type === 'hub' || b.type === 'relay'));
        
        if (myBases.length > 0) {
            let startBase = myBases[Math.floor(Math.random() * myBases.length)];
            let module = Math.random() > 0.3 ? 'relay' : 'bomb'; 
            let cost = getModuleCost(module);
            
            if (playerEnergy[currentPlayer] >= cost) {
                
                // ИИ пробует найти свободный угол (до 10 попыток)
                let randomAngle;
                let check;
                let allowed = false;
                
                for (let i = 0; i < 10; i++) {
                    randomAngle = Math.floor(Math.random() * 16) * ANGLE_STEP;
                    check = canShoot(startBase, randomAngle, module);
                    if (check.allowed) {
                        allowed = true;
                        break;
                    }
                }

                if (allowed) {
                    playerEnergy[currentPlayer] -= cost;
                    updateUI();
                    
                    let randomPower = Math.random() * 8 + 2; 
                    
                    camera.position.copy(startBase.position.clone().normalize().multiplyScalar(PLANET_RADIUS + 10));
                    controls.target.copy(startBase.position);
                    controls.update();
                    
                    executeShot(startBase, check.snappedAngle, randomPower, module, check.sector, () => {
                        setTimeout(endTurn, 1000); 
                    });
                    return;
                }
            }
        }
        setTimeout(endTurn, 1000);
    }, 1500);
}

function getModuleCost(type) {
    if (['bomb', 'heal', 'drone'].includes(type)) return 1;
    if (['aao', 'homing'].includes(type)) return 3;
    if (['relay', 'dome', 'generator'].includes(type)) return 7;
    return 0;
}

function updateUI() {
    document.getElementById('turn-text').innerText = `Ход: Игрок ${currentPlayer}`;
    document.getElementById('energy-text').innerText = `Энергия: ${playerEnergy[currentPlayer]}`;
    document.getElementById('turn-text').style.color = '#' + playerColors[currentPlayer - 1].toString(16).padStart(6, '0');
    arrowHelper.setColor(playerColors[currentPlayer - 1]);
}

function startGame() {
    let positions = [];

    for (let p = 1; p <= totalPlayers; p++) {
        let pos;
        let valid = false;
        while (!valid) {
            pos = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(PLANET_RADIUS);
            valid = true;
            for (let existingPos of positions) {
                if (pos.angleTo(existingPos) < Math.PI / 3) { 
                    valid = false;
                    break;
                }
            }
        }
        positions.push(pos);

        const hub = new THREE.Mesh(getGeometry('hub'), new THREE.MeshBasicMaterial({ color: playerColors[p - 1] }));
        layFlatOnSphere(hub, pos);
        scene.add(hub);
        
        let baseObj = { mesh: hub, position: pos, owner: p, hp: 100, maxHp: 100, type: 'hub', parent: null, sector: -1, lineMesh: null };
        
        if (p === 1) {
            camera.position.copy(pos.clone().normalize().multiplyScalar(PLANET_RADIUS + 10));
            controls.target.copy(pos);
            controls.update();
            selectedBase = baseObj;
            document.getElementById('ui-panel').style.display = 'block';
            arrowHelper.position.copy(pos);
            currentAngle = 0;
            updateArrowDirection();
            arrowHelper.visible = true;
        }
        
        bases.push(baseObj);
    }
    updateUI();
}

function layFlatOnSphere(mesh, position) {
    const normal = position.clone().normalize();
    const offsetPos = normal.clone().multiplyScalar(PLANET_RADIUS + (BASE_HEIGHT / 2));
    
    mesh.position.copy(offsetPos);
    const up = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(up, normal);
}

function setupRaycaster() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('pointerdown', (event) => {
        if (isAITurn || gameOver) return;
        if (event.target.closest('#bottom-panel') || event.target.closest('#ui-panel') || event.target.closest('#start-screen')) return;

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const baseMeshes = bases.map(b => b.mesh);
        const intersects = raycaster.intersectObjects(baseMeshes);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const clickedBase = bases.find(b => b.mesh === clickedMesh);
            
            if (selectedModuleType === 'heal') {
                if (clickedBase.owner === currentPlayer && playerEnergy[currentPlayer] >= 1) {
                    clickedBase.hp = Math.min(clickedBase.maxHp, clickedBase.hp + 25);
                    playerEnergy[currentPlayer] -= 1;
                    updateUI();
                    alert(`База вылечена! HP: ${clickedBase.hp}`);
                } else if (clickedBase.owner !== currentPlayer) {
                    alert("Нельзя лечить базу противника!");
                } else {
                    alert("Не хватает энергии!");
                }
                return;
            }

            if (clickedBase.owner !== currentPlayer) {
                alert("Это база противника!");
                return;
            }

            if (clickedBase.type !== 'hub' && clickedBase.type !== 'relay') {
                alert("С этого модуля нельзя стрелять! Только с Главного Хаба или Базы-реле.");
                return;
            }

            selectedBase = clickedBase;
            controls.target.copy(selectedBase.position);
            document.getElementById('ui-panel').style.display = 'block';
            arrowHelper.position.copy(selectedBase.position);
            currentAngle = 0;
            updateArrowDirection();
            arrowHelper.visible = true;
        } else {
            selectedBase = null;
            document.getElementById('ui-panel').style.display = 'none';
            arrowHelper.visible = false;
        }
    });
}

function updateArrowDirection() {
    if (!selectedBase) return;
    const normal = selectedBase.position.clone().normalize();
    let baseVector = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.y) > 0.9) baseVector.set(0, 0, 1);
    let tangent = baseVector.cross(normal).normalize();
    tangent.applyAxisAngle(normal, THREE.MathUtils.degToRad(currentAngle));
    currentDirection.copy(tangent);
    arrowHelper.setDirection(currentDirection);
}

// ИЗМЕНЕНО: Принимает точный угол и сектор
function executeShot(startBase, angle, powerValue, moduleToBuild, sector, onComplete) {
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
    if (moduleToBuild === 'drone') projectileColor = 0x00ffff; 

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
                        explode(projectile.position, 0, 0.1); 
                        scene.remove(projectile);
                        console.log("Снаряд сбит ПВО!");
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
            handleLanding(targetPos, startBase, moduleToBuild, sector); 
            if (onComplete) onComplete();
        }
    }
    animateFlight();
}

function handleLanding(targetPos, parentBase, moduleToBuild, sector) {
    let domeInRange = bases.find(b => b.type === 'dome' && b.owner !== parentBase.owner && b.position.distanceTo(targetPos) < DOME_RADIUS);

    if (domeInRange && !domeInRange.isDisabled) {
        if (moduleToBuild === 'bomb') domeInRange.shieldHits += 1;
        if (moduleToBuild === 'homing') domeInRange.shieldHits += 2;

        if (domeInRange.shieldHits >= 2) {
            domeInRange.isDisabled = true;
            if (domeInRange.domeMesh) domeInRange.domeMesh.visible = false;
            console.log("Купол отключен!");
        }
        
        explode(targetPos, 0, 0.1);
        return; 
    }

    if (moduleToBuild === 'bomb') { explode(targetPos, 25, 0.10); return; }
    if (moduleToBuild === 'homing') { explode(targetPos, 50, 0.20); return; }
    if (moduleToBuild === 'drone') { console.log("Дрон разведал!"); return; }

    let collision = false;
    for (let b of bases) {
        if (b === parentBase) continue; 
        if (b.position.distanceTo(targetPos) < 0.15) {
            collision = true;
            explode(targetPos, 25, 0.10);
            b.hp -= 25; 
            if (b.hp <= 0) destroyBaseAndChain(b);
            break;
        }
    }

    if (!collision) {
        createNewBase(targetPos, parentBase, moduleToBuild, sector); 
    }
}

function createNewBase(pos, parentBase, moduleType, sector) {
    const playerColor = playerColors[parentBase.owner - 1];
    let newBaseColor = playerColor;
    
    if (moduleType === 'generator') newBaseColor = 0x00ff00; 
    if (moduleType === 'dome') newBaseColor = 0xffff00; 
    if (moduleType === 'aao') newBaseColor = 0xff00ff; 

    const newBase = new THREE.Mesh(getGeometry(moduleType), new THREE.MeshBasicMaterial({ color: newBaseColor }));
    layFlatOnSphere(newBase, pos);
    scene.add(newBase);
    
    const lineMesh = createEnergyLine(parentBase.position, pos, parentBase.owner);

    const baseObj = { 
        mesh: newBase, 
        position: pos.clone(), 
        owner: parentBase.owner, 
        hp: 100, 
        maxHp: 100, 
        type: moduleType, 
        parent: parentBase, 
        sector: sector, 
        lineMesh: lineMesh
    };
    
    if (moduleType === 'dome') {
        baseObj.shieldHits = 0;
        baseObj.isDisabled = false;
    }
    if (moduleType === 'aao') {
        baseObj.isActive = true;
    }

    bases.push(baseObj);

    if (moduleType === 'generator') {
        playerGenerators[parentBase.owner]++;
        if (parentBase.owner === 1) alert(`Генератор! Твоя выработка: от ${5 + playerGenerators[1]} до ${8 + playerGenerators[1]}`);
    }
    
    if (moduleType === 'dome') {
        const domeGeo = new THREE.SphereGeometry(DOME_RADIUS, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
        const domeMesh = new THREE.Mesh(domeGeo, domeMat);
        
        const normal = pos.clone().normalize();
        domeMesh.position.copy(normal.clone().multiplyScalar(PLANET_RADIUS + (BASE_HEIGHT / 2)));
        
        const up = new THREE.Vector3(0, 1, 0);
        domeMesh.quaternion.setFromUnitVectors(up, normal);
        scene.add(domeMesh);
        baseObj.domeMesh = domeMesh; 
    }
}

function destroyBaseAndChain(base) {
    console.log(`Уничтожена база типа ${base.type} Игрока ${base.owner}`);

    const children = bases.filter(b => b.parent === base);
    children.forEach(child => destroyBaseAndChain(child));

    scene.remove(base.mesh);
    if (base.lineMesh) scene.remove(base.lineMesh);
    if (base.domeMesh) scene.remove(base.domeMesh); 
    
    bases = bases.filter(b => b !== base);

    if (base.type === 'hub') {
        gameOver = true;
        alert(`ИГРА ОКОНЧЕНА! Победил Игрок ${base.owner === 1 ? '2 (ИИ)' : '1'}!`);
        setTimeout(() => { location.reload(); }, 3000);
    }
}

function explode(pos, damage, radius) {
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
            if (b.owner === 1) alert(`Попадание! Урон: ${damage}. HP базы: ${b.hp}`);
            if (b.hp <= 0) {
                destroyBaseAndChain(b);
            }
        }
    }
}

function createEnergyLine(startPos, endPos, owner) {
    const midPoint = startPos.clone().lerp(endPos, 0.5);
    const controlPoint = midPoint.clone().normalize().multiplyScalar(PLANET_RADIUS + 0.3);
    const curve = new THREE.QuadraticBezierCurve3(startPos, controlPoint, endPos);
    const tubeGeometry = new THREE.TubeGeometry(curve, 20, 0.008, 8, false);
    const color = playerColors[owner - 1];
    const tubeMaterial = new THREE.MeshBasicMaterial({ color: color });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    scene.add(tube);
    return tube;
}
