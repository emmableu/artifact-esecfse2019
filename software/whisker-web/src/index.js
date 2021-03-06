const {$} = require('./web-libs');

/* Replace this with the path of whisker's source for now. Will probably be published as a npm module later. */
const {CoverageGenerator, TestRunner, TAP13Listener} = require('../../whisker-main');

const Runtime = require('scratch-vm/src/engine/runtime');
const Thread = require('scratch-vm/src/engine/thread');

const TestTable = require('./components/test-table');
const TestEditor = require('./components/test-editor');
const Scratch = require('./components/scratch-stage');
const FileSelect = require('./components/file-select');
const Output = require('./components/output');

const Whisker = window.Whisker = {};
window.$ = $;

const serverUrl = 'http://localhost:3000';

const loadTestsFromString = function (string) {
    /* eslint-disable-next-line no-eval */
    let tests;
    try {
        tests = eval(`${string}; module.exports;`);
    } catch (err) {
        console.error(err);
        alert(`An error occurred while parsing the test code:\n${err}`);
        throw err;
    }
    tests = TestRunner.convertTests(tests);
    Whisker.tests = tests;
    Whisker.testEditor.setValue(string);
    Whisker.testTable.setTests(tests);
    return tests;
};

const getTestsFromServer = async function () {
    return $.get(`${serverUrl}/test_script`).done(string => loadTestsFromString(string));
};

const loadProjectListFromServer = async function () {
    const projectList = await Promise.resolve($.get(`${serverUrl}/project_list`));
    console.log('Project list loaded');
    console.log(projectList);
    return projectList;
};

const loadProjectFromSever = async function () {
    const projectName = Whisker.projectList.pop();
    Whisker.currentProjectName = projectName;
    console.log(`Loading ${projectName}`);
    const projectFile = await Promise.resolve($.ajax({
        url: `${serverUrl}/scratch_project/${projectName}`,
        xhrFields: {
            responseType: 'arraybuffer'
        }
    }));
    return projectFile;
};


const _runTestsWithCoverage = async function (vm, project, tests, testRunner) {
    await Whisker.scratch.vm.loadProject(project);
    CoverageGenerator.prepareThread(Thread, testRunner);
    CoverageGenerator.prepare(vm);

    const summary = await Whisker.testRunner.runTests(vm, project, tests);
    const coverage = CoverageGenerator.getCoverage();

    CoverageGenerator.restoreThread(Thread);

    const formattedSummary = TAP13Listener.formatSummary(summary);
    const formattedCoverage = TAP13Listener.formatCoverage(coverage);

    const summaryString = TAP13Listener.extraToYAML({summary: formattedSummary});
    const coverageString = TAP13Listener.extraToYAML({coverage: formattedCoverage});

    Whisker.outputRun.println([
        summaryString,
        coverageString
    ].join('\n'));

    Whisker.outputLog.clear();
    Whisker.outputLog.print(JSON.stringify(Whisker.trace));
};

const runTests = async function (tests) {
    Whisker.scratch.stop();
    const project = await Whisker.projectFileSelect.loadAsArrayBuffer();
    Whisker.trace = [];
    Whisker.outputRun.clear();
    Whisker.outputLog.clear();
    await _runTestsWithCoverage(Whisker.scratch.vm, project, tests, Whisker.testRunner);
};

const runTestUntilEnoughCoverage = async function (tests, nRunsToServer) {
    let project = null;
    let nRuns = 1;
    if (isNaN(nRunsToServer)) {
        project = await Whisker.projectFileSelect.loadAsArrayBuffer();
    } else {
        project = await loadProjectFromSever();
        nRuns = nRunsToServer;
    }
    for (let i = 0; i < nRuns; i++) {
        console.log(`${i}-th run`);
        let coverage = null;
        let coverageRate = 0;
        do {
            Whisker.scratch.stop();
            Whisker.trace = [];
            Whisker.outputRun.clear();
            Whisker.outputLog.clear();
            await _runTestsWithCoverage(Whisker.scratch.vm, project, tests, Whisker.testRunner);
            coverage = CoverageGenerator.getCoverage().getCoverage();
            coverageRate = coverage.covered / coverage.total;
            console.log(coverageRate);
        } while (coverageRate < 0.9);
        if (!isNaN(nRunsToServer)) {
            await $.post(`${serverUrl}/save_trace/${i}`, {
                testName: Whisker.currentProjectName,
                coverage: coverageRate,
                trace: JSON.stringify(Whisker.trace)
            });
        }
    }
};

const batchRun = async function () {
    Whisker.projectList = await loadProjectListFromServer();
    await getTestsFromServer();
    while (Whisker.projectList.length > 0) {
        await runTestUntilEnoughCoverage(Whisker.tests, 10);
        console.log(`Done testing ${Whisker.currentProjectName}`);
    }
};

const runAllTests = async function () {
    Whisker.scratch.stop();
    Whisker.outputRun.clear();
    Whisker.outputLog.clear();
    for (let i = 0; i < Whisker.projectFileSelect.length(); i++) {
        const project = await Whisker.projectFileSelect.loadAsArrayBuffer(i);
        Whisker.trace = [];
        Whisker.outputRun.println(`# project: ${Whisker.projectFileSelect.getName(i)}`);
        Whisker.outputLog.println(`# project: ${Whisker.projectFileSelect.getName(i)}`);
        await _runTestsWithCoverage(Whisker.scratch.vm, project, Whisker.tests, Whisker.testRunner);
        Whisker.outputRun.println();
        Whisker.outputLog.println();
    }
};

const quickRun = function () {
    loadTestsFromString(Whisker.testEditor.getValue());
    runAllTests();
};

const initScratch = function () {
    Whisker.scratch = new Scratch($('#scratch-stage'));

    $('#green-flag')
        .removeClass('btn-success')
        .addClass('btn-outline-success');
    $('#stop').prop('disabled', true);

    Whisker.scratch.vm.on(Runtime.PROJECT_RUN_START, () => {
        $('#green-flag')
            .removeClass('btn-outline-success')
            .addClass('btn-success');
        $('#stop').prop('disabled', false);
    });
    Whisker.scratch.vm.on(Runtime.PROJECT_RUN_STOP, () => {
        $('#green-flag')
            .removeClass('btn-success')
            .addClass('btn-outline-success');
        $('#stop').prop('disabled', true);
    });
};

const initComponents = function () {
    Whisker.testTable = new TestTable($('#test-table'), runTests, runTestUntilEnoughCoverage);
    Whisker.testTable.setTests([]);

    Whisker.outputRun = new Output($('#output-run'));
    Whisker.outputLog = new Output($('#output-log'));

    Whisker.testEditor = new TestEditor($('#test-editor'), loadTestsFromString);
    Whisker.testEditor.setDefaultValue();

    Whisker.projectFileSelect = new FileSelect($('#fileselect-project'),
        fileSelect => fileSelect.loadAsArrayBuffer().then(project => Whisker.scratch.loadProject(project)));
    Whisker.testFileSelect = new FileSelect($('#fileselect-tests'),
        fileSelect => fileSelect.loadAsString().then(string => loadTestsFromString(string)));

    Whisker.testRunner = new TestRunner();
    Whisker.testRunner.on(TestRunner.TEST_LOG, //TODO
        (test, message) => Whisker.outputLog.println(`[${test.name}] ${message}`));

    Whisker.trace = [];
    Whisker.testRunner.on(TestRunner.TEST_DUMP,
        (message, object) => {
            console.log("Testing");
            if (message) {
                // Whisker.outputLog.println(message);
            } else if (object) {
                if (object.type === 'block') {
                    // const aBlock = object;
                    // Whisker.outputLog.println(`target:${aBlock.name} op:${aBlock.opcode}`);
                    // Whisker.outputLog.println(`op:${aBlock.opcode}`);
                    Whisker.trace.push({
                        clockTime: object.clockTime,
                        sprite: object.sprite,
                        stageVariables: object.stageVariables,
                        block: object.block,
                        keysDown: object.keysDown
                    });
                } else if (object.type === 'sprites') {
                    // if (object.sprites[1].touchesSprites.length > 0) {
                    //    alert(object.sprites[1].touchesSprites[0]);
                    // }
                    Whisker.trace.push({sprites: object.sprites, keysDown: object.keysDown});
                }
            }
        }
        /* trace => {
            console.log('trace: ', trace);
            // for (let i = 0; i < trace.length; i++) {
            // Whisker.outputLog.println(JSON.stringify(trace[i]));
            // eslint-disable-next-line max-len
            trace.map(aSprite => Whisker.outputLog.println(`x:${aSprite.x} y:${aSprite.y} input:${aSprite.input}`));
            // Whisker.outputLog.println(`..`);
            // }
            Whisker.outputLog.println(`--`); */
    );
    Whisker.testRunner.on(TestRunner.TEST_ERROR, result => console.log(result.error));

    Whisker.tap13Listener = new TAP13Listener(Whisker.testRunner, Whisker.outputRun.println.bind(Whisker.outputRun));
};

const initEvents = function () {
    $('#green-flag').on('click', () => Whisker.scratch.greenFlag());
    $('#stop').on('click', () => Whisker.scratch.stop());
    $('#reset').on('click', () => Whisker.scratch.reset());
    $('#run-all-tests').on('click', runAllTests);
    $('#quick-run').on('click', quickRun);
    $('#batch-run').on('click', batchRun);

    $('#toggle-input') .on('change', event => {
        if ($(event.target).is(':checked')) {
            Whisker.scratch.enableInput();
        } else {
            Whisker.scratch.disableInput();
        }
    });

    $('#toggle-tests').on('change', event => {
        if ($(event.target).is(':checked')) {
            $(event.target)
                .parent()
                .addClass('active');
            Whisker.testTable.show();
        } else {
            $(event.target)
                .parent()
                .removeClass('active');
            Whisker.testTable.hide();
        }
    });

    $('#toggle-editor').on('change', event => {
        if ($(event.target).is(':checked')) {
            $(event.target)
                .parent()
                .addClass('active');
            Whisker.testEditor.show();
        } else {
            $(event.target)
                .parent()
                .removeClass('active');
            Whisker.testEditor.hide();
        }
    });

    $('#toggle-output').on('change', event => {
        if ($(event.target).is(':checked')) {
            $(event.target)
                .parent()
                .addClass('active');
            Whisker.outputRun.show();
        } else {
            $(event.target)
                .parent()
                .removeClass('active');
            Whisker.outputRun.hide();
        }
    });
    $('#toggle-log').on('change', event => {
        if ($(event.target).is(':checked')) {
            $(event.target)
                .parent()
                .addClass('active');
            Whisker.outputLog.show();
        } else {
            $(event.target)
                .parent()
                .removeClass('active');
            Whisker.outputLog.hide();
        }
    });
};

const toggleComponents = function () {
    if (window.localStorage) {
        console.log('Restoring which components are displayed.');
        const componentStates = localStorage.getItem('componentStates');
        if (componentStates) {
            const [input, tests, editor, output, log] = JSON.parse(componentStates);
            if (input) $('#toggle-input').click();
            if (tests) $('#toggle-tests').click();
            if (editor) $('#toggle-editor').click();
            if (output) $('#toggle-output').click();
            if (log) $('#toggle-log').click();
        }
    }
};


$(document).ready(() => {
    initScratch();
    initComponents();
    initEvents();
    toggleComponents();
});

window.onbeforeunload = function () {
    if (window.localStorage) {
        console.log('Saving which components are displayed.');
        const componentStates = [
            $('#toggle-input').is(':checked'),
            $('#toggle-tests').is(':checked'),
            $('#toggle-editor').is(':checked'),
            $('#toggle-output').is(':checked'),
            $('#toggle-log').is(':checked')
        ];
        window.localStorage.setItem('componentStates', JSON.stringify(componentStates));
    }
};
