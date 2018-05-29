#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var chalk = _interopDefault(require('chalk'));
var ProgressBar = _interopDefault(require('progress'));

const constant = /\b(\d+|true|false)\b/g;
const operator = /\+|\!|\-|&|>|<|\||\*|\=/g;
const string = /('|"|`)([\s\S]*?)(\1)/g;
const commentLine = /\/\/(.*)/g;
const commentMultiline = /\/\*([\s\S]*?)\*\//g;
const escapedStringChars = /\\('|"|`)/g;

// @todo maybe use esprima for this
function extractFunctionNames(source) {
    source = source.replace(commentLine, '');
    source = source.replace(commentMultiline, '');
    source = source.replace(escapedStringChars, '');
    source = source.replace(string, '__STRING__');

    const re = /export(?: async)?\s+function\s+(test.*?)\(/g;
    let match;
    const names = [];
    while (match = re.exec(source)) {
        names.push(match[1]);
    }

    return names;
}

function getElapsedTime(startTime, endTime) {
    const elapsed = endTime / 1000 - startTime / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.round((elapsed - (minutes * 60)) * 100) / 100;

    let response = '';
    if (minutes > 0) {
        response += `${minutes} minute${minutes != 1 ? 's' : ''}, `;
    }

    if (seconds < 1 && minutes > 0) {
        return response.slice(0, -2);
    }

    response += `${seconds} second${seconds != 1 ? 's' : ''}`;
    return response
}

function spaces(count) {
    let str = '';
    for (let i = 0; i < count; i++) {
        str += ' ';
    }
    return str;
}

function formatLine(number, width) {
    let numberString = number.toString();
    let numberWidth = numberString.length;
    while (numberWidth < width) {
        numberString = ` ${numberString}`;
        numberWidth += 1;
    }

    return numberString;
}

function looksTheSame(first, second) {
    // change unquoted object properties to quoted
    first = first.replace(/([{,]\s*)(.+?):/g, (match, first, second) => {
        return `${first}"${second}":`;
    });

    try {
        const parsedFirst = JSON.parse(first);
        return JSON.stringify(parsedFirst) === JSON.stringify(second);
    } catch(e) {
        return false;
    }
}

function findLineAndColumnForPosition(code, index) {
    const lines = code.split('\n');
    let pos = 0;
    let lastPos = 0;
    let line = 0;
    let column = 0;
    while (pos < index) {
        const nextLine = lines.shift();
        line += 1;
        lastPos = pos;
        pos += nextLine.length + 1; // 1 for the \n
    }

    // If there is nothing to loop over
    if (line === 0) {
        line = 1;
    }

    column += (index - lastPos);
    return { line, column }
}

function findPositionForLineAndColumn(code, { line = 0, column = 0} = {}) {
    // Line is 1 indexed, Column is 0 indexed
    const lines = code.split('\n');
    let position = 0;
    for (const lineToCount of lines.slice(0, line - 1)) {
        position += lineToCount.length + 1; // \n
    }

    position += column;
    return position;
}

const esprima = require('esprima');
const escodegen = require('escodegen');
const MagicString = require('magic-string');

const escodegenOptions = {
    format: {
        indent: {
            style: ''
        },
        newline: '',
        json: true
    }
};

function getData(assertCode, file, position) {
    const ast = esprima.parse(assertCode, { tolerant: true, range: true });
    const args = ast.body[0].expression.arguments;

    const isBinaryExpression = args[0].type === 'BinaryExpression';
    const leftExpression = isBinaryExpression ? args[0].left : args[0];

    let data = {
        source: {
            code: assertCode,
            file,
            position
        },
        left: {
            code: escodegen.generate(leftExpression, escodegenOptions),
            value: '{{LEFT_VALUE}}',
            range: leftExpression.range
        },
        value: '{{VALUE}}'
    };

    if (isBinaryExpression) {
        data.operator = args[0].operator;
        data.right = {
            code: escodegen.generate(args[0].right, escodegenOptions),
            value: '{{RIGHT_VALUE}}',
            range: args[0].right.range
        };
    }

    if (args.length > 1) {
        data.message = escodegen.generate(args[1], escodegenOptions);
    }

    return data;
}

function getReplacement(assertCode, file, position, index) {
    const data = getData(assertCode, file, position);
    let newCode = `const _left${index} = ${data.left.code};`;
    let value = `_left${index}`;
    if (data.right) {
        newCode += `\nconst _right${index} = ${data.right.code};`;
        value += ` ${data.operator} _right${index}`;
    }

    let dataString = JSON.stringify(data);

    dataString = dataString.replace('"{{LEFT_VALUE}}"', `_left${index}`);
    dataString = dataString.replace('"{{RIGHT_VALUE}}"', `_right${index}`);
    dataString = dataString.replace('"{{VALUE}}"', value);

    newCode += `\nt.assert(${dataString}`;
    if (data.message) {
        newCode += `, ${data.message}`;
    }
    newCode += ');';

    return newCode;
}

function transform(code, id) {
    const re = /((?:\/\/|\/\*|['"`])\s*)?\bt\.assert\(.*?\);?(?=\n)/g;
    let match;
    let start;
    let end;
    let hasReplacements = false;

    const magicString = new MagicString(code);

    let i = 0;
    while (match = re.exec(code)) {
        if (match[1]) {
            continue;
        }

        i += 1;
        hasReplacements = true;

        start = match.index;
        end = start + match[0].length;

        const position = findLineAndColumnForPosition(code, start);
        const replacement = getReplacement(match[0], id, position, i);

        magicString.overwrite(start, end, replacement);
    }

    if (!hasReplacements) {
        return null;
    }

    let result = {
        code: magicString.toString(),
        map: magicString.generateMap({ hires: true })
    };

    return result;
}

function assert() {
    return {
        name: 'assert',
        transform(code, id) {
            return transform(code, id);
        }
    }
}

const express = require('express');
const fs = require('fs');
const rollup = require('rollup');
const buble = require('rollup-plugin-buble');
const replace = require('rollup-plugin-replace');
const coverage = require('rollup-plugin-istanbul');

async function getBundle(filePath, isNode=false, includeCoverage=false) {
    return new Promise(async (resolve, reject) => {
        try {
            const plugins = [
                replace({
                    TEST_FILE_PATH: `${process.cwd()}/${filePath}`
                }),
                buble({
                    target: {
                        chrome: 63
                    },
                    jsx: 'React.createElement'
                }),
                assert()
            ];

            if (isNode && includeCoverage) {
                plugins.push(coverage({
                    exclude: [filePath]
                }));
            }

            const bundle = await rollup.rollup({
                input: isNode ? 'src/run-node.js': 'src/run-browser.js',
                external: ['chalk'],
                treeshake: true, // for testing
                plugins
            });

            let { code, map } = await bundle.generate({
                format: isNode ? 'cjs': 'iife',
                freeze: true,
                sourcemap: 'inline'
            });

            code += `\n//# sourceMappingURL=${map.toUrl()}\n`;
            resolve(code);
        } catch (e) {
            reject(e);
        }
    });
}

async function bundleHandler(req, res) {
    const filePath = req.params[0];

    const exists = fs.existsSync(filePath);
    if (!exists) {
        res.status(404).send('File does not exist');
        return;
    }

    try {
        const code = await getBundle(filePath);
        res.set('Content-Type', 'application/javascript');
        res.send(code);
    } catch(e) {
        res.set('Error', JSON.stringify(e.toString())).status(500).send({message: e.toString()});
        return;
    }
}

function runHandler(req, res) {
    const filePath = req.params[0];
    const bundlePath = `/bundle/${filePath}`;
    res.status(200).send(`<!DOCTYPE html><head><title>${filePath} – Test Runner</title></head><body><script src="${bundlePath}"></script></body>`);
}

async function startServer(options) {
    const app = express();
    app.get(/\/bundle\/(.*)/, bundleHandler);
    app.get(/\/run\/(.*)/, runHandler);
    return app.listen(2662, () => {
        if (options.verbose) {
            console.log('Server started at http://localhost:2662…');
        }
    });
}

function syntaxHighlight(code) {
    let strings = [];
    let stringMap = {};

    if (code === undefined) {
        return chalk.yellow('undefined');
    }

    code = code.replace(string, (match) => {
        const stringName = `__STRING__${strings.length}`;
        strings.push(stringName);
        stringMap[stringName] = match;
        return stringName;
    });

    code = code.replace(operator, (match) => {
        return chalk.magenta(match)
    });

    code = code.replace(constant, (match) => {
        return chalk.yellow(match);
    });

    for (const stringName of strings) {
        code = code.replace(stringName, chalk.green(stringMap[stringName]));
    }

    return code;
}

const sourceMap = require('source-map');
const v8toIstanbul = require('v8-to-istanbul');

async function resolveSourceMap(coverage, ignore) {
    // Should return an array like
    // [{
    //     url: "filePath",
    //     ranges: [
    //         {
    //             start: 0,
    //             end: 100
    //         }
    //     ],
    //     text: "fileContents"
    // }]
    const newCoverage = [];

    const [, sourceMapString] = coverage.text.split('# sourceMappingURL=data:application/json;charset=utf-8;base64,');
    const buf = Buffer.from(sourceMapString, 'base64');
    const sourceMapData = JSON.parse(buf.toString());

    let remove = -1;
    for (let i = 0; i < sourceMapData.sources.length; i++) {
        if (sourceMapData.sources[i].indexOf(ignore) > -1) {
            remove = i;
        }

        newCoverage.push({
            url: sourceMapData.sources[i],
            ranges: [],
            text: sourceMapData.sourcesContent[i]
        });
    }

    await sourceMap.SourceMapConsumer.with(sourceMapData, null, consumer => {
        for (const range of coverage.ranges) {
            addToCoverage(newCoverage, sourceMapData.sources, coverage.text, range, consumer);
        }

    });

    if (remove > -1) {
        newCoverage.splice(remove, 1);
    }

    return Promise.resolve(newCoverage);
}

function addRangeToCoverage(newCoverage, sources, start, end) {
    const index = sources.indexOf(start.source);
    newCoverage[index].ranges.push({
        start: findPositionForLineAndColumn(newCoverage[index].text, start),
        end: findPositionForLineAndColumn(newCoverage[index].text, end)
    });
}

function addToCoverage(newCoverage, sources, code, range, consumer) {
    const start = findLineAndColumnForPosition(code, range.start);
    const end = findLineAndColumnForPosition(code, range.end);
    start.bias = sourceMap.SourceMapConsumer.LEAST_UPPER_BOUND;
    end.bias = sourceMap.SourceMapConsumer.LEAST_UPPER_BOUND;

    const startData = consumer.originalPositionFor(start);
    const endData = consumer.originalPositionFor(end);

    if (startData.source == endData.source) {
        addRangeToCoverage(newCoverage, sources, startData, endData);
        return;
    }

    let newRanges = [];
    let start2 = start;
    while (start2.line <= end.line) {
        const newData = consumer.originalPositionFor(start2);
        start2.line += 1;
        start2.column = 0;
        if (start2.line === end.line) {
            start2.column = end.column;
        }

        const lastSource = newRanges.length === 0 ? null : newRanges[newRanges.length - 1][0].source;
        if (newData.source === null) {
            continue;
        }

        if (newData.source !== lastSource) {
            if (newRanges.length && newRanges[newRanges.length - 1][1] === null) {
                newRanges[newRanges.length - 1][1] = newRanges[newRanges.length - 1][0];
            }

            newRanges.push([newData, null]);
            continue;
        }

        newRanges[newRanges.length - 1][1] = newData;
    }

    for (const range of newRanges) {
        addRangeToCoverage(newCoverage, sources, range[0], range[1]);
    }
}

function convertRange(range) {
    return {
        startOffset: range.start,
        endOffset: range.end,
        count: 1
    };
}

// partially borrowed from
// https://github.com/istanbuljs/puppeteer-to-istanbul
function convertToV8(coverage) {
    let id = 0;

    return coverage.map(item => {
        return {
            scriptId: id++,
            url: 'file://' + item.url,
            functions: [{
                ranges: item.ranges.map(convertRange),
                isBlockCoverage: true
            }]
        };
    });
}

function convertToIstanbul(coverage) {
    const fullJson = {};
    coverage.forEach(jsFile => {
        const script = v8toIstanbul(jsFile.url);
        script.applyCoverage(jsFile.functions);

        let istanbulCoverage = script.toIstanbul();
        let keys = Object.keys(istanbulCoverage);

        fullJson[keys[0]] = istanbulCoverage[keys[0]];
    });

    return fullJson;
}

async function puppeteerToIstanbul(coverage, ignore) {
    return new Promise(async (resolve, reject) => {
        if (coverage.length === 0) {
            return resolve(coverage);
        }

        coverage = coverage[0];
        const sourceMapCoverage = await resolveSourceMap(coverage, ignore);
        const v8Coverage = convertToV8(sourceMapCoverage);
        const istanbulCoverage = convertToIstanbul(v8Coverage);
        resolve(istanbulCoverage);
    })
}

/**
 * Ripple is a simple event manager that adds on, off, and fire events to any
 * object.
 *
 * @type {Object}
 */
const ripple = {
    wrap: (obj) => {
        const callbacks = {};

        obj.on = function(eventName, callback) {
            if (!callbacks[eventName]) {
                callbacks[eventName] = [];
            }

            callbacks[eventName].push(callback);
        };

        obj.off = function(eventName, callback) {
            if (callback === undefined) {
                delete callbacks[eventName];
                return;
            }

            const index = callbacks[eventName].indexOf(callback);
            callbacks[eventName].splice(index, 1);
        };

        obj.fire = function(...args) {
            const eventName = args[0];
            if (callbacks[eventName]) {
                for (let i = 0, len = callbacks[eventName].length, cb; i < len; i++) {
                    cb = callbacks[eventName][i];
                    cb.apply(obj, args.slice(1));
                }
            }
        };
    }
};

class Task {
    constructor(fn, name) {
        this.fn = fn;
        this.name = name;
    }
}

class Queue {
    constructor({ concurrency = 1 } = {}) {
        this.tasks = [];
        this.running = false;
        this.concurrency = concurrency;
        this._active = [];
        ripple.wrap(this);
    }

    addTask(task, name) {
        if (!(task instanceof Promise)) {
            throw new Error('Task needs to be a promise!');
        }

        this.tasks.push(new Task(task, name));
    }

    _markComplete(eventName, toRun, response) {
        this.fire(eventName, toRun.name, response);
        const index = this._active.indexOf(toRun);
        this._active.splice(index, 1);
        this._run();
    }

    _run() {
        if (!this.running) {
            return;
        }

        if (this.tasks.length === 0 && this._active.length === 0) {
            this.fire('complete');
            return;
        }

        while (this._active.length < this.concurrency && this.tasks.length > 0) {
            const toRun = this.tasks.shift();
            this._active.push(toRun);

            this.fire('taskstart', toRun.name);
            toRun.fn.then((response) => {
                this._markComplete('taskend', toRun, response);
            }).catch((e) => {
                this._markComplete('taskerror', toRun, e);
            });
        }
    }

    start() {
        this.running = true;
        this.fire('start');
        this._run();
    }

    stop() {
        this.running = false;
        this.fire('stop');
    }
}

// This is the runner that runs from node.js to execute the tests

const fs$1 = require('fs');
const spawn = require('child_process').spawn;
const puppeteer = require('puppeteer');
const walk = require('walk');
const istanbul = require('istanbul-lib-coverage');
const createReporter = require('istanbul-api').createReporter;

let bar;
const logs = [];
let map = istanbul.createCoverageMap();
let coveragePaths = [];

function getTestCount(path) {
    const contents = fs$1.readFileSync(path);
    return extractFunctionNames(contents.toString()).length;
}

async function getFilesToRun(path, options) {
    return new Promise((resolve, reject) => {
        const stats = fs$1.lstatSync(path);
        const paths = [];
        let count = 0;
        if (stats.isFile()) {
            const testCount = getTestCount(path);
            resolve({ paths: [path], count: getTestCount(path) });
            return;
        }

        const walker = walk.walk(path);
        walker.on('file', (root, fileStats, next) => {
            const path = `${root}/${fileStats.name}`;
            const testCount = getTestCount(path);

            if (options.verbose && testCount == 0) {
                console.log(`File: ${path} does not export any tests! Skipping…`);
            }

            if (testCount > 0) {
                paths.push(path);
                count += testCount;
            }
            next();
        });

        walker.on('errors', (root, nodeStatsArray, next) => {
            next();
        });

        walker.on('end', () => {
            resolve({ paths, count });
        });
    });
}


// This is called from the new node thread that is launched to run tests when
// runing natively in node
//
// @see https://stackoverflow.com/questions/17581830/load-node-js-module-from-string-in-memory
async function singleRun(options) {
    function requireFromString(src, filename) {
        var m = new module.constructor();
        m.paths = module.paths;
        m._compile(src, filename);
        return m.exports;
    }

    const testPath = options.paths[0];
    const code = await getBundle(testPath, true, options.coverage);
    const tests = requireFromString(code, '');
    return tests.run();
}

function handleMessage(message, testPath, options) {
    if (/^Running/.test(message)) {
        if (options.verbose) {
            console.log(`[${testPath}]`, message);
        }
        return;
    }

    if (/^Finished/.test(message)) {
        if (!options.verbose) {
            bar.tick();
        }
        return;
    }

    if (/^Results/.test(message)) {
        return JSON.parse(message.slice(8));
    }

    if (/^Coverage/.test(message)) {
        const coverageFile = message.split('Coverage ')[1];
        coveragePaths.push(coverageFile);
        return;
    }

    if (message) {
        logs.push(message);
    }
}

function groupLines(string$$1) {
    const bits = string$$1.split(/^Results/gm);
    let lines = bits[0].split('\n');
    if (bits[1]) {
        lines.push(`Results ${bits[1]}`);
    }

    return lines;
}

async function runTestNode(testPath, options) {
    return new Promise((resolve, reject) => {
        // console.log('runTestNode', testPath, options);
        const args = [testPath, '--node', '--single-run'];
        if (options.coverage) {
            args.push('--coverage');
        }
        var test = spawn(options.binary, args);

        let results = {};
        test.stdout.on('data', (output) => {
            const lines = groupLines(output.toString());
            for (const line of lines) {
                results = handleMessage(line, testPath, options);
            }
        });

        test.stderr.on('data', (output) => {
            reject(output.toString());
        });

        test.on('close', () => {
            resolve(results);
        });
    });
}

async function runTestBrowser(browser, testPath, options) {
    return new Promise(async (resolve, reject) => {
        try {
            const page = await browser.newPage();

            await page.coverage.startJSCoverage();

            const url = `http://localhost:2662/run/${testPath}`;
            let results = {};
            page.on('console', msg => {
                results = handleMessage(msg._text, testPath, options);
            });

            page.on('response', async (response) => {
                if (response.status() == 500) {
                    // For some reason I can’t figure out how to get the
                    // response body here. response.buffer(), response.text(),
                    // and response.json() do not work. So I am including the
                    // error in a header
                    const headers = response.headers();
                    await page.close();
                    reject(JSON.parse(headers.error));
                }
            });

            page.on('pageerror', async (event) => {
                await page.close();
                reject(event);
            });

            await page.goto(url, { timeout: 5000 });
            await page.waitForSelector('.done');

            const jsCoverage = await page.coverage.stopJSCoverage();
            const istanbulCoverage = await puppeteerToIstanbul(jsCoverage, testPath);
            map.merge(istanbulCoverage);

            await page.close();
            resolve(results);
        } catch (e) {
            reject(e);
        }
    });
}

function killWithError(message) {
    if (message) {
        console.log(`⚠️  ${message}`);
    }
    process.exit(1);
}

function logAssertion(testData) {
    const lineNumber = testData.source.position.line;
    const lineWidth = (lineNumber + 2).toString().length;

    const indent = spaces(4);
    console.log(`\n${chalk.yellow(formatLine(lineNumber - 1, lineWidth))}`);
    console.log(`${chalk.yellow(formatLine(lineNumber, lineWidth))} ${indent}${syntaxHighlight(testData.source.code)}`);
    const leftIndex = testData.left.range[0];
    let rightIndex = -1;

    if (testData.right) {
        rightIndex = testData.right.range[0];
        if (looksTheSame(testData.right.code, testData.right.value)) {
            rightIndex = -1;
        }
    }

    if (leftIndex > -1) {
        console.log(`${chalk.yellow(formatLine(lineNumber + 1, lineWidth))} ${indent}${spaces(leftIndex)}${chalk.gray('|')}${rightIndex > -1 ? spaces(rightIndex - leftIndex - 1) + chalk.gray('|') : ''}`);
        if (rightIndex > -1) {
            console.log(`${spaces(lineWidth)} ${indent}${spaces(leftIndex)}${chalk.gray('|')}${rightIndex > -1 ? spaces(rightIndex - leftIndex - 1) + syntaxHighlight(JSON.stringify(testData.right.value)) : ''}`);
        }
        console.log(`${spaces(lineWidth)} ${indent}${spaces(leftIndex)}${syntaxHighlight(JSON.stringify(testData.left.value))}\n`);
    }
}

function logError(error, options) {
    console.log(`\n${chalk.bold.underline(error.name)}\n`);
    if (error.type === 'taskerror') {
        console.log(`⚠️  ${chalk.red(error.data)}\n`);

        if (!options.node) {
            console.log(`❓  Perhaps you meant to run your tests in node using the ${chalk.bold('--node')} flag\n`);
        }
        return;
    }

    for (const test of error.data) {
        if (test.failures === 0) {
            continue;
        }

        console.log(`❌  ${chalk.red.bold(test.name)}`);
        if (test.data) {
            logAssertion(test.data);
            continue;
        }

        if (test.trace) {
            console.log(`\n⚠️  ${test.trace.split('\n')[0]}\n`);
        }
    }
}

function logErrors(tests, options) {
    const errors = [];
    let failures = 0;
    for (const test of tests) {
        // console.log(test);
        if (test.type === 'taskerror') {
            errors.push(test);
            continue;
        }

        for (const result of test.data) {
            if (result.failures > 0) {
                failures += result.failures;
                if (errors.indexOf(test) === -1) {
                    errors.push(test);
                }
            }
        }
    }

    if (errors.length === 0) {
        console.log(`💯  All tests passed!`);
        return 0;
    }

    if (failures > 0) {
        console.log(`💔  ${failures} test${failures != 1 ? 's' : ''} failed!`);
    }

    for (const error of errors) {
        logError(error, options);
    }

    return 1;
}

function logLogs() {
    if (logs.length === 0) {
        return;
    }

    console.log(chalk.bold.underline.blue('Console Logs\n'));
    for (const log of logs) {
        console.log(log);
    }
    console.log('');
}

async function runTests(options) {
    const startTime = new Date().getTime();

    const q = new Queue({
        concurrency: options.concurrency
    });

    let files = [];
    let totalTests = 0;
    for (const path of options.paths) {
        let { paths, count } = await getFilesToRun(path, options);
        files = files.concat(paths);
        totalTests += count;
    }

    if (totalTests === 0) {
        let pathsForError = files;
        if (files.length === 0) {
            pathsForError = options.paths;
        }
        killWithError(`There were no tests exported by: ${pathsForError.join(', ')}`);
        return;
    }

    if (!options.verbose) {
        console.log('🌙  Running tests…');
        bar = new ProgressBar('⏳  [:bar] :percent (:current/:total)', {
            total: totalTests,
            width: 50,
            renderThrottle: 0,
            callback: () => {
                // console.log('progress bar callback');
                // process.stderr.write('\x1B[?25h');
            }
        });

        // process.stderr.write('\x1B[?25l')
    }

    let server;
    let browser;
    if (!options.node) {
        server = await startServer(options);
        browser = await puppeteer.launch();
    }

    for (const filePath of files) {
        if (options.node) {
            q.addTask(runTestNode(filePath,options), filePath);
            continue;
        }

        q.addTask(runTestBrowser(browser, filePath, options), filePath);
    }

    // q.on('start', () => {
    //     console.log('start');
    // })

    // q.on('taskstart', (name) => {
    //     console.log('taskstart', name);
    // })

    const results = [];
    q.on('taskend', (name, data) => {
        results.push({
            type: 'taskend',
            name,
            data
        });
        // console.log('taskend', name, data);
    });

    q.on('taskerror', (name, data) => {
        results.push({
            type: 'taskerror',
            name,
            data
        });
        // console.log('taskerror', name, data);
    });

    q.on('complete', async () => {
        const exitCode = logErrors(results, options);

        const endTime = new Date().getTime();

        logLogs();

        if (options.coverage) {
            for (const path of coveragePaths) {
                const coverage = fs$1.readFileSync(path);
                map.merge(JSON.parse(coverage));
            }

            // This is how to get the complete list of uncovered lines
            // map.files().forEach(function (f) {
            //     var fc = map.fileCoverageFor(f);
            //     console.log(f, fc.getUncoveredLines());
            // });

            const reporter = createReporter();
            reporter.addAll(['lcov', 'text', 'text-summary']);
            reporter.write(map);

            console.log(`💾  HTML coverage report available at ${chalk.bold.underline('coverage/lcov-report/index.html')}`);
        }

        console.log(`⚡️  Took ${getElapsedTime(startTime, endTime)}`);

        if (!options.node) {
            await browser.close();
            await server.close();
        }
        process.exit(exitCode);
    });

    q.start();
}

const fs$2 = require('fs');
const argv = require('yargs').argv;
const version = require('./../package.json').version;

function showUsage(message) {
    console.log([
        '        ,--.!,',
        '     __/   -*-',
        '   ,d08b.  \'|`',
        `   0088MM          BOMB v${version}`,
        '   `9MMP\''].join('\n'));
    console.log('\n\x1B[1mUSAGE\x1B[0m');
    console.log('bomb /path/to/tests');
    console.log('\n\x1B[1mARGUMENTS\x1B[0m');
    console.log('--concurrency    number of test files to run at a time (default: 1)');
    console.log('--verbose        show verbose output when tests run');
    console.log('--node           run unit tests from node environment instead of a browser');

    if (message) {
        console.log(`\n⚠️  ${message}`);
    }

}

if (argv._.length < 1) {
    showUsage('No test path specified\n');
    process.exit(1);
}

const paths = [];
for (let i = 0; i < argv._.length; i++) {
    if (fs$2.existsSync(argv._[i])) {
        paths.push(argv._[i]);
    }
}

if (paths.length === 0) {
    showUsage('No files found at provided paths');
    process.exit(1);
}

const options = {
    paths,
    binary: argv.$0,
    coverage: argv.coverage,
    concurrency: argv.concurrency || 1,
    verbose: argv.verbose,
    node: argv.node,
    singleRun: argv['single-run']
};

(async () => {
    try {
        if (options.singleRun) {
            // There is a limitation on how much output can be captured from a
            // child process:
            //
            // @see https://github.com/nodejs/node/issues/19218
            let fileName;
            if (options.coverage) {
                fileName = `/tmp/coverage-${process.pid}.json`;
                console.log('Coverage', fileName);
            }

            await singleRun(options);

            if (options.coverage) {
                fs$2.writeFileSync(fileName, JSON.stringify(__coverage__));
            }
            process.exit(0);
            return;
        }
        await runTests(options);
    } catch(e) {
        console.error('Error running tests', e);
        process.exit(1);
    }
})();
