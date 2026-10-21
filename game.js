const PLANET_RADIUS = 10;

let scene, camera, controls;
let bases = [];
let selectedBase = null;
let currentAngle = 0;
let isCharging = false;
let power = 0;
let powerInterval = null;
const maxPower = 10;
let currentDirection = new THREE.Vector3(1, 0, 0);
const baseGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16);
let arrowHelper;

let currentPlayer = 1;
let playerEnergy = { 1: 0, 2: 0 }; 
let playerGenerators = { 1: 0, 2: 0 }; 
let hasSpunThisTurn = false; 
let selectedModuleType = null; 

export function initGame(_scene, _camera, _controls) {
    scene = _scene;
    camera = _camera;
    controls = _controls;

    setupUI();
    createMainBase();
    setupRaycaster();
    updateUI();
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

    // Логика колеса выработки
    spinBtn.addEventListener('click', () => {
        if (hasSpunThisTurn) return;
        
        const minRoll = 1 + playerGenerators[currentPlayer];
        const maxRoll = 10 + playerGenerators[currentPlayer];
        const rolledEnergy = Math.floor(Math.random() * (maxRoll - minRoll + 1)) + minRoll;
        
        playerEnergy[currentPlayer] += rolledEnergy;
        hasSpunThisTurn = true;
        spinBtn.disabled = true;
        spinBtn.innerText = `+${rolledEnergy}`;
        setTimeout(() => { spinBtn.innerText = 'КРУТИТЬ'; }, 1000);
        updateUI();
    });

    moduleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
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
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        hasSpunThisTurn = false;
        spinBtn.disabled = false;
        selectedModuleType = null;
        moduleBtns.forEach(b => b.classList.remove('selected'));
        selectedBase = null;
        document.getElementById('ui-panel').style.display = 'none';
        arrowHelper.visible = false;
        updateUI();
    });

    btnLeft.addEventListener('click', () => { if (selectedBase) { currentAngle += 15; updateArrowDirection(); } });
    btnRight.addEventListener('click', () => { if (selectedBase) { currentAngle -= 15; updateArrowDirection(); } });

    fireBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!selectedBase) return;
        
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
                playerEnergy[currentPlayer] -= cost;
                updateUI();
                shootBase();
            } else if (power > 0) {
                alert("Не хватает энергии!");
            }
        }
    });
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
    document.getElementById('turn-text').style.color = currentPlayer === 1 ? '#00aaff' : '#ff0000';
    arrowHelper.setColor(currentPlayer === 1 ? 0x00ffff : 0xff0000);
}

function createMainBase() {
    const mainHub = new THREE.Mesh(baseGeometry, new THREE.MeshBasicMaterial({ color: 0x00aaff }));
    const hubPos = new THREE.Vector3(0, PLANET_RADIUS, 0);
    layFlatOnSphere(mainHub, hubPos);
    scene.add(mainHub);
    bases.push({ mesh: mainHub, position: hubPos, owner: 1, hp: 100, maxHp: 100, type: 'hub' });
}

function layFlatOnSphere(mesh, position) {
    mesh.position.copy(position);
    const normal = position.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(up, normal);
}

function setupRaycaster() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('pointerdown', (event) => {
        if (event.target.closest('#bottom-panel') || event.target.closest('#ui-panel')) return;

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const baseMeshes = bases.map(b => b.mesh);
        const intersects = raycaster.intersectObjects(baseMeshes);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const clickedBase = bases.find(b => b.mesh === clickedMesh);
            
            // ЛЕЧИЛКА
            if (selectedModuleType === 'heal') {
                if (clickedBase.owner === currentPlayer && playerEnergy[currentPlayer] >= 1) {
                    clickedBase.hp = Math.min(clickedBase.maxHp, clickedBase.hp + 25);
                    playerEnergy[currentPlayer] -= 1;
                    updateUI();
                    alert(`База вылечена! Текущее HP: ${clickedBase.hp}`);
                } else if (clickedBase.owner !== currentPlayer) {
                    alert("Нельзя лечить базу противника!");
                } else {
                    alert("Не хватает энергии!");
                }
                return;
            }

            // ВЫБОР БАЗЫ ДЛЯ СТРЕЛЬБЫ
            if (clickedBase.owner !== currentPlayer) {
                alert("Это база противника!");
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

function shootBase() {
    const distance = power * 0.15;
    const targetPos = selectedBase.position.clone().add(currentDirection.clone().multiplyScalar(distance)).normalize().multiplyScalar(PLANET_RADIUS);

    const projectileColor = selectedModuleType === 'bomb' ? 0xff0000 : 0xffaa00;
    const projectile = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: projectileColor }));
    projectile.position.copy(selectedBase.position);
    scene.add(projectile);

    const startPos = selectedBase.position.clone();
    const startTime = performance.now();
    const duration = 1000;
    const travelDistance = startPos.distanceTo(targetPos);
    const maxHeight = Math.min(travelDistance * 0.2, 0.4);

    const moduleToBuild = selectedModuleType; 

    function animateFlight() {
        const elapsed = performance.now() - startTime;
        let t = elapsed / duration;
        if (t <= 1) {
            const surfacePoint = new THREE.Vector3().copy(startPos).lerp(targetPos, t).normalize().multiplyScalar(PLANET_RADIUS);
            const heightOffset = Math.sin(t * Math.PI) * maxHeight;
            const normal = surfacePoint.clone().normalize();
            projectile.position.copy(surfacePoint).add(normal.multiplyScalar(heightOffset));
            requestAnimationFrame(animateFlight);
        } else {
            scene.remove(projectile);
            
            // ЕСЛИ ЭТО БОМБА - ВЗРЫВАЕМ
            if (moduleToBuild === 'bomb') {
                explode(targetPos, 50); // Бомба наносит 50 урона
                return;
            }

            // ЕСЛИ ЭТО МОДУЛЬ - ПРОВЕРЯЕМ КОЛЛИЗИИ
            let collision = false;
            for (let b of bases) {
                // Если расстояние между центрами баз меньше 0.4 - они пересекаются
                if (b.position.distanceTo(targetPos) < 0.4) {
                    collision = true;
                    // Взрыв и урон 25% от макс. HP
                    explode(targetPos, 25);
                    b.hp -= 25; 
                    if (b.hp <= 0) destroyBase(b);
                    break;
                }
            }

            if (!collision) {
                createNewBase(targetPos, startPos, moduleToBuild);
            } else {
                console.log("Коллизия! Модуль взорвался.");
            }
        }
    }
    animateFlight();
}

function createNewBase(pos, parentPos, moduleType) {
    const playerColor = currentPlayer === 1 ? 0x00aaff : 0xff0000;
    let newBaseColor = playerColor;
    
    if (moduleType === 'generator') newBaseColor = 0x00ff00; 
    if (moduleType === 'dome') newBaseColor = 0xffff00; 

    const newBase = new THREE.Mesh(baseGeometry, new THREE.MeshBasicMaterial({ color: newBaseColor }));
    layFlatOnSphere(newBase, pos);
    scene.add(newBase);
    
    const baseObj = { mesh: newBase, position: pos.clone(), owner: currentPlayer, hp: 100, maxHp: 100, type: moduleType };
    bases.push(baseObj);

    createEnergyLine(parentPos, pos);

    if (moduleType === 'generator') {
        playerGenerators[currentPlayer]++;
        alert(`Генератор! Выработка: от ${1 + playerGenerators[currentPlayer]} до ${10 + playerGenerators[currentPlayer]}`);
    }
    
    if (moduleType === 'dome') {
        const domeGeo = new THREE.SphereGeometry(1.5, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
        const domeMesh = new THREE.Mesh(domeGeo, domeMat);
        domeMesh.position.copy(pos);
        const normal = pos.clone().normalize();
        const up = new THREE.Vector3(0, 1, 0);
        domeMesh.quaternion.setFromUnitVectors(up, normal);
        scene.add(domeMesh);
    }
}

function destroyBase(base) {
    scene.remove(base.mesh);
    // Удаляем из массива
    bases = bases.filter(b => b !== base);
    console.log("База уничтожена!");
}

function explode(pos, damage) {
    // Создаем оранжевую сферу (взрыв)
    const explosionGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const explosionMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 1 });
    const explosion = new THREE.Mesh(explosionGeo, explosionMat);
    explosion.position.copy(pos).normalize().multiplyScalar(PLANET_RADIUS);
    scene.add(explosion);

    // Анимация расширения и исчезновения
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

    // Наносим урон всем базам в радиусе (примерно 0.8 от точки взрыва)
    for (let b of bases) {
        if (b.position.distanceTo(pos.normalize().multiplyScalar(PLANET_RADIUS)) < 0.8) {
            b.hp -= damage;
            alert(`Попадание! Урон: ${damage}. Осталось HP: ${b.hp}`);
            if (b.hp <= 0) {
                destroyBase(b);
            }
        }
    }
}

function createEnergyLine(startPos, endPos) {
    const midPoint = startPos.clone().lerp(endPos, 0.5);
    const controlPoint = midPoint.clone().normalize().multiplyScalar(PLANET_RADIUS + 0.3);
    const curve = new THREE.QuadraticBezierCurve3(startPos, controlPoint, endPos);
    const tubeGeometry = new THREE.TubeGeometry(curve, 20, 0.02, 8, false);
    const color = currentPlayer === 1 ? 0x00ffff : 0xff0000;
    const tubeMaterial = new THREE.MeshBasicMaterial({ color: color });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    scene.add(tube);
}
