import { PLANET_RADIUS, playerColors, getGeometry, layFlatOnSphere, createHealthBar } from './entities.js';
import { executeShot, canShoot } from './combat.js';
import { playAITurn } from './ai.js';
import { uiElements, updateUI, clearSelection } from './ui.js';

let scene, camera;
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
let fogMat;

// Переменные для нашей ручной камеры
let cameraDistance = 15;
let cameraAzimuth = 0;

export function initGame(_scene, _camera) {
    scene = _scene;
    camera = _camera;

    arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1, 0xffff00, 0.2, 0.1);
    arrowHelper.visible = false;
    scene.add(arrowHelper);

    window.addEventListener('wheel', (e) => {
        if (gameOver) return;
        cameraDistance += e.deltaY * 0.01;
        cameraDistance = Math.max(2, Math.min(20, cameraDistance));
    });

    setupFogOfWar();
    setupEventListeners();
}

// ИДЕАЛЬНАЯ КАМЕРА БЕЗ GIMBAL LOCK (90 ГРАДУСОВ ВДАЛИ, 70 ВБЛИЗИ)
export function updateCamera() {
    if (!selectedBase) {
        camera.position.set(0, 20, 20);
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0, 0);
        return;
    }

    const target = selectedBase.position;
    const normal = target.clone().normalize();
    
    let up = new THREE.Vector3(0, 1, 0);
    let tangent = new THREE.Vector3().crossVectors(normal, up).normalize();
    if (tangent.lengthSq() < 0.1) tangent.set(1, 0, 0).cross(normal).normalize();
    
    tangent.applyAxisAngle(normal, cameraAzimuth);
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

    // Угол от нормали: 0 (90 к поверхности) когда далеко, 20 (70 к поверхности) когда близко
    let t = (cameraDistance - 2) / 18;
    t = Math.max(0, Math.min(1, t));
    const phi = THREE.MathUtils.degToRad(20 * (1 - t));

    const offset = normal.clone().multiplyScalar(Math.cos(phi) * cameraDistance)
                 .add(bitangent.clone().multiplyScalar(Math.sin(phi) * cameraDistance));

    camera.position.copy(target).add(offset);
    camera.up.copy(tangent); // Вектор верха всегда перпендикулярен взгляду, никаких кувырков
    camera.lookAt(target);
}

function selectBase(base) {
    selectedBase = base;
    cameraDistance = 15;
    cameraAzimuth = 0;
    uiElements.uiPanel.style.display = 'block';
    arrowHelper.position.copy(base.position);
    currentAngle = base.aimAngle || 0;
    updateArrowDirection();
    arrowHelper.visible = true;
    updateCamera(); // Мгновенно ставим камеру на место
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
        let r = 2.0 / PLANET_RADIUS;
        fogMat.uniforms.uSources.value[i].set(base.position.x, base.position.y, base.position.z, r);
        count++;
    }
    fogMat.uniforms.uCount.value = count;

    bases.forEach(base => {
        if (base.owner === 1) {
            base.mesh.visible = true;
            if (base.healthSprite) base.healthSprite.visible = true;
            return;
        }
        let inVision = false;
        for (let ally of myBases) {
            if (ally.position.distanceTo(base.position) < 2.0) { inVision = true; break; }
        }
        base.mesh.visible = inVision;
        if (base.healthSprite) base.healthSprite.visible = inVision;
    });
}

function setupEventListeners() {
    // A/D ИСПРАВЛЕНЫ (просто меняем угол)
    uiElements.rotateLeft.addEventListener('click', () => {
        if (gameOver) return;
        cameraAzimuth -= Math.PI / 8;
    });

    uiElements.rotateRight.addEventListener('click', () => {
        if (gameOver) return;
        cameraAzimuth += Math.PI / 8;
    });

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

    uiElements.btnLeft.addEventListener('click', () => { if (selectedBase) { currentAngle += 11.25; updateArrowDirection(); } });
    uiElements.btnRight.addEventListener('click', () => { if (selectedBase) { currentAngle -= 11.25; updateArrowDirection(); } });

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
                    
                    executeShot(scene, bases, selectedBase, check.snappedAngle, power, selectedModuleType, endGame, () => {
                        updateFogOfWar();
                    });
                } else {
                    alert(check.reason);
                }
            }
        }
    });

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
        updateFogOfWar();

        if (currentPlayer > 1) {
            uiElements.bottomPanel.style.pointerEvents = 'none';
            uiElements.bottomPanel.style.opacity = '0.5';
            playAITurn({ scene, bases, currentPlayer, playerEnergy, playerGenerators, onTurnEnd: endTurn, onGameOver: endGame, updateUI: () => updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors), updateFog: updateFogOfWar });
        } else {
            uiElements.bottomPanel.style.pointerEvents = 'auto';
            uiElements.bottomPanel.style.opacity = '1';
            
            // АВТОВЫБОР БАЗЫ ИГРОКА (Стрелка возвращается)
            let hub = bases.find(b => b.owner === 1 && b.type === 'hub');
            if (hub) selectBase(hub);
        }
    });

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
    for (let p = 1; p <= totalPlayers; p++) {
        let pos = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(PLANET_RADIUS);
        const hub = new THREE.Mesh(getGeometry('hub'), new THREE.MeshBasicMaterial({ color: playerColors[p - 1] }));
        layFlatOnSphere(hub, pos);
        scene.add(hub);
        
        // НЕВИДИМЫЙ ХИТБОКС ДЛЯ ГЛАВНОЙ БАЗЫ
        const hitArea = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hitArea.position.copy(pos);
        scene.add(hitArea);
        
        let baseObj = { mesh: hub, hitArea: hitArea, position: pos, owner: p, hp: 100, maxHp: 100, type: 'hub', parent: null, angle: 0, aimAngle: 0 };
        bases.push(baseObj);
        createHealthBar(scene, baseObj);
        
        if (p === 1) {
            selectBase(baseObj);
        }
    }
    setupRaycaster();
    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
    updateFogOfWar();
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
    updateFogOfWar();

    if (currentPlayer > 1) {
        uiElements.bottomPanel.style.pointerEvents = 'none';
        uiElements.bottomPanel.style.opacity = '0.5';
        playAITurn({ scene, bases, currentPlayer, playerEnergy, playerGenerators, onTurnEnd: endTurn, onGameOver: endGame, updateUI: () => updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors), updateFog: updateFogOfWar });
    } else {
        uiElements.bottomPanel.style.pointerEvents = 'auto';
        uiElements.bottomPanel.style.opacity = '1';
        
        // АВТОВЫБОР БАЗЫ ИГРОКА (Стрелка возвращается)
        let hub = bases.find(b => b.owner === 1 && b.type === 'hub');
        if (hub) selectBase(hub);
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

        camera.updateMatrixWorld();
        scene.updateMatrixWorld();
        raycaster.setFromCamera(mouse, camera);
        
        // ИСПОЛЬЗУЕМ ХИТБОКСЫ (НЕВИДИМЫЕ ЗОНЫ)
        const hitboxes = bases.map(b => b.hitArea).filter(h => h !== undefined);
        const intersects = raycaster.intersectObjects(hitboxes);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const clickedBase = bases.find(b => b.hitArea === clickedMesh);
            
            if (selectedModuleType === 'heal') {
                if (clickedBase.owner === currentPlayer && playerEnergy[currentPlayer] >= 1) {
                    clickedBase.hp = Math.min(clickedBase.maxHp, clickedBase.hp + 25);
                    playerEnergy[currentPlayer] -= 1;
                    updateUI(currentPlayer, playerEnergy[currentPlayer], playerColors);
                }
                return;
            }

            if (clickedBase.owner !== currentPlayer) return; 
            if (clickedBase.type !== 'hub' && clickedBase.type !== 'relay') return; 

            selectBase(clickedBase);
        }
    });
}
