import { PLANET_RADIUS, playerColors, getGeometry, layFlatOnSphere, VISION_RADIUS, createHealthBar, updateHealthBar } from './entities.js';
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
let isShooting = false; 

let currentCameraAzimuth = 0; 
let fogMat;

let isRotatingLeft = false;
let isRotatingRight = false;
let isTurningLeft = false;
let isTurningRight = false;
const ROTATION_SPEED = 0.02;

let isPanning = false;
let panMouse = { x: 0, y: 0 };

export function initGame(_scene, _camera, _controls) {
    scene = _scene;
    camera = _camera;
    controls = _controls;

    window.addEventListener('contextmenu', e => e.preventDefault());

    arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 0.6, 0xffff00, 0.15, 0.1);
    arrowHelper.visible = false;
    scene.add(arrowHelper);

    setupFogOfWar();
    setupEventListeners();
}

export function updateCameraTilt() {
    // 1. ВРАЩЕНИЕ СТРЕЛКИ (КНОПКИ ◀ ▶)
    if (isTurningLeft || isTurningRight) {
        if (selectedBase && !isAITurn && !isShooting && !isPanning) {
            const step = isTurningLeft ? 2 : -2; 
            currentAngle += step;
            selectedBase.aimAngle = currentAngle;
            updateArrowDirection();
        }
    }

    if (!selectedBase || isAITurn || isShooting || isPanning) return;

    // 2. ВРАЩЕНИЕ КАМЕРЫ (КЛАВИШИ A/D)
    if (isRotatingLeft || isRotatingRight) {
        const target = selectedBase.position;
        const normal = target.clone().normalize();
        const step = isRotatingLeft ? ROTATION_SPEED : -ROTATION_SPEED;

        currentCameraAzimuth += step;

        const offset = camera.position.clone().sub(target);
        offset.applyAxisAngle(normal, step);
        camera.position.copy(target).add(offset);
        
        camera.up.applyAxisAngle(normal, step); 
    }

    // 3. НАКЛОН ПРИ ЗУМЕ
    const target = controls.target; 
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

function centerCameraOnBase(base) {
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
                         
    camera.position.copy(base.position).add(offset);
    controls.target.copy(base.position);
    camera.up.copy(normal); // КАК В РАБОЧЕЙ ВЕРСИИ
    controls.update();
}

function setupFogOfWar() {
    const fogGeo = new THREE.SphereGeometry(PLANET_RADIUS + 0.5, 64, 64);
    fogMat = new THREE.ShaderMaterial({
        uniforms: {
            uSources: { value: Array(50).fill(null).map(() => new THREE.Vector4(0, 0, 0, -1)) },
            uCount: { value: 0 }
        },
        vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            varying vec3 vPos; uniform vec4 uSources[50]; uniform int uCount;
            void main() {
                vec3 normPos = normalize(vPos);
                float alpha = 0.98; 
                for(int i = 0; i < 50; i++) {
                    if(i >= uCount) break;
                    vec3 src = normalize(uSources[i].xyz);
                    float dist = distance(normPos, src);
                    float localAlpha = smoothstep(uSources[i].w, uSources[i].w + 0.02, dist);
                    alpha = min(alpha, localAlpha * 0.98);
                }
                gl_FragColor = vec4(0.0, 0.0, 0.0, alpha); 
            }
        `,
        transparent: true, depthWrite: false, depthTest: false
    });
    const fogMesh = new THREE.Mesh(fogGeo, fogMat);
    fogMesh.renderOrder = 999;
    scene.add(fogMesh);
}

export function updateFogOfWar() {
    if (gameOver) return;
    const myBases = bases.filter(b => b.owner === 1);
    let count = 0;
    for (let i = 0; i < myBases.length && i < 50; i++) {
        let base = myBases[i];
        let r = (base.visionRadius || VISION_RADIUS) / PLANET_RADIUS;
        fogMat.uniforms.uSources.value[i].set(base.position.x, base.position.y, base.position.z, r);
        count++;
    }
    fogMat.uniforms.uCount.value = count;

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
            if (ally.position.distanceTo(base.position) < radius) { inVision = true; break; }
        }
        base.mesh.visible = inVision;
        if (base.lineMesh) base.lineMesh.visible = inVision && (base.parent ? base.parent.mesh.visible : false);
        if (base.domeMesh) base.domeMesh.visible = inVision;
        if (base.healthSprite) base.healthSprite.visible = inVision;
    });
}

function setupEventListeners() {
    window.addEventListener('pointerdown', (e) => {
        if (e.button === 2 && !isAITurn && !gameOver) {
            isPanning = true;
            panMouse.x = e.clientX;
            panMouse.y = e.clientY;
            controls.enableDamping = false; 
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (isPanning) {
            const dx = e.clientX - panMouse.x;
            const dy = e.clientY - panMouse.y;
            panMouse.x = e.clientX;
            panMouse.y = e.clientY;

            const target = controls.target;
            const normal = target.clone().normalize();
            
            let up = new THREE.Vector3(0, 1, 0);
            let tangentX = new THREE.Vector3().crossVectors(normal, up).normalize();
            if (tangentX.lengthSq() < 0.01) tangentX.set(1, 0, 0).cross(normal).normalize();
            let tangentY = new THREE.Vector3().crossVectors(normal, tangentX).normalize();
            
            const dist = camera.position.distanceTo(target);
            const speed = dist * 0.001;
            
            const moveVec = tangentX.multiplyScalar(-dx * speed).add(tangentY.multiplyScalar(dy * speed));
            
            camera.position.add(moveVec);
            target.add(moveVec);
            target.setLength(10); 

            const dirToCam = camera.position.clone().sub(target).normalize();
            camera.position.copy(target).add(dirToCam.multiplyScalar(dist));

            controls.update();
        }
    });

    window.addEventListener('pointerup', (e) => {
        if (e.button === 2) {
            isPanning = false;
            controls.enableDamping = true; 
        }
        if (e.button === 0) {
            isRotatingLeft = false;
            isRotatingRight = false;
            isTurningLeft = false;
            isTurningRight = false;
        }
    });

    window.addEventListener('keydown', (e) => {
        if (isAITurn || gameOver || !selectedBase || isShooting) return;
        if (e.repeat) return;
        const key = e.key.toLowerCase();
        if (key === 'a' || key === 'ф') isRotatingLeft = true; 
        else if (key === 'd' || key === 'в') isRotatingRight = true;
    });

    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'a' || key === 'ф') isRotatingLeft = false;
        if (key === 'd' || key === 'в') isRotatingRight = false;
    });

    // A/D КАМЕРА
    uiElements.rotateLeft.addEventListener('pointerdown', () => {
        if (isAITurn || gameOver || !selectedBase || isShooting) return;
        isRotatingLeft = true;
    });
    uiElements.rotateLeft.addEventListener('pointerup', () => isRotatingLeft = false);
    uiElements.rotateLeft.addEventListener('pointerleave', () => isRotatingLeft = false);

    uiElements.rotateRight.addEventListener('pointerdown', () => {
        if (isAITurn || gameOver || !selectedBase || isShooting) return;
        isRotatingRight = true;
    });
    uiElements.rotateRight.addEventListener('pointerup', () => isRotatingRight = false);
    uiElements.rotateRight.addEventListener('pointerleave', () => isRotatingRight = false);

    // ◀ ▶ СТРЕЛКА
    uiElements.btnLeft.addEventListener('pointerdown', () => {
        if (isAITurn || gameOver || !selectedBase || isShooting) return;
        isTurningLeft = true;
    });
    uiElements.btnLeft.addEventListener('pointerup', () => isTurningLeft = false);
    uiElements.btnLeft.addEventListener('pointerleave', () => isTurningLeft = false);

    uiElements.btnRight.addEventListener('pointerdown', () => {
        if (isAITurn || gameOver || !selectedBase || isShooting) return;
        isTurningRight = true;
    });
    uiElements.btnRight.addEventListener('pointerup', () => isTurningRight = false);
    uiElements.btnRight.addEventListener('pointerleave', () => isTurningRight = false);

    uiElements.spinBtn.addEventListener('click', () => {
        if (hasSpunThisTurn || gameOver || isAITurn || isShooting) return;
        spinEnergy();
    });

    uiElements.moduleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (isAITurn || isShooting) return;
            uiElements.moduleBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedModuleType = btn.getAttribute('data-type');
            if (selectedModuleType === 'heal') {
                uiElements.uiPanel.style.display = 'none';
                arrowHelper.visible = false;
            }
        });
    });

    uiElements.endTurnBtn.addEventListener('click', () => {
        if (gameOver || isAITurn || isShooting) return;
        endTurn();
    });

    uiElements.fireBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!selectedBase || gameOver || isAITurn || isShooting) return;
        
        if (!selectedModuleType) { alert("Сначала выберите модуль внизу!"); return; }

        const cost = getModuleCost(selectedModuleType);
        if (playerEnergy[currentPlayer] < cost) { alert("Не хватает энергии!"); return; }
        
        isCharging = true;
        power = 0;
        uiElements.powerBar.style.width = '0%';
        powerInterval = setInterval(() => {
            if (power < maxPower) {
                power += 0.2;
                uiElements.powerBar.style.width = (power / maxPower) * 100 + '%';
            }
        }, 50);
    });

    window.addEventListener('pointerup', () => {
        if (isCharging) {
            isCharging = false;
            clearInterval(powerInterval);
            uiElements.powerBar.style.width = '0%';
            
            if (isShooting) return; 
            if (power <= 0) power = 1; 

            const cost = getModuleCost(selectedModuleType);
            if (playerEnergy[currentPlayer] >= cost) {
                
                const check = canShoot(bases, selectedBase, currentAngle, selectedModuleType);
                if (!check.allowed) {
                    alert(check.reason);
                    return; 
                }

                isShooting = true; 
                uiElements.fireBtn.disabled = true;
                uiElements.fireBtn.innerText = "ПОЛЕТ...";

                setTimeout(() => { 
                    isShooting = false; 
                    uiElements.fireBtn.disabled = false;
                    uiElements.fireBtn.innerText = "ЗАЖМИ ДЛЯ ВЫСТРЕЛА";
                }, 1500);

                playerEnergy[currentPlayer] -= cost;
                updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
                
                executeShot(scene, bases, selectedBase, check.snappedAngle, power, selectedModuleType, 0, playerGenerators, 
                    (genCount) => alert(`Генератор! Твоя выработка: от ${5 + genCount} до ${8 + genCount}`),
                    (owner) => endGame(owner),
                    () => {
                        isShooting = false; 
                        uiElements.fireBtn.disabled = false;
                        uiElements.fireBtn.innerText = "ЗАЖМИ ДЛЯ ВЫСТРЕЛА";
                        updateFogOfWar();
                    },
                    1, 
                    VISION_RADIUS
                );
            } else if (playerEnergy[currentPlayer] < cost) {
                alert("Не хватает энергии!");
            }
        }
    });

    uiElements.startBtn.addEventListener('click', () => {
        const aiCount = parseInt(uiElements.aiCountInput.value) || 1;
        totalPlayers = 1 + aiCount;
        for (let i = 1; i <= totalPlayers; i++) { playerEnergy[i] = 0; playerGenerators[i] = 0; }
        uiElements.startScreen.style.display = 'none';
        startGame();
    });
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
    
    uiElements.spinBtn.disabled = true;
    uiElements.spinBtn.innerText = `+${rolledEnergy}`;
    setTimeout(() => { uiElements.spinBtn.innerText = '⚡'; }, 1000); 
    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
}

function endTurn() {
    if (gameOver) return;
    
    isShooting = false; 
    isRotatingLeft = false;
    isRotatingRight = false;
    isTurningLeft = false;
    isTurningRight = false;
    
    uiElements.fireBtn.disabled = false;
    uiElements.fireBtn.innerText = "ЗАЖМИ ДЛЯ ВЫСТРЕЛА";
    
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
    clearSelection();
    selectedBase = null;
    arrowHelper.visible = false;
    
    uiElements.spinBtn.disabled = false;
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
    }
}

function endGame(owner) {
    gameOver = true;
    alert(`ИГРА ОКОНЧЕНА! Победил Игрок ${owner}!`);
    setTimeout(() => { location.reload(); }, 3000);
}

function startGame() {
    let positions = [];
    const minAngle = Math.PI / (totalPlayers * 1.2); 

    for (let p = 1; p <= totalPlayers; p++) {
        let pos;
        let valid = false;
        let attempts = 0;
        while (!valid && attempts < 100) {
            attempts++;
            pos = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(PLANET_RADIUS);
            valid = true;
            for (let existingPos of positions) {
                if (pos.angleTo(existingPos) < minAngle) { valid = false; break; }
            }
        }
        positions.push(pos);

        const hub = new THREE.Mesh(getGeometry('hub'), new THREE.MeshBasicMaterial({ color: playerColors[p - 1] }));
        layFlatOnSphere(hub, pos);
        scene.add(hub);
        
        let baseObj = { mesh: hub, position: pos, owner: p, hp: 100, maxHp: 100, type: 'hub', parent: null, angle: 0, lineMesh: null, visionRadius: VISION_RADIUS, aimAngle: 0 };
        bases.push(baseObj);
        createHealthBar(scene, baseObj);
        
        if (p === 1) {
            selectedBase = baseObj;
            centerCameraOnBase(selectedBase); 
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
        if (event.button !== 0) return; 
        
        isPanning = false; 
        
        if (isAITurn || gameOver || isShooting) return;
        if (event.target.closest('#bottom-panel') || event.target.closest('#ui-panel') || event.target.closest('#start-screen')) return;

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = (event.clientY / window.innerHeight) * 2 + 1;

        camera.updateMatrixWorld();
        raycaster.setFromCamera(mouse, camera);
        
        const baseMeshes = bases.filter(b => b.mesh.visible).map(b => b.mesh);
        const intersects = raycaster.intersectObjects(baseMeshes);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const clickedBase = bases.find(b => b.mesh === clickedMesh);
            
            if (selectedModuleType === 'heal') {
                if (clickedBase.owner === currentPlayer && playerEnergy[currentPlayer] >= 1) {
                    clickedBase.hp = Math.min(clickedBase.maxHp, clickedBase.hp + 25);
                    updateHealthBar(clickedBase);
                    playerEnergy[currentPlayer] -= 1;
                    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
                    alert(`База вылечена! HP: ${clickedBase.hp}`);
                } else { alert("Нельзя лечить или не хватает энергии!"); }
                return;
            }

            if (clickedBase.owner !== currentPlayer) { alert("Это база противника!"); return; }
            if (clickedBase.type !== 'hub' && clickedBase.type !== 'relay') { alert("С этого модуля нельзя стрелять!"); return; }

            selectedBase = clickedBase;
            centerCameraOnBase(selectedBase); 
            
            uiElements.uiPanel.style.display = 'block';
            arrowHelper.position.copy(selectedBase.position);
            
            currentAngle = selectedBase.aimAngle || 0;
            updateArrowDirection();
            arrowHelper.visible = true;
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
