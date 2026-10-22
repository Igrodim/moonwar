import { canShoot, executeShot } from './combat.js';
import { PLANET_RADIUS } from './entities.js';

export function playAITurn(gameContext) {
    const { scene, camera, controls, bases, currentPlayer, playerEnergy, playerGenerators, onTurnEnd, onGameOver, onGeneratorBuilt } = gameContext;

    const minRoll = 5 + playerGenerators[currentPlayer];
    const maxRoll = 8 + playerGenerators[currentPlayer];
    playerEnergy[currentPlayer] += Math.floor(Math.random() * (maxRoll - minRoll + 1)) + minRoll;
    if (gameContext.updateUI) gameContext.updateUI();

    setTimeout(() => {
        let myBases = bases.filter(b => b.owner === currentPlayer && (b.type === 'hub' || b.type === 'relay'));
        if (myBases.length > 0) {
            let startBase = myBases[0];
            let module = playerEnergy[currentPlayer] >= 7 ? 'relay' : 'bomb';
            let cost = module === 'relay' ? 7 : 1;
            
            if (playerEnergy[currentPlayer] >= cost) {
                let randomAngle = Math.random() * 360;
                let check = canShoot(bases, startBase, randomAngle, module);
                if (check.allowed) {
                    playerEnergy[currentPlayer] -= cost;
                    if (gameContext.updateUI) gameContext.updateUI();
                    
                    executeShot(scene, bases, startBase, check.snappedAngle, 8, module, playerGenerators, onGeneratorBuilt, onGameOver, () => {
                        setTimeout(() => playAITurn(gameContext), 1000); 
                    });
                    return;
                }
            }
        }
        setTimeout(onTurnEnd, 1000);
    }, 1000);
}
