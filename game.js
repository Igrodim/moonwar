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
                base.lineMesh.geometry.setDrawRange(0, Infinity); // Рисуем всю линию
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

        // ФИКС: Математическая обрезка линии
        if (base.lineMesh) {
            if (!inVision) {
                base.lineMesh.visible = false;
            } else {
                base.lineMesh.visible = true;
                
                // Ищем, какая часть линии находится в тумане
                let visibleIndexCount = 0;
                const points = base.curve.getPoints(100);
                
                for (let i = points.length - 1; i >= 0; i--) {
                    let p = points[i];
                    let inVision = false;
                    for (let ally of myBases) {
                        const radius = ally.visionRadius || VISION_RADIUS;
                        if (ally.position.distanceTo(p) < radius) {
                            inVision = true;
                            break;
                        }
                    }
                    if (inVision) {
                        visibleIndexCount = i;
                        break;
                    }
                }
                
                // Отрисовываем только видимую часть
                // Каждый сегмент линии имеет 8 вершин по ширине и 2 по длине (итого 16)
                base.lineMesh.geometry.setDrawRange(0, visibleIndexCount * 16 * 2);
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
                    () => updateFog
