import { canShoot, executeShot } from './combat.js';

export function playAITurn(gameContext) {
    const { scene, camera, controls, bases, currentPlayer, playerEnergy, playerGenerators, PLANET_RADIUS, onTurnEnd, onGameOver, onGeneratorBuilt } = gameContext;

    // Крутим энергию
    const minRoll = 5 + playerGenerators[currentPlayer];
    const maxRoll = 8 + playerGenerators[currentPlayer];
    const rolledEnergy = Math.floor(Math.random() * (maxRoll - minRoll + 1)) + minRoll;
    playerEnergy[currentPlayer] += rolledEnergy;
    
    if (gameContext.updateUI) gameContext.updateUI();

    setTimeout(() => {
        let myBases = bases.filter(b => b.owner === currentPlayer && (b.type === 'hub' || b.type === 'relay'));
        
        if (myBases.length > 0) {
            let startBase = myBases[Math.floor(Math.random() * myBases.length)];
            let module = Math.random() > 0.3 ? 'relay' : 'bomb'; 
            let cost = getModuleCost(module);
            
            if (playerEnergy[currentPlayer] >= cost) {
                let randomAngle;
                let check;
                let allowed = false;
                
                for (let i = 0; i < 10; i++) {
                    randomAngle = Math.floor(Math.random() * 16) * 22.5;
                    check = canShoot(bases, startBase, randomAngle, module);
                    if (check.allowed) {
                        allowed = true;
                        break;
                    }
                }

                if (allowed) {
                    playerEnergy[currentPlayer] -= cost;
                    if (gameContext.updateUI) gameContext.updateUI();
                    
                    let randomPower = Math.random() * 8 + 2; 
                    
                    camera.position.copy(startBase.position.clone().normalize().multiplyScalar(PLANET_RADIUS + 10));
                    controls.target.copy(startBase.position);
                    controls.update();
                    
                    executeShot(scene, bases, startBase, check.snappedAngle, randomPower, module, check.sector, playerGenerators, onGeneratorBuilt, onGameOver, () => {
                        setTimeout(onTurnEnd, 1000); 
                    });
                    return;
                }
            }
        }
        setTimeout(onTurnEnd, 1000);
    }, 1500);
}

function getModuleCost(type) {
    if (['bomb', 'heal', 'drone'].includes(type)) return 1;
    if (['aao', 'homing'].includes(type)) return 3;
    if (['relay', 'dome', 'generator'].includes(type)) return 7;
    return 0;
}
