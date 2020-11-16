const {Input} = require('../vm/inputs');
const Variable = require('../vm/variable');
const _coveredBlockIds = new Set();
const _blockIdsPerSprite = new Map();

/* Only works with Scratch 3.0 (.sb3) projects. sb2 projects can be easily converted by saving them with Scratch 3.0. */
class Coverage {
    constructor (coveredBlockIdsPerSprite, blockIdsPerSprite) {

        /**
         * @type {Map<string, Set<string>>}
         */
        this.coveredBlockIdsPerSprite = coveredBlockIdsPerSprite;

        /**
         * @type {Map<string, Set<string>>}
         */
        this.blockIdsPerSprite = blockIdsPerSprite;
    }

    /**
     * @return {Map<string,Set<string>>} .
     */
    getCoveredBlockIdsPerSprite () {
        return new Map(this.coveredBlockIdsPerSprite);
    }

    /**
     * @return {Map<string,Set<string>>} .
     */
    getBlockIdsPerSprite () {
        return new Map(this.blockIdsPerSprite);
    }

    /**
     * @return {Map<string,{covered: number, total: number}>} .
     */
    getCoveragePerSprite () {
        const coverage = new Map();

        for (const [spriteName, coveredBlockIds] of this.coveredBlockIdsPerSprite) {
            const numCovered = coveredBlockIds.size;
            const numTotal = this.blockIdsPerSprite.get(spriteName).size;
            coverage.set(spriteName, {covered: numCovered, total: numTotal});
        }

        return coverage;
    }

    /**
     * @return {{covered: number, total: number}} .
     */
    // TODO: rename to getCoverageTotal
    getCoverage () {
        let numCovered = 0;
        let numTotal = 0;

        for (const coveredBlockIds of this.coveredBlockIdsPerSprite.values()) {
            numCovered += coveredBlockIds.size;
        }
        for (const blockIds of this.blockIdsPerSprite.values()) {
            numTotal += blockIds.size;
        }

        return {covered: numCovered, total: numTotal};
    }
}

/**
 * Keeps a reference to all "main" blocks (i.e. blocks that don't represent a parameter), and checks which of these
 * blocks are executed by any prepared Thread. This means that the coverage can only be measured on one vm at a time.
 */
class CoverageGenerator {

    /**
     * @param {class} Thread .
     */
    static prepareThread (Thread, testRunner) {
        if (!Thread.hasOwnProperty('real_pushStack')) {
            Thread.real_pushStack = Thread.prototype.pushStack;
            Thread.prototype.pushStack = function (blockId) {
                if (blockId) _coveredBlockIds.add(blockId);
                if (this.topBlock) _coveredBlockIds.add(this.topBlock);
                Thread.real_pushStack.call(this, blockId);
            };
        }
        if (!Thread.hasOwnProperty('real_reuseStackForNextBlock')) {
            Thread.real_reuseStackForNextBlock = Thread.prototype.reuseStackForNextBlock;
            Thread.prototype.reuseStackForNextBlock = function (blockId) {

                const target = this.target;
                const block = target.blocks.getBlock(this.peekStack());
                const opcode = target.blocks.getOpcode(block);
                // XXX: output only blocks of the bowl.
                if (opcode && target.constructor.name === 'RenderedTarget') {

                    const otherSpritesName = target.runtime.targets
                        .filter(t => t.sprite).map(t => t.getName());

                    let keysDown = target.runtime.ioDevices.keyboard._keysPressed;
                    keysDown = keysDown.map(x => Input.scratchKeyToKeyString(x));

                    const clockTime = target.runtime.ioDevices.clock.projectTimer();

                    const input = target.blocks.getInputs(block);
                    const inputContent = Object.keys(input).map((key, index) =>
                        target.blocks.getBlock(input[key].block)
                    );

                    const stage = target.runtime.getTargetForStage();
                    const stageVariables = stage.variables;
                    const variables = target.variables;

                    testRunner.dump(false,
                        {
                            type: 'block',
                            clockTime: clockTime,
                            sprite: {
                                name: target.getName(),
                                x: target.x,
                                y: target.y,
                                size: target.size,
                                touching: otherSpritesName.filter(x =>
                                    (x !== target.getName() && target.isTouchingSprite(x))
                                ),
                                variables: variables
                            },
                            stageVariables: stageVariables,
                            block: {
                                id: block.id,
                                opcode: block.opcode,
                                fields: target.blocks.getFields(block),
                                inputs: inputContent,
                                mutation: target.blocks.getMutation(block)
                            },
                            keysDown: keysDown
                        });
                }

                if (blockId) _coveredBlockIds.add(blockId);
                if (this.topBlock) _coveredBlockIds.add(this.topBlock);
                Thread.real_reuseStackForNextBlock.call(this, blockId);
            };
        }
    }

    /**
     * @param {class} Thread .
     */
    static restoreThread (Thread) {
        if (Thread.hasOwnProperty('real_pushStack')) {
            Thread.prototype.pushStack = Thread.real_pushStack;
            delete Thread.real_pushStack;
        }
        if (Thread.hasOwnProperty('real_reuseStackForNextBlock')) {
            Thread.prototype.reuseStackForNextBlock = Thread.real_reuseStackForNextBlock;
            delete Thread.real_reuseStackForNextBlock;
        }
    }

    /**
     * @param {VirtualMachine} vm .
     */
    static prepare (vm) {
        _coveredBlockIds.clear();
        _blockIdsPerSprite.clear();

        for (const target of vm.runtime.targets) {
            if (target.hasOwnProperty('blocks')) {
                const targetName = target.getName();
                let blockIds = _blockIdsPerSprite.get(targetName);
                if (typeof blockIds === 'undefined') {
                    blockIds = new Set();
                    _blockIdsPerSprite.set(targetName, blockIds);
                }

                for (const scriptId of target.blocks.getScripts()) {
                    this._addBlocks(target.blocks, blockIds, scriptId);
                }
            }
        }
    }

    /**
     * @param {Blocks} targetBlocks .
     * @param {Set<string>} blockIds .
     * @param {string} blockId .
     * @private
     */
    static _addBlocks (targetBlocks, blockIds, blockId) {
        if (blockIds.has(blockId)) {
            return;
        }
        blockIds.add(blockId);

        /* Add branches of C-shaped blocks. */
        let branchId = targetBlocks.getBranch(blockId, 1);
        for (let i = 2; branchId !== null; i++) {
            this._addBlocks(targetBlocks, blockIds, branchId);
            branchId = targetBlocks.getBranch(blockId, i);
        }

        /* Add the next block. */
        const nextId = targetBlocks.getNextBlock(blockId);
        if (nextId !== null) {
            this._addBlocks(targetBlocks, blockIds, nextId);
        }
    }

    /**
     * @return {Map<string, Set<string>>} .
     */
    static getCoveredBlockIdsPerSprite () {
        const coveredMap = new Map();
        for (const [spriteName, blockIds] of _blockIdsPerSprite) {
            const coveredBlockIds = new Set();
            coveredMap.set(spriteName, coveredBlockIds);
            for (const blockId of blockIds) {
                if (_coveredBlockIds.has(blockId)) {
                    coveredBlockIds.add(blockId);
                }
            }
        }
        return coveredMap;
    }

    /**
     * @return {Map<string, Set<string>>} .
     */
    static getBlockIdsPerSprite () {
        const map = new Map();
        for (const [spriteName, blockIds] of _blockIdsPerSprite) {
            map.set(spriteName, new Set(blockIds));
        }
        return map;
    }

    /**
     * @return {Coverage} .
     */
    static getCoverage () {
        return new Coverage(this.getCoveredBlockIdsPerSprite(), this.getBlockIdsPerSprite());
    }

    /**
     * @param {Coverage[]} coverages .
     * @return {Coverage} .
     */
    /* Assumes the coverage scores are all from the same project. */
    static mergeCoverage (coverages) {
        if (coverages.length === 0) {
            return new Coverage(new Map(), new Map());
        }

        const coveredBlockIdsPerSprite = new Map();
        const blockIdsPerSprite = new Map(coverages[0].blockIdsPerSprite);

        for (const spriteName of coverages[0].coveredBlockIdsPerSprite.keys()) {
            const coveredIdsLists = coverages.map(cov => Array.from(cov.coveredBlockIdsPerSprite.get(spriteName)));
            coveredBlockIdsPerSprite.set(spriteName, new Set([].concat(...coveredIdsLists)));
        }

        return new Coverage(coveredBlockIdsPerSprite, blockIdsPerSprite);
    }
}

module.exports = CoverageGenerator;
