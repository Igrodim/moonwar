import { PLANET_RADIUS, playerColors, getGeometry, layFlatOnSphere, VISION_RADIUS, createHealthBar, setPlanetRadius } from './entities.js';
import { executeShot, canShoot } from './combat.js';
import { playAITurn } from './ai.js';
import { uiElements, updateUI, clearSelection } from './ui.js';
import { createPlanet } from './planet.js';

let scene, camera, controls;
let bases = [];
let selectedBase = null;
let lastSelectedBase = null;
let currentAngle = 0;
let isCharging = false;
let power = 0;
let powerInterval = null;
const maxPower = 10;
let arrowHelper;

let currentPlayer = 1;
let totalPlayers = 2; 
let playerEnergy = {}; 
let playerGenerators = {}; 
let hasSpunThisTurn = false; 
let selectedModuleType = null; 
let gameOver = false;
let isAITurn = false;

let currentCameraAzimuth = 0; 
let fogMesh, fogCanvas, fogCtx, fogTexture;
let currentPlanet = null;

let cameraTargetPos = new THREE.Vector3();
let cameraTargetLookAt = new THREE.Vector3();
let cameraTargetUp = new THREE.Vector3();

let cameraMoveProgress = 0;
let cameraMoveStartPos = new THREE.Vector3();
let cameraMoveStartTarget = new THREE.Vector3();
let cameraMoveStartUp = new THREE.Vector3();
let isCameraMoving = false;

export function initGame(_scene, _camera, _controls) {
    scene = _scene;
    camera = _camera;
    controls = _controls;

    arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 0.6, 0xffff00, 0.15, 0.1);
    arrowHelper.visible = false;
    scene.add(arrowHelper);

    setupFogOfWar();
    setupEventListeners();
}

export function updateCameraTilt() {
    if (!selectedBase || isCameraMoving) return;
    
    const target = selectedBase.position;
    const normal = target.clone().normalize();
    const dist = camera.position.distanceTo(target);
    
    const minDist = 1.5;  
    const maxDist = 20;   
    
    let t = (dist - minDist) / (maxDist - minDist);
    t = Math.max(0, Math.min(1, t));
    
    const targetPhi = THREE.MathUtils.degToRad(2 + 23 * (1 - t)); 
    
    const offset = camera.position.clone().sub(target);
    const currentPhi = offset.angleTo(normal);
    
    if (Math.abs(currentPhi - targetPhi) > 0.005) {
        const axis = new THREE.Vector3().crossVectors(offset, normal).normalize();
        if (axis.lengthSq() > 0.001) {
            offset.applyAxisAngle(axis, (currentPhi - targetPhi) * 0.1);
            camera.position.copy(target).add(offset);
        }
    }
}

function smoothCenterCameraOnBase(base) {
    if (!base) return;

    const normal = base.position.clone().normalize();
    
    let currentDist = camera.position.distanceTo(controls.target);
    if (currentDist < 1.5 || currentDist > 25 || isNaN(currentDist)) {
        currentDist = 20; 
    }

    let baseTangent = new THREE.Vector3(1, 0, 0).cross(normal).normalize();
    if (baseTangent.lengthSq() < 0.1) baseTangent.set(0, 0, 1).cross(normal).normalize();
    let tangent = baseTangent.applyAxisAngle(normal, currentCameraAzimuth);
    
    const minDist = 1.5;
    const maxDist = 20;
    let t = (currentDist - minDist) / (maxDist - minDist);
    t = Math.max(0, Math.min(1, t));
    const targetPhi = THREE.MathUtils.degToRad(2 + 23 * (1 - t));

    const offset = normal.clone().multiplyScalar(Math.cos(targetPhi) * currentDist)
                         .add(tangent.clone().multiplyScalar(Math.sin(targetPhi) * currentDist));
                         
    cameraTargetPos.copy(base.position).add(offset);
    cameraTargetLookAt.copy(base.position);
    cameraTargetUp.copy(normal); 
    
    cameraMoveStartPos.copy(camera.position);
    cameraMoveStartTarget.copy(controls.target);
    cameraMoveStartUp.copy(camera.up);
    
    cameraMoveProgress = 0;
    isCameraMoving = true;
}

export function updateCameraAnimation() {
    if (isCameraMoving) {
        cameraMoveProgress += 0.08; 
        if (cameraMoveProgress >= 1) {
            cameraMoveProgress = 1;
            isCameraMoving = false;
        }
        
        let t = cameraMoveProgress * cameraMoveProgress * (3 - 2 * cameraMoveProgress);
        
        camera.position.lerpVectors(cameraMoveStartPos, cameraTargetPos, t);
        controls.target.lerpVectors(cameraMoveStartTarget, cameraTargetLookAt, t);
        camera.up.lerpVectors(cameraMoveStartUp, cameraTargetUp, t).normalize();
    }
}

function setupFogOfWar() {
    fogCanvas = document.createElement('canvas');
    fogCanvas.width = 1024;
    fogCanvas.height = 512;
    fogCtx = fogCanvas.getContext('2d');
    
    fogTexture = new THREE.CanvasTexture(fogCanvas);
    // Оптимизация текстур: убираем артефакты сглаживания
    fogTexture.minFilter = THREE.LinearFilter;
    fogTexture.magFilter = THREE.LinearFilter;
    fogTexture.wrapS = THREE.RepeatWrapping;
    fogTexture.wrapT = THREE.ClampToEdgeWrapping;
    
    // ОПТИМИЗАЦИЯ: Увеличили радиус сферы тумана до 10.05, чтобы убрать белый ореол
    const fogGeo = new THREE.SphereGeometry(10.05, 32, 32); 
    const fogMat = new THREE.MeshBasicMaterial({ 
        map: fogTexture, 
        transparent: true, 
        depthWrite: false,
        color: 0x000000 // Принудительно черный цвет тумана
    });
    
    fogMesh = new THREE.Mesh(fogGeo, fogMat);
    fogMesh.renderOrder = 999;
    scene.add(fogMesh);
}

export function updateFogOfWar() {
    if (gameOver) return;
    
    fogCtx.fillStyle = '#000000';
    fogCtx.fillRect(0, 0, 1024, 512);
    
    fogCtx.globalCompositeOperation = 'destination-out';
    
    const myBases = bases.filter(b => b.owner === 1);
    
    myBases.forEach(base => {
        const u = 0.5 + Math.atan2(-base.position.z, base.position.x) / (2 * Math.PI);
        const v = 0.5 - Math.asin(base.position.y / PLANET_RADIUS) / Math.PI;
        
        const x = u * 1024;
        const y = v * 512;
        
        const r = ((base.visionRadius || VISION_RADIUS) / (Math.PI * PLANET_RADIUS)) * 1024 * 1.5;
        
        const gradient = fogCtx.createRadialGradient(x, y, r * 0.5, x, y, r);
        gradient.addColorStop(0, 'rgba(0,0,0,1)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        
        fogCtx.fillStyle = gradient;
        fogCtx.beginPath();
        fogCtx.arc(x, y, r, 0, Math.PI * 2);
        fogCtx.fill();
    });
    
    fogCtx.globalCompositeOperation = 'source-over';
    fogTexture.needsUpdate = true;

    bases.forEach(base => {
        if (base.owner === 1) {
            base.mesh.visible = true;
            if (base.lineMesh) base.lineMesh.visible = true;
            if (base.domeMesh) base.domeMesh.visible = true;
            if (base.healthSprite) base.healthSprite.visible = true;
            return;
        }

        let inVision = false;
        for (let ally of myBases) {
            const radius = ally.visionRadius || VISION_RADIUS;
            if (ally.position.distanceTo(base.position) < radius) {
                inVision = true;
                break;
            }
        }

        base.mesh.visible = inVision;
        if (base.lineMesh) base.lineMesh.visible = inVision && (base.parent ? base.parent.mesh.visible : false);
        if (base.domeMesh) base.domeMesh.visible = inVision;
        if (base.healthSprite) base.healthSprite.visible = inVision;
    });
}

function cycleBase(direction) {
    if (isAITurn || gameOver) return;

    const shootableBases = bases.filter(b => b.owner === currentPlayer && (b.type === 'hub' || b.type === 'relay'));
    if (shootableBases.length <= 1) return;

    let currentIndex = shootableBases.indexOf(selectedBase);
    if (currentIndex === -1) currentIndex = 0;

    let newIndex = currentIndex + direction;
    if (newIndex >= shootableBases.length) newIndex = 0;
    if (newIndex < 0) newIndex = shootableBases.length - 1;

    const newBase = shootableBases[newIndex];
    selectBase(newBase);
}

function selectBase(base) {
    selectedBase = base;
    smoothCenterCameraOnBase(selectedBase);
    
    uiElements.uiPanel.style.display = 'block';
    arrowHelper.position.copy(selectedBase.position);
    currentAngle = selectedBase.aimAngle; 
    updateArrowDirection();
    arrowHelper.visible = selectedModuleType !== 'heal';
}

function setupEventListeners() {
    window.addEventListener('keydown', (e) => {
        if (gameOver || isAITurn || !selectedBase) return; 
        const key = e.key.toLowerCase();
        if (key === 'a' || key === 'ф') { rotateCameraAroundTarget(-Math.PI / 16); } 
        else if (key === 'd' || key === 'в') { rotateCameraAroundTarget(Math.PI / 16); }
        else if (key === 'w' || key === 'ц') { cycleBase(-1); }
        else if (key === 's' || key === 'ы') { cycleBase(1); }
    });

    const btnCyclePrev = document.getElementById('cycle-prev');
    const btnCycleNext = document.getElementById('cycle-next');
    if (btnCyclePrev) btnCyclePrev.addEventListener('click', () => { if (!gameOver && selectedBase) cycleBase(-1); });
    if (btnCycleNext) btnCycleNext.addEventListener('click', () => { if (!gameOver && selectedBase) cycleBase(1); });

    uiElements.rotateLeft.addEventListener('click', () => { if (!gameOver && selectedBase) rotateCameraAroundTarget(-Math.PI / 16); });
    uiElements.rotateRight.addEventListener('click', () => { if (!gameOver && selectedBase) rotateCameraAroundTarget(Math.PI / 16); });
    
    uiElements.spinBtn.addEventListener('click', () => { if (!hasSpunThisTurn && !gameOver && !isAITurn) spinEnergy(); });

    uiElements.moduleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (isAITurn) return;
            uiElements.moduleBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedModuleType = btn.getAttribute('data-type');
            
            if (selectedModuleType === 'heal') {
                uiElements.uiPanel.style.display = 'none';
                arrowHelper.visible = false;
            } else if (selectedBase) {
                uiElements.uiPanel.style.display = 'block';
                arrowHelper.visible = true;
                arrowHelper.position.copy(selectedBase.position);
                updateArrowDirection();
            }
        });
    });

    uiElements.endTurnBtn.addEventListener('click', () => { if (!gameOver && !isAITurn) endTurn(); });
    uiElements.btnLeft.addEventListener('click', () => { if (selectedBase && !isAITurn) { currentAngle += 11.25; updateArrowDirection(); } });
    uiElements.btnRight.addEventListener('click', () => { if (selectedBase && !isAITurn) { currentAngle -= 11.25; updateArrowDirection(); } });

    uiElements.fireBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!selectedBase || gameOver || isAITurn) return;
        if (!selectedModuleType) { window.showMessage("ВНИМАНИЕ", "Сначала выберите модуль внизу!"); return; }
        
        const cost = getModuleCost(selectedModuleType);
        if (playerEnergy[currentPlayer] < cost) { window.showMessage("ВНИМАНИЕ", "Не хватает энергии!"); return; }
        
        isCharging = true;
        power = 0;
        uiElements.powerBar.style.width = '0%';
        powerInterval = setInterval(() => {
            if (power < maxPower) { power += 0.2; uiElements.powerBar.style.width = (power / maxPower) * 100 + '%'; }
        }, 50);
    });

    window.addEventListener('pointerup', () => {
        if (isCharging) {
            isCharging = false;
            clearInterval(powerInterval);
            uiElements.powerBar.style.width = '0%';
            
            const cost = getModuleCost(selectedModuleType);
            if (power > 0 && playerEnergy[currentPlayer] >= cost) {
                
                const check = canShoot(bases, selectedBase, currentAngle, selectedModuleType);
                if (!check.allowed) {
                    window.showMessage("ОШИБКА", check.reason);
                    return; 
                }

                playerEnergy[currentPlayer] -= cost;
                updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
                
                selectedBase.aimAngle = currentAngle;

                executeShot(scene, bases, selectedBase, check.snappedAngle, power, selectedModuleType, check.sector, playerGenerators, 
                    (genCount) => window.showMessage("УСПЕХ", `Генератор построен! Твоя выработка: от ${5 + genCount} до ${8 + genCount}`),
                    (owner) => endGame(owner),
                    () => updateFogOfWar(),
                    1, 
                    VISION_RADIUS
                );
            } else if (power > 0) {
                window.showMessage("ВНИМАНИЕ", "Не хватает энергии!");
            }
        }
    });

    uiElements.startBtn.addEventListener('click', () => {
        const aiCount = parseInt(uiElements.aiCountInput.value) || 1;
        totalPlayers = 1 + aiCount;
        
        for (let i = 1; i <= totalPlayers; i++) {
            playerEnergy[i] = 0;
            playerGenerators[i] = 0;
        }

        uiElements.startScreen.style.display = 'none';
        startGame();
    });
}

function rotateCameraAroundTarget(angle) {
    if (!selectedBase) return;
    
    currentCameraAzimuth += angle; 
    
    const target = selectedBase.position;
    const normal = target.clone().normalize();

    const offset = camera.position.clone().sub(target);
    offset.applyAxisAngle(normal, angle);
    camera.position.copy(target).add(offset);
    camera.up.applyAxisAngle(normal, angle);
    
    if (isCameraMoving) {
        const targetOffset = cameraTargetPos.clone().sub(target);
        targetOffset.applyAxisAngle(normal, angle);
        cameraTargetPos.copy(target).add(targetOffset);
        
        const startOffset = cameraMoveStartPos.clone().sub(target);
        startOffset.applyAxisAngle(normal, angle);
        cameraMoveStartPos.copy(target).add(startOffset);
        
        cameraTargetUp.applyAxisAngle(normal, angle);
        cameraMoveStartUp.applyAxisAngle(normal, angle);
    }
    
    controls.update();
}

function getModuleCost(type) {
    if (['bomb', 'heal', 'drone'].includes(type)) return 1;
    if (['aao', 'homing'].includes(type)) return 3;
    if (['relay', 'dome', 'generator'].includes(type)) return 7;
    return 0;
}

function spinEnergy() {
    const minRoll = 5 + playerGenerators[currentPlayer];
    const maxRoll = 8 + playerGenerators[currentPlayer];
    const rolledEnergy = Math.floor(Math.random() * (maxRoll - minRoll + 1)) + minRoll;
    
    playerEnergy[currentPlayer] += rolledEnergy;
    hasSpunThisTurn = true;
    
    uiElements.spinBtn.classList.remove('pulse');
    uiElements.spinBtn.disabled = true;
    uiElements.spinBtn.innerText = `+${rolledEnergy}`;
    setTimeout(() => { uiElements.spinBtn.innerText = '⚡'; }, 1000); 
    
    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
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

    if (currentPlayer === 1) {
        lastSelectedBase = selectedBase;
    }

    currentPlayer++;
    if (currentPlayer > totalPlayers) currentPlayer = 1;

    hasSpunThisTurn = false;
    selectedModuleType = null;
    clearSelection();
    selectedBase = null;
    arrowHelper.visible = false;
    
    uiElements.spinBtn.disabled = false;
    uiElements.spinBtn.classList.add('pulse');
    uiElements.spinBtn.innerText = '⚡';

    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
    updateFogOfWar(); 

    if (currentPlayer > 1) {
        isAITurn = true;
        uiElements.bottomPanel.style.pointerEvents = 'none';
        uiElements.bottomPanel.style.opacity = '0.5';
        
        playAITurn({
            scene, camera, controls, bases, currentPlayer, playerEnergy, playerGenerators, PLANET_RADIUS,
            onTurnEnd: endTurn,
            onGameOver: endGame,
            onGeneratorBuilt: (genCount) => {},
            updateUI: () => updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors),
            updateFog: updateFogOfWar
        });
    } else {
        isAITurn = false;
        uiElements.bottomPanel.style.pointerEvents = 'auto';
        uiElements.bottomPanel.style.opacity = '1';

        if (lastSelectedBase && bases.includes(lastSelectedBase)) {
            selectBase(lastSelectedBase);
        } else {
            const myBases = bases.filter(b => b.owner === 1 && (b.type === 'hub' || b.type === 'relay'));
            if (myBases.length > 0) {
                selectBase(myBases[0]);
            }
        }
    }
}

function endGame(owner) {
    gameOver = true;
    window.showMessage("ИГРА ОКОНЧЕНА", `Победил Игрок ${owner}!`);
    setTimeout(() => { location.reload(); }, 4000);
}

function startGame() {
    const sizeFactor = parseFloat(document.getElementById('planet-size').value);
    const newRadius = 10 * sizeFactor;
    setPlanetRadius(newRadius);

    if (currentPlanet) {
        scene.remove(currentPlanet.globe);
    }
    currentPlanet = createPlanet(scene, newRadius);

    fogMesh.scale.set(sizeFactor, sizeFactor, sizeFactor);
    controls.maxDistance = 25 * sizeFactor;
    camera.position.set(0, 0, 20 * sizeFactor);
    controls.target.set(0, 0, 0);
    isCameraMoving = false;

    let positions = [];
    const minAngle = Math.PI / (totalPlayers * 1.2); 

    for (let p = 1; p <= totalPlayers; p++) {
        let pos;
        let valid = false;
        let attempts = 0;
        while (!valid && attempts < 100) {
            attempts++;
            pos = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(newRadius);
            valid = true;
            for (let existingPos of positions) {
                if (pos.angleTo(existingPos) < minAngle) { valid = false; break; }
            }
        }
        positions.push(pos);

        const hub = new THREE.Mesh(getGeometry('hub'), new THREE.MeshStandardMaterial({ 
            color: playerColors[p - 1], emissive: playerColors[p - 1], emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.2 
        }));
        layFlatOnSphere(hub, pos);
        scene.add(hub);
        
        let baseObj = { mesh: hub, position: pos, owner: p, hp: 100, maxHp: 100, type: 'hub', parent: null, sector: -1, lineMesh: null, visionRadius: VISION_RADIUS, aimAngle: 0 };
        bases.push(baseObj);
        createHealthBar(scene, baseObj);
        
        if (p === 1) {
            selectedBase = baseObj;
            lastSelectedBase = baseObj;
            
            const normal = baseObj.position.clone().normalize();
            camera.up.copy(normal);
            
            smoothCenterCameraOnBase(selectedBase);
            camera.position.copy(cameraTargetPos);
            controls.target.copy(cameraTargetLookAt);
            camera.up.copy(cameraTargetUp);
            isCameraMoving = false;

            uiElements.uiPanel.style.display = 'block';
            arrowHelper.position.copy(pos);
            currentAngle = selectedBase.aimAngle; 
            updateArrowDirection();
            arrowHelper.visible = true;
        }
    }
    
    setupRaycaster();
    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
    updateFogOfWar();
}

function setupRaycaster() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('pointerdown', (event) => {
        if (isAITurn || gameOver) return;
        if (event.target.closest('#bottom-panel') || event.target.closest('#ui-panel') || event.target.closest('#start-screen') || event.target.closest('#custom-modal-overlay')) return;

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        
        const baseMeshes = bases.filter(b => b.mesh.visible).map(b => b.mesh);
        const intersects = raycaster.intersectObjects(baseMeshes);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const clickedBase = bases.find(b => b.mesh === clickedMesh);
            
            if (selectedModuleType === 'heal') {
                if (clickedBase.owner === currentPlayer && playerEnergy[currentPlayer] >= 1) {
                    clickedBase.hp = Math.min(clickedBase.maxHp, clickedBase.hp + 25);
                    playerEnergy[currentPlayer] -= 1;
                    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
                    window.showMessage("УСПЕХ", `База вылечена! HP: ${clickedBase.hp}`);
                } else { window.showMessage("ОШИБКА", "Нельзя лечить или не хватает энергии!"); }
                return;
            }

            if (clickedBase.owner !== currentPlayer) { window.showMessage("ВНИМАНИЕ", "Это база противника!"); return; }
            if (clickedBase.type !== 'hub' && clickedBase.type !== 'relay') { window.showMessage("ВНИМАНИЕ", "С этого модуля нельзя стрелять!"); return; }

            selectBase(clickedBase);
        } else {
            selectedBase = null;
            uiElements.uiPanel.style.display = 'none';
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
    arrowHelper.setDirection(tangent);
}
