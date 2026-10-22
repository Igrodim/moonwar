import { canShoot, executeShot } from './combat.js';

export function playAITurn(gameContext) {
    const { scene, bases, currentPlayer, playerEnergy, playerGenerators, onTurnEnd, onGameOver, updateUI, updateFog } = gameContext;

    const minRoll = 5 + playerGenerators[currentPlayer];
    const maxRoll = 8 + playerGenerators[currentPlayer];
    playerEnergy[currentPlayer] += Math.floor(Math.random() * (maxRoll - minRoll + 1)) + minRoll;
    if (updateUI) updateUI();

    setTimeout(() => {
        let myBases = bases.filter(b => b.owner === currentPlayer && (b.type === 'hub' || b.type === 'relay'));
        if (myBases.length > 0 && playerEnergy[currentPlayer] >= 1) {
            let startBase = myBases[0];
            let module = playerEnergy[currentPlayer] >= 3 ? 'homing' : 'bomb';
            let cost = module === 'homing' ? 3 : 1;
            
            let randomAngle = Math.random() * 360;
            let check = canShoot(bases, startBase, randomAngle, module);
            
            if (check.allowed) {
                playerEnergy[currentPlayer] -= cost;
                if (updateUI) updateUI();
                executeShot(scene, bases, startBase, check.snappedAngle, 8, module, onGameOver, () => {
                    if (updateFog) updateFog();
                    setTimeout(onTurnEnd, 1000); 
                });
                return;
            }
        }
        setTimeout(onTurnEnd, 1000);
    }, 1000);
}
