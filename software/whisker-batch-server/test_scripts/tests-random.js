/* eslint-disable eqeqeq */
/* eslint-disable no-loop-func */
/* eslint-disable max-len */

const test = async function (t) {

    t.onConstraintFailure('nothing');
    t.setRandomInputInterval(150);
    t.detectRandomInputs({duration: [50, 100]});

    t.greenFlag();

    await t.runForTime(20000);

    
};

module.exports = [
    {
        test: test,
        name: 'Test',
        description: 'Test for run 5 seconds',
        categories: []
    }
];

/*
 * 01: fruitSize
 * 02: timerInit
 * 03: bowlInit
 * 04: bowlMove
 * 05: bowlMoveDetails
 * 06: appleFalling
 * 07: appleFallingDetails
 * 08: bananaFalling
 * 09: bananaFallingDetails
 * 10: appleSpawn
 * 11: appleSpawnYPosition
 * 12: appleSpawnRandomXPosition
 * 13: bananaSpawn
 * 14: bananaSpawnYPosition
 * 15: bananaSpawnRandomXPosition
 * 16: onlyOneApple
 * 17: onlyOneBanana
 * 18: bananaDelayBeginning
 * 19: bananaDelayRespawn
 * 20: applePoints
 * 21: appleGameOver
 * 22: appleGameOverMessage
 * 23: bananaBowlPoints
 * 24: bananaGroundPoints
 * 25: bananaGroundMessage
 * 26: timerTick
 */
