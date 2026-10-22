import { PLANET_RADIUS, playerColors, getGeometry, layFlatOnSphere, createHealthBar } from './entities.js';
import { executeShot, canShoot } from './combat.js';
import { playAITurn } from './ai.js';
import { uiElements, updateUI, clearSelection } from './ui.js';

let scene, camera, controls;
let bases = [];
let selectedBase = null;
let currentAngle = 0;
let isCharging = false;
let power = 0;
let powerInterval = null;
let arrowHelper;

let currentPlayer = 1;
let totalPlayers = 2; 
let playerEnergy = {}; 
let playerGenerators = {}; 
let hasSpunThisTurn = false; 
let selectedModuleType = null; 
let gameOver = false;

export function initGame(_scene, _camera, _controls) {
    scene = _scene;
    camera = _camera;
    controls = _controls;

    arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1, 0xffff00, 0.2, 0.1);
    arrowHelper.visible = false;
    scene.add(arrowHelper);

    setupEventListeners();
}

// УСТАНОВКА КАМЕРЫ БЕЗ GIMBAL LOCK
function centerCameraOnBase(base) {
    const normal = base.position.clone().normalize();
    
    // Ставим камеру снаружи сферы, немного сбоку, чтобы избежать смотрения строго вниз
    const dist = 15;
    const tangent = new THREE.Vector3(1, 0, 0).cross(normal).normalize();
    
    camera.position.copy(base.position)
        .add(normal.clone().multiplyScalar(dist * 0.8))
        .add(tangent.clone().multiplyScalar(dist * 0.6));
        
    controls.target.copy(base.position);
    controls.update();
}

function setupEventListeners() {
    // Кнопки камеры A/D
    uiElements.rotateLeft.addEventListener('click', () => {
        if (!selectedBase || isCharging) return;
        const target = selectedBase.position;
        const normal = target.clone().normalize();
        const offset = camera.position.clone().sub(target);
        offset.applyAxisAngle(normal, -Math.PI / 8);
        camera.position.copy(target).add(offset);
        controls.update();
    });

    uiElements.rotateRight.addEventListener('click', () => {
        if (!selectedBase || isCharging) return;
        const target = selectedBase.position;
        const normal = target.clone().normalize();
        const offset = camera.position.clone().sub(target);
        offset.applyAxisAngle(normal, Math.PI / 8);
        camera.position.copy(target).add(offset);
        controls.update();
    });

    // Энергия
    uiElements.spinBtn.addEventListener('click', () => {
        if (hasSpunThisTurn || gameOver) return;
        const minRoll = 5 + playerGenerators[currentPlayer];
        const maxRoll = 8 + playerGenerators[currentPlayer];
        const rolled = Math.floor(Math.random() * (maxRoll - minRoll + 1)) + minRoll;
        
        playerEnergy[currentPlayer] += rolled;
        hasSpunThisTurn = true;
        uiElements.spinBtn.disabled = true;
        uiElements.spinBtn.innerText = `+${rolled}`;
        setTimeout(() => { uiElements.spinBtn.innerText = '⚡'; }, 1000); 
        updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
    });

    // Выбор модуля
    uiElements.moduleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            uiElements.moduleBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedModuleType = btn.getAttribute('data-type');
            if (selectedModuleType === 'heal') {
                uiElements.uiPanel.style.display = 'none';
                arrowHelper.visible = false;
            }
        });
    });

    // Поворот стрелки
    uiElements.btnLeft.addEventListener('click', () => { if (selectedBase) { currentAngle += 11.25; updateArrowDirection(); } });
    uiElements.btnRight.addEventListener('click', () => { if (selectedBase) { currentAngle -= 11.25; updateArrowDirection(); } });

    // Выстрел
    uiElements.fireBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!selectedBase || !selectedModuleType) return;
        
        const cost = selectedModuleType === 'bomb' || selectedModuleType === 'heal' || selectedModuleType === 'drone' ? 1 : (selectedModuleType === 'aao' || selectedModuleType === 'homing' ? 3 : 7);
        if (playerEnergy[currentPlayer] < cost) { alert("Не хватает энергии!"); return; }
        
        isCharging = true;
        power = 0;
        uiElements.powerBar.style.width = '0%';
        powerInterval = setInterval(() => {
            power += 0.2;
            if (power > 10) power = 10;
            uiElements.powerBar.style.width = (power / 10) * 100 + '%';
        }, 50);
    });

    window.addEventListener('pointerup', () => {
        if (isCharging) {
            isCharging = false;
            clearInterval(powerInterval);
            uiElements.powerBar.style.width = '0%';
            
            if (power <= 0) power = 1; 
            const cost = selectedModuleType === 'bomb' || selectedModuleType === 'heal' || selectedModuleType === 'drone' ? 1 : (selectedModuleType === 'aao' || selectedModuleType === 'homing' ? 3 : 7);
            
            if (playerEnergy[currentPlayer] >= cost) {
                let check = canShoot(bases, selectedBase, currentAngle, selectedModuleType);
                if (check.allowed) {
                    playerEnergy[currentPlayer] -= cost;
                    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
                    
                    executeShot(scene, bases, selectedBase, check.snappedAngle, power, selectedModuleType, playerGenerators, 
                        (genCount) => alert(`Генератор! Выработка: ${5+genCount} - ${8+genCount}`),
                        (owner) => endGame(owner),
                        () => {}
                    );
                } else {
                    alert(check.reason);
                }
            }
        }
    });

    // Конец хода
    uiElements.endTurnBtn.addEventListener('click', () => {
        if (gameOver) return;
        currentPlayer++;
        if (currentPlayer > totalPlayers) currentPlayer = 1;
        hasSpunThisTurn = false;
        selectedModuleType = null;
        selectedBase = null;
        clearSelection();
        arrowHelper.visible = false;
        uiElements.spinBtn.disabled = false;
        updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);

        if (currentPlayer > 1) {
            uiElements.bottomPanel.style.pointerEvents = 'none';
            uiElements.bottomPanel.style.opacity = '0.5';
            playAITurn({ scene, camera, controls, bases, currentPlayer, playerEnergy, playerGenerators, onTurnEnd: endTurn, onGameOver: endGame, onGeneratorBuilt: () => {}, updateUI: () => updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors) });
        } else {
            uiElements.bottomPanel.style.pointerEvents = 'auto';
            uiElements.bottomPanel.style.opacity = '1';
        }
    });

    // Старт
    uiElements.startBtn.addEventListener('click', () => {
        totalPlayers = 1 + (parseInt(uiElements.aiCountInput.value) || 1);
        for (let i = 1; i <= totalPlayers; i++) { playerEnergy[i] = 0; playerGenerators[i] = 0; }
        uiElements.startScreen.style.display = 'none';
        startGame();
    });
}

function updateArrowDirection() {
    if (!selectedBase) return;
    const normal = selectedBase.position.clone().normalize();
    let baseVector = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.y) > 0.9) baseVector.set(0, 0, 1);
    let tangent = baseVector.cross(normal).normalize();
    tangent.applyAxisAngle(normal, THREE.MathUtils.degToRad(currentAngle));
    arrowHelper.setDirection(tangent);
}

function startGame() {
    let positions = [];
    for (let p = 1; p <= totalPlayers; p++) {
        let pos = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(PLANET_RADIUS);
        const hub = new THREE.Mesh(getGeometry('hub'), new THREE.MeshBasicMaterial({ color: playerColors[p - 1] }));
        layFlatOnSphere(hub, pos);
        scene.add(hub);
        
        let baseObj = { mesh: hub, position: pos, owner: p, hp: 100, maxHp: 100, type: 'hub', parent: null, angle: 0, lineMesh: null, aimAngle: 0 };
        bases.push(baseObj);
        createHealthBar(scene, baseObj);
        
        if (p === 1) {
            selectedBase = baseObj;
            centerCameraOnBase(selectedBase); 
            uiElements.uiPanel.style.display = 'block';
            arrowHelper.position.copy(pos);
            updateArrowDirection();
            arrowHelper.visible = true;
        }
    }
    setupRaycaster();
    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
}

function endTurn() {
    currentPlayer++;
    if (currentPlayer > totalPlayers) currentPlayer = 1;
    hasSpunThisTurn = false;
    selectedModuleType = null;
    selectedBase = null;
    clearSelection();
    arrowHelper.visible = false;
    uiElements.spinBtn.disabled = false;
    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);

    if (currentPlayer > 1) {
        uiElements.bottomPanel.style.pointerEvents = 'none';
        uiElements.bottomPanel.style.opacity = '0.5';
        playAITurn({ scene, camera, controls, bases, currentPlayer, playerEnergy, playerGenerators, onTurnEnd: endTurn, onGameOver: endGame, onGeneratorBuilt: () => {}, updateUI: () => updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors) });
    } else {
        uiElements.bottomPanel.style.pointerEvents = 'auto';
        uiElements.bottomPanel.style.opacity = '1';
    }
}

function endGame(owner) {
    gameOver = true;
    alert(`ИГРА ОКОНЧЕНА! Победил Игрок ${owner}!`);
    setTimeout(() => { location.reload(); }, 3000);
}

function setupRaycaster() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (gameOver) return;
        if (event.target.closest('#bottom-panel') || event.target.closest('#ui-panel') || event.target.closest('#start-screen')) return;

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = (event.clientY / window.innerHeight) * 2 + 1;

        // Принудительное обновление матрицы, чтобы клик всегда срабатывал
        camera.updateMatrixWorld();
        scene.updateMatrixWorld();
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
                    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
                    if(clickedBase.healthSprite) clickedBase.healthSprite.visible = true;
                }
                return;
            }

            if (clickedBase.owner !== currentPlayer) return; 
            if (clickedBase.type !== 'hub' && clickedBase.type !== 'relay') return; 

            selectedBase = clickedBase;
            centerCameraOnBase(selectedBase); 
            
            uiElements.uiPanel.style.display = 'block';
            arrowHelper.position.copy(selectedBase.position);
            currentAngle = selectedBase.aimAngle || 0;
            updateArrowDirection();
            arrowHelper.visible = true;
        }
    });
}
