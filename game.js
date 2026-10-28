import { PLANET_RADIUS, playerColors, getGeometry, layFlatOnSphere, VISION_RADIUS, createHealthBar, setPlanetRadius, updateHealthBar } from './entities.js';
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
let aiSpeedMultiplier = 1; 

let currentCameraAzimuth = 0; 
let fogMat, fogMesh;
let currentPlanet = null;

// Переменные для плавной камеры
let cameraTargetPos = new THREE.Vector3();
let cameraTargetLookAt = new THREE.Vector3();
let cameraTargetUp = new THREE.Vector3();

let cameraMoveProgress = 0;
let cameraMoveStartPos = new THREE.Vector3();
let cameraMoveStartTarget = new THREE.Vector3();
let cameraMoveStartUp = new THREE.Vector3();
let isCameraMoving = false;

let aiTurnTimeout = null;

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
    if (!selectedBase || isCameraMoving || isAITurn) return; 
    
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

export function smoothCenterCameraOnBase(base) {
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

export function focusCameraOnTarget(targetPos) {
    const normal = targetPos.clone().normalize();

    // Вычисляем ТЕКУЩУЮ дистанцию от камеры до поверхности планеты
    const currentRadius = camera.position.length();
    const planetRadius = targetPos.length();
    let dist = currentRadius - planetRadius;

    // Защита от нулевых или слишком больших значений (если камера внутри планеты)
    if (dist < 2) dist = 15; 
    if (dist > 60) dist = 25; 

    let baseTangent = new THREE.Vector3(1, 0, 0).cross(normal).normalize();
    if (baseTangent.lengthSq() < 0.1) baseTangent.set(0, 0, 1).cross(normal).normalize();
    let tangent = baseTangent.applyAxisAngle(normal, currentCameraAzimuth);
    
    // Угол обзора атаки (25 градусов)
    const targetPhi = THREE.MathUtils.degToRad(25); 

    // Новая позиция камеры сохраняет ту же высоту над планетой
    const offset = normal.clone().multiplyScalar(Math.cos(targetPhi) * dist)
                         .add(tangent.clone().multiplyScalar(Math.sin(targetPhi) * dist));
                         
    cameraTargetPos.copy(targetPos).add(offset);
    cameraTargetLookAt.copy(targetPos);
    cameraTargetUp.copy(normal); 
    
    cameraMoveStartPos.copy(camera.position);
    cameraMoveStartTarget.copy(controls.target);
    cameraMoveStartUp.copy(camera.up);
    
    cameraMoveProgress = 0;
    isCameraMoving = true;
}

export function updateCameraAnimation() {
    if (isCameraMoving) {
        cameraMoveProgress += 0.04; // Плавная скорость полета
        if (cameraMoveProgress >= 1) {
            cameraMoveProgress = 1;
            isCameraMoving = false;
        }
        
        // Плавная кривая (ease-in-out)
        let t = cameraMoveProgress * cameraMoveProgress * (3 - 2 * cameraMoveProgress);
        
        // 1. Сферическая интерполяция позиции (камера облетает планету по дуге, не пролетая сквозь неё)
        const startPosNorm = cameraMoveStartPos.clone().normalize();
        const targetPosNorm = cameraTargetPos.clone().normalize();
        
        const qPos = new THREE.Quaternion().setFromUnitVectors(startPosNorm, targetPosNorm);
        const partialQPos = new THREE.Quaternion().slerp(qPos, t); 
        
        const currentOffset = cameraMoveStartPos.clone().applyQuaternion(partialQPos);
        const currentRadius = cameraMoveStartPos.length() * (1 - t) + cameraTargetPos.length() * t;
        
        camera.position.copy(currentOffset.normalize().multiplyScalar(currentRadius));
        
        // 2. Интерполяция цели взгляда
        controls.target.lerpVectors(cameraMoveStartTarget, cameraTargetLookAt, t);
        
        // 3. Сферическая интерполяция вектора UP (защита от переворота камеры вверх ногами)
        const startUp = cameraMoveStartUp.clone().normalize();
        const targetUp = cameraTargetUp.clone().normalize();
        const qUp = new THREE.Quaternion().setFromUnitVectors(startUp, targetUp);
        const partialQUp = new THREE.Quaternion().slerp(qUp, t);
        
        camera.up.copy(startUp.applyQuaternion(partialQUp).normalize());
    }
}

function setupFogOfWar() {
    const fogGeo = new THREE.SphereGeometry(10.02, 64, 64); 
    
    fogMat = new THREE.ShaderMaterial({
        uniforms: {
            uSources: { value: Array(32).fill(null).map(() => new THREE.Vector4(0, 0, 0, -1)) }
        },
        vertexShader: `
            varying vec3 vPos;
            void main() {
                vPos = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 vPos;
            uniform vec4 uSources[32];
            void main() {
                vec3 normPos = normalize(vPos);
                float alpha = 1.0; 
                
                for(int i = 0; i < 32; i++) {
                    if (uSources[i].w > 0.0) {
                        vec3 src = normalize(uSources[i].xyz);
                        float dist = distance(normPos, src);
                        float localAlpha = smoothstep(uSources[i].w, uSources[i].w + 0.03, dist);
                        alpha = min(alpha, localAlpha);
                    }
                }
                gl_FragColor = vec4(0.0, 0.0, 0.0, alpha); 
            }
        `,
        transparent: true, 
        depthWrite: false, 
        depthTest: true
    });
    
    fogMesh = new THREE.Mesh(fogGeo, fogMat);
    fogMesh.renderOrder = 999;
    scene.add(fogMesh);
}

export function getDynamicSpeed(targetPos) {
    const myBases = bases.filter(b => b.owner === 1);
    for (let b of myBases) {
        if (b.position.distanceTo(targetPos) < (b.visionRadius || VISION_RADIUS)) {
            return 1;
        }
    }
    return aiSpeedMultiplier;
}

export function updateFogOfWar() {
    if (gameOver) return;
    const myBases = bases.filter(b => b.owner === 1);
    
    for (let i = 0; i < 32; i++) {
        fogMat.uniforms.uSources.value[i].set(0, 0, 0, -1);
    }
    
    for (let i = 0; i < myBases.length && i < 32; i++) {
        let base = myBases[i];
        let r = (base.visionRadius || VISION_RADIUS) / PLANET_RADIUS; 
        fogMat.uniforms.uSources.value[i].set(base.position.x, base.position.y, base.position.z, r);
    }

    bases.forEach(base => {
        if (base.owner === 1) {
            base.mesh.visible = true;
            if (base.lineMesh) {
                base.lineMesh.visible = true;
                base.lineMesh.geometry.setDrawRange(0, Infinity);
            }
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
        if (base.domeMesh) base.domeMesh.visible = inVision;
        if (base.healthSprite) base.healthSprite.visible = inVision;

        if (base.lineMesh) {
            if (!inVision) {
                base.lineMesh.visible = false;
            } else {
                base.lineMesh.visible = true;
                const points = base.curve.getPoints(100);
                let firstVisibleIndex = 100;
                
                for (let i = points.length - 1; i >= 0; i--) {
                    let p = points[i];
                    let pointInVision = false;
                    for (let ally of myBases) {
                        const radius = ally.visionRadius || VISION_RADIUS;
                        if (ally.position.distanceTo(p) < radius) {
                            pointInVision = true;
                            break;
                        }
                    }
                    if (pointInVision) {
                        firstVisibleIndex = i;
                    } else {
                        break; 
                    }
                }
                
                const indicesPerSegment = 48;
                const startIndex = firstVisibleIndex * indicesPerSegment;
                const count = (points.length - 1 - firstVisibleIndex) * indicesPerSegment;
                
                base.lineMesh.geometry.setDrawRange(startIndex, count);
            }
        }
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
    if (!base) return;
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
                    VISION_RADIUS,
                    1 
                );
            } else if (power > 0) {
                window.showMessage("ВНИМАНИЕ", "Не хватает энергии!");
            }
        }
    });

    uiElements.startBtn.addEventListener('click', () => {
        const aiCount = parseInt(uiElements.aiCountInput.value) || 1;
        totalPlayers = 1 + aiCount;
        
        aiSpeedMultiplier = parseFloat(uiElements.aiSpeedSelect.value) || 1;

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
    
    if (aiTurnTimeout) {
        clearTimeout(aiTurnTimeout);
        aiTurnTimeout = null;
    }

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

    updateFogOfWar(); 

    if (currentPlayer > 1) {
        isAITurn = true;
        uiElements.bottomPanel.style.pointerEvents = 'none';
        uiElements.bottomPanel.style.opacity = '0.5';
        
        aiTurnTimeout = setTimeout(() => {
            if (isAITurn) {
                console.warn("AI Turn Timeout! Forcing end turn.");
                isAITurn = false;
                uiElements.bottomPanel.style.pointerEvents = 'auto';
                uiElements.bottomPanel.style.opacity = '1';
                endTurn(); 
            }
        }, 15000);

        playAITurn({
            scene, camera, controls, bases, currentPlayer, playerEnergy, playerGenerators, PLANET_RADIUS,
            onTurnEnd: endTurn,
            onGameOver: endGame,
            onGeneratorBuilt: (genCount) => {},
            updateUI: () => {}, 
            updateFog: updateFogOfWar,
            speedMultiplier: aiSpeedMultiplier,
            getDynamicSpeed: getDynamicSpeed,
            focusCamera: focusCameraOnTarget
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

function endGame(destroyedOwner) {
    const remainingHubs = bases.filter(b => b.type === 'hub');
    const remainingOwners = [...new Set(remainingHubs.map(b => b.owner))];
    
    if (remainingOwners.length === 1) {
        gameOver = true;
        if (aiTurnTimeout) clearTimeout(aiTurnTimeout);
        
        if (remainingOwners[0] === 1) {
            window.showMessage("ПОБЕДА!", "Вы уничтожили всех противников!");
        } else {
            window.showMessage("ПОРАЖЕНИЕ", `Вас уничтожил Игрок ${remainingOwners[0]}!`);
        }
        setTimeout(() => { location.reload(); }, 4000);
    } 
    else if (remainingOwners.length === 0) {
        gameOver = true;
        if (aiTurnTimeout) clearTimeout(aiTurnTimeout);
        window.showMessage("ИГРА ОКОНЧЕНА", `Все игроки уничтожены!`);
        setTimeout(() => { location.reload(); }, 4000);
    }
}

function startGame() {
    window.dispatchEvent(new Event('startGameRender'));

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
                if (clickedBase.owner !== currentPlayer) {
                    window.showMessage("ОШИБКА", "Это не ваша база!");
                    return;
                }
                if (clickedBase.hp >= clickedBase.maxHp) {
                    window.showMessage("ВНИМАНИЕ", "У базы уже максимальное здоровье!");
                    return;
                }
                if (playerEnergy[currentPlayer] < 1) {
                    window.showMessage("ОШИБКА", "Не хватает энергии!");
                    return;
                }

                clickedBase.hp = Math.min(clickedBase.maxHp, clickedBase.hp + 25);
                playerEnergy[currentPlayer] -= 1;
                
                updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
                updateHealthBar(clickedBase);
                
                window.showMessage("УСПЕХ", `База вылечена! HP: ${clickedBase.hp}%`);
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
