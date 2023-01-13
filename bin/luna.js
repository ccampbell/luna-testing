#!/usr/bin/env node
/* Luna v1.7.0 */
'use strict';

var chalk = require('chalk');
var ProgressBar = require('progress');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var chalk__default = /*#__PURE__*/_interopDefaultLegacy(chalk);
var ProgressBar__default = /*#__PURE__*/_interopDefaultLegacy(ProgressBar);

const constant = /\b(\d+|true|false)\b/g;
const operator = /\+|\!|\-|&|>|<|\||\*|\=/g;
const string = /('|"|`)([\s\S]*?)(\1)/g;
const commentLine = /\/\/(.*)/g;
const commentMultiline = /\/\*([\s\S]*?)\*\//g;
const escapedStringChars = /\\('|"|`)/g;

// Prefixes for log communication messages
const PREFIX = {
    running: '__LunaRunning__',
    finished: '__LunaFinished__',
    results: '__LunaResults__',
    coverage: '__LunaCoverage__'
};

// @todo maybe use esprima for this
function extractFunctionNames(source) {
    source = source.replace(escapedStringChars, '');
    source = source.replace(string, '__STRING__');
    source = source.replace(commentLine, '');
    source = source.replace(commentMultiline, '');

    const re = /export(?: async)?\s+function\s+(test.*?)\(/g;
    let match;
    const names = [];
    while ((match = re.exec(source))) {
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
        response += `${minutes} minute${minutes !== 1 ? 's' : ''}, `;
    }

    if (seconds < 1 && minutes > 0) {
        return response.slice(0, -2);
    }

    response += `${seconds} second${seconds !== 1 ? 's' : ''}`;
    return response;
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
    first = first.replace(/([{,]\s*)(.+?):/g, (match, group1, group2) => `${group1}"${group2}":`);

    try {
        const parsedFirst = JSON.parse(first);
        return JSON.stringify(parsedFirst) === JSON.stringify(second);
    } catch (e) {
        return false;
    }
}
/* eslint-enable complexity, brace-style */

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
    return { line, column };
}

function findPositionForLineAndColumn(code, { line = 0, column = 0 } = {}) {
    // Line is 1 indexed, Column is 0 indexed
    const lines = code.split('\n');
    let position = 0;
    for (const lineToCount of lines.slice(0, line - 1)) {
        position += lineToCount.length + 1; // \n
    }

    position += column;
    return position;
}

// @see https://stackoverflow.com/a/26391774/421333
function combineRanges(ranges1, ranges2) {
    const ranges = ranges1.concat(ranges2);
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);

    const result = [];
    let last;
    for (const r of ranges) {
        if (!last || r.start > last.end) {
            result.push(last = r);
            continue;
        }

        if (r.end > last.end) {
            last.end = r.end;
        }
    }

    return result;
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

    const data = {
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

    if (args.length > 1 && args[1].type === 'Literal') {
        data.message = args[1].value;
    }

    return data;
}

function getReplacement(assertCode, file, position, index) {
    const data = getData(assertCode, file, position);
    let newCode = `\n    const _left${index} = ${data.left.code};`;
    let value = `_left${index}`;
    if (data.right) {
        newCode += `\n    const _right${index} = ${data.right.code};`;
        value += ` ${data.operator} _right${index}`;
    }

    let dataString = JSON.stringify(data);

    dataString = dataString.replace('"{{LEFT_VALUE}}"', `_left${index}`);
    dataString = dataString.replace('"{{RIGHT_VALUE}}"', `_right${index}`);
    dataString = dataString.replace('"{{VALUE}}"', value);

    newCode += `\n    t.assert(${dataString}`;
    if (data.message) {
        newCode += `, ${JSON.stringify(data.message)}`;
    }
    newCode += ');';

    return newCode;
}

function transform(code, id) {
    // @todo this should use whatever variable is passed into the test function
    // instead of looking explicitly for `t.assert()` calls
    const re = /((?:\/\/|\/\*|['"`])\s*)?\bt\.assert\(.*?\);?(?=\r?\n)/g;
    let match;
    let start;
    let end;
    let hasReplacements = false;

    const magicString = new MagicString(code);

    let i = 0;
    while ((match = re.exec(code))) {
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

    return {
        code: magicString.toString(),
        map: magicString.generateMap({ hires: true })
    };
}

function assert() {
    return {
        name: 'assert',
        transform(code, id) {
            return transform(code, id);
        }
    };
}

const express = require('express');
const fs$2 = require('fs');
const path$1 = require('path');
const rollup = require('rollup');
const buble = require('rollup-plugin-buble');
const replace = require('rollup-plugin-replace');
const coverage = require('rollup-plugin-istanbul');
const svelte = require('rollup-plugin-svelte');
const nodeResolve = require('rollup-plugin-node-resolve');

let runOptions;

async function getBundle(filePath, options) {
    return new Promise(async(resolve, reject) => {
        try {
            // This is somewhat confusing, but on Windows since this is a
            // straight string replacement any path that has \test\something in
            // it will end up rendering the \t as a tab characters. We have to
            // make sure that any \ are replaced with \\
            const fullTestPath = path$1.join(process.cwd(), filePath).replace(/\\/g, '\\\\');
            const plugins = [
                replace({
                    TEST_FILE_PATH: fullTestPath,
                    TEST_TIMEOUT: options.timeout
                }),
                nodeResolve(),
                buble({
                    target: {
                        chrome: 71
                    },
                    jsx: 'React.createElement'
                }),
                assert()
            ];

            if (options.node && options.coverage) {
                plugins.push(coverage({
                    exclude: [filePath, 'node_modules/**']
                }));
            }

            if (options.svelte) {
                plugins.unshift(svelte({
                    include: options.svelte,
                    emitCss: false,
                    compilerOptions: {
                        css: true,
                        dev: true
                    }
                }));
            }

            const bundle = await rollup.rollup({
                input: path$1.resolve(`${__dirname}/../src`, options.node ? 'run-node.js' : 'run-browser.js'),
                external: ['chalk'],
                treeshake: true,
                plugins
            });

            const { output } = await bundle.generate({
                format: options.node ? 'cjs' : 'iife',
                freeze: true,
                sourcemap: 'inline'
            });

            /* eslint-disable prefer-const */
            let { code, map } = output[0];
            /* eslint-enable prefer-const */

            code += `\n//# sourceMappingURL=${map.toUrl()}\n`;
            resolve(code);
        } catch (e) {
            reject(e);
        }
    });
}

async function bundleHandler(req, res) {
    const filePath = req.params[0];

    const exists = fs$2.existsSync(filePath);
    if (!exists) {
        res.status(404).send('File does not exist');
        return;
    }

    try {
        const code = await getBundle(filePath, runOptions);
        res.set('Content-Type', 'application/javascript');
        res.send(code);
    } catch (e) {
        res.set('Error', JSON.stringify(e.toString())).status(500).send({ message: e.toString() });
        return;
    }
}

function runHandler(req, res) {
    const filePath = req.params[0];
    const bundlePath = `/bundle/${filePath}`;

    let inject = '';
    if (runOptions.inject) {
        const extra = runOptions.inject.split(',');
        for (const script of extra) {
            inject += `<script src="/static/${script}"></script>`;
        }
    }

    res.status(200).send(`<!DOCTYPE html><head><title>${filePath} – Test Runner</title></head><body>${inject}<script src="${bundlePath}"></script></body>`);
}

async function startServer(options) {
    runOptions = options;

    const app = express();
    app.get(/\/bundle\/(.*)/, bundleHandler);
    app.get(/\/run\/(.*)/, runHandler);
    app.use('/static', express.static(process.cwd()));

    return app.listen(options.port, () => {
        if (options.verbose) {
            console.log(`🔌  Server started at ${chalk__default["default"].bold(`http://localhost:${options.port}`)}…`);
        }
    });
}

function syntaxHighlight(code) {
    const strings = [];
    const stringMap = {};

    if (code === undefined) {
        return chalk__default["default"].yellow('undefined');
    }

    code = code.replace(string, (match) => {
        const stringName = `__STRING__${strings.length}`;
        strings.push(stringName);
        stringMap[stringName] = match;
        return stringName;
    });

    code = code.replace(operator, (match) => chalk__default["default"].magenta(match));
    code = code.replace(constant, (match) => chalk__default["default"].yellow(match));

    for (const stringName of strings) {
        code = code.replace(stringName, chalk__default["default"].green(stringMap[stringName]));
    }

    return code;
}

const sourceMap = require('source-map');

function addRangeToCoverage(newCoverage, sources, start, end) {
    const index = sources.indexOf(start.source);
    if (end === null) {
        end = start;
    }

    newCoverage[index].ranges.push({
        start: findPositionForLineAndColumn(newCoverage[index].text, start),
        end: findPositionForLineAndColumn(newCoverage[index].text, end)
    });
}

function addToCoverage({ newCoverage, sources, code, range, consumer }) {
    const start = findLineAndColumnForPosition(code, range.start);
    const end = findLineAndColumnForPosition(code, range.end);

    const currentPosition = start;
    currentPosition.bias = sourceMap.SourceMapConsumer.LEAST_UPPER_BOUND;

    let lastSource = null;
    let currentData = null;
    let lastData = null;
    let newStart;
    let newEnd;
    while (currentPosition.line <= end.line) {
        // Keep the position for the first iteration and moving forward add a
        // line at a time
        if (currentData !== null) {
            currentPosition.line++;
            currentPosition.column = 0;
        }

        const isEnd = currentPosition.line === end.line;
        if (isEnd) {
            currentPosition.column = end.column;
        }

        currentData = consumer.originalPositionFor(currentPosition);
        const hasSource = currentData.source !== null;

        // If this is the end then add the range and return
        if (isEnd && newStart) {
            newEnd = hasSource ? currentData : lastData;
            addRangeToCoverage(newCoverage, sources, newStart, newEnd);
            return;
        }

        if (!hasSource) {
            continue;
        }

        // Situations where we want to start a new range and push this one onto
        // the stack
        const isNewSource = currentData.source !== lastSource && currentData.source !== null;
        const isBigLineJump = !isNewSource && lastData && (currentData.line - lastData.line > 2);
        const isNegativeLineJump = !isNewSource && lastData && currentData.line < lastData.line;
        if (isNewSource || isBigLineJump || isNegativeLineJump) {
            lastSource = currentData.source;

            // If we haven’t started a range then we should set this position
            // to the start of the range and continue on in the loop
            if (!newStart) {
                newStart = currentData;
                lastData = currentData;
                continue;
            }

            // Otherwise we should use the previous data to mark the end of the
            // last range and start a new range where we are
            newEnd = lastData;
            addRangeToCoverage(newCoverage, sources, newStart, newEnd);

            newStart = currentData;
            newEnd = null;
        }

        lastData = currentData;
    }
}

function getSourceMapData(coverage) {
    const sourceMapString = coverage.text.split('# sourceMappingURL=data:application/json;charset=utf-8;base64,').pop();
    const buf = Buffer.from(sourceMapString, 'base64');
    return JSON.parse(buf.toString());
}

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
    let sourceMapData;
    try {
        sourceMapData = getSourceMapData(coverage);
    } catch (e) {
        return Promise.resolve(newCoverage);
    }

    const remove = [];
    for (let i = 0; i < sourceMapData.sources.length; i++) {
        if (sourceMapData.sources[i].indexOf(ignore) > -1) {
            remove.push(i);
        }

        // hardcoded static files
        if (sourceMapData.sources[i].indexOf('/static/') > -1) {
            remove.push(i);
        }

        if (sourceMapData.sources[i].indexOf('node_modules/') > -1) {
            remove.push(i);
        }

        newCoverage.push({
            url: sourceMapData.sources[i],
            ranges: [],
            text: sourceMapData.sourcesContent[i]
        });
    }

    await sourceMap.SourceMapConsumer.with(sourceMapData, null, (consumer) => {
        for (const range of coverage.ranges) {
            addToCoverage({
                newCoverage,
                sources: sourceMapData.sources,
                code: coverage.text,
                range,
                consumer
            });
        }

    });

    let i = remove.length;
    while (i--) {
        newCoverage.splice(remove[i], 1);
    }

    return Promise.resolve(newCoverage);
}

function applySourceMapToLine(line, consumer) {
    return line.replace(/\(.*?\)$/, (match) => {
        const matchBits = match.split(':');
        if (matchBits.length < 3) {
            return match;
        }

        const position = {
            column: parseInt(matchBits.pop(), 10),
            line: parseInt(matchBits.pop(), 10),
            bias: sourceMap.SourceMapConsumer.LEAST_UPPER_BOUND
        };

        const originalPosition = consumer.originalPositionFor(position);
        return `(${originalPosition.source}:${originalPosition.line}:${originalPosition.column})`;
    });
}

async function applySourceMapToTrace(trace, coverage) {
    const sourceMapData = getSourceMapData(coverage[0]);
    const lines = trace.split('\n');
    await sourceMap.SourceMapConsumer.with(sourceMapData, null, (consumer) => {
        for (let i = 0; i < lines.length; i++) {
            lines[i] = applySourceMapToLine(lines[i], consumer);
        }
    });

    return lines.join('\n');
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

const v8toIstanbul = require('v8-to-istanbul');

function _convertRange(range) {
    return {
        startOffset: range.start,
        endOffset: range.end,
        count: 1
    };
}

// partially borrowed from
// https://github.com/istanbuljs/puppeteer-to-istanbul
function _convertToV8(coverage) {
    let id = 0;

    return coverage.map((item) => ({
        scriptId: id++,
        url: `file://${item.url}`,
        functions: [{
            ranges: item.ranges.map(_convertRange),
            isBlockCoverage: true
        }]
    }));
}

function _convertToIstanbul(coverage) {
    const fullJson = {};
    coverage.forEach((jsFile) => {
        const script = v8toIstanbul(jsFile.url);
        script.applyCoverage(jsFile.functions);

        const istanbulCoverage = script.toIstanbul();
        const keys = Object.keys(istanbulCoverage);

        fullJson[keys[0]] = istanbulCoverage[keys[0]];
    });

    return fullJson;
}

class PuppeteerCoverage {
    constructor() {
        this._coverage = {};
    }

    _mergeRanges(coverage1, coverage2) {
        if (coverage1 === undefined) {
            return coverage2;
        }

        coverage1.ranges = combineRanges(coverage1.ranges, coverage2.ranges);
        return coverage1;
    }

    _merge(coverages) {
        for (const path in coverages) {
            const url = coverages[path].url;
            const coverage = coverages[path];
            this._coverage[url] = this._mergeRanges(this._coverage[url], coverage);
        }
    }

    toIstanbul() {
        const v8Coverage = _convertToV8(Object.values(this._coverage));
        return _convertToIstanbul(v8Coverage);
    }

    // Takes a coverage report generated from puppeteer, resolves the source
    // maps then merges it with the existing coverage
    async add(coverage, ignore) {
        return new Promise(async(resolve, reject) => {
            if (coverage.length === 0) {
                resolve();
                return;
            }

            coverage = coverage[0];
            let sourceMapCoverage;
            try {
                sourceMapCoverage = await resolveSourceMap(coverage, ignore);
            } catch (e) {
                reject(e);
                return;
            }

            this._merge(sourceMapCoverage);
            resolve();
        });
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
let sourceMapError = null;
const logs = [];
const map = istanbul.createCoverageMap();
const puppeteerObjectText = 'JSHandle@object';
const puppeteerCoverage = new PuppeteerCoverage();
const coveragePaths = [];

function getTestCount(path) {
    const contents = fs$1.readFileSync(path);
    return extractFunctionNames(contents.toString()).length;
}

async function getFilesToRun(path, options) {
    return new Promise((resolve, reject) => {
        path = path.replace(/\/+$/g, '');
        const stats = fs$1.lstatSync(path);
        const paths = [];
        let count = 0;
        if (stats.isFile()) {
            resolve({ paths: [path], count: getTestCount(path) });
            return;
        }

        const walker = walk.walk(path);
        walker.on('file', (root, fileStats, next) => {
            const newPath = `${root}/${fileStats.name}`;
            const testCount = getTestCount(newPath);

            if (options.verbose && testCount === 0) {
                console.log(`File: ${newPath} does not export any tests! Skipping…`);
            }

            if (testCount > 0) {
                paths.push(newPath);
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
        const m = new module.constructor();
        m.paths = module.paths;
        m._compile(src, filename);
        return m.exports;
    }

    const testPath = options.paths[0];
    const code = await getBundle(testPath, options);
    const tests = requireFromString(code, '');
    return tests.run();
}

function handleMessage(message, testPath, options) {
    if (new RegExp(`^${PREFIX.running}`).test(message)) {
        return false;
    }

    if (new RegExp(`^${PREFIX.finished}`).test(message)) {
        if (!options.verbose) {
            bar.tick();
            return false;
        }

        const messageBits = message.split(' ');
        const failures = parseInt(messageBits[2], 10);
        console.log(`${failures === 0 ? chalk__default["default"].green.bold('✔︎') : chalk__default["default"].red.bold('𝗫')}  ${chalk__default["default"].gray(`[${testPath}]`)}`, messageBits[1]);
        return false;
    }

    if (new RegExp(`^${PREFIX.results}`).test(message)) {
        return JSON.parse(message.split(`${PREFIX.results} `)[1]);
    }

    if (new RegExp(`^${PREFIX.coverage}`).test(message)) {
        const coverageFile = message.split(`${PREFIX.coverage} `)[1];
        coveragePaths.push(coverageFile);
        return false;
    }

    if (message) {
        logs.push(message);
    }

    return false;
}

function groupLines(string) {
    const bits = string.split(new RegExp(`^${PREFIX.results}`, 'gm'));
    const lines = bits[0].split('\n');
    if (bits[1]) {
        lines.push(`${PREFIX.results} ${bits[1]}`);
    }

    return lines;
}

async function runTestNode(testPath, options) {
    return new Promise((resolve, reject) => {
        // console.log('runTestNode', testPath, options);

        // On Mac and Linux the path to the executable is enough because it can
        // resolve #!/usr/bin/env node to execute it, but on Windows that
        // doesn’t work. Here we have to prepend the luna executable to the
        // args.
        const args = [options.binary, testPath, '--node', '--single-run', '--timeout', options.timeout];
        if (!options.coverage) {
            args.push('-x');
        }

        const test = spawn(process.execPath, args);
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
    return new Promise(async(resolve, reject) => {
        try {
            const page = await browser.newPage();

            if (options.coverage) {
                await page.coverage.startJSCoverage();
            }

            const url = `http://localhost:${options.port}/run/${testPath}`;

            if (options.debug) {
                console.log(`🔗  Opening URL: ${url}`);
            }

            let results = {};
            page.on('console', async(msg) => {
                const newMsg = msg.text();
                const resp = handleMessage(newMsg, testPath, options);
                if (resp) {
                    results = resp;
                }
            });

            page.on('response', async(response) => {
                if (response.status() === 500) {
                    // For some reason I can’t figure out how to get the
                    // response body here. response.buffer(), response.text(),
                    // and response.json() do not work. So I am including the
                    // error in a header
                    const headers = response.headers();
                    reject(JSON.parse(headers.error));
                }
            });

            let hasError = false;
            page.on('pageerror', async(event) => {
                if (hasError) {
                    return;
                }

                hasError = true;
                const code = await getBundle(testPath, options);
                const newStack = await applySourceMapToTrace(event.message, [{ text: code }]);
                reject(newStack);
            });

            await page.goto(url);
            await page.waitForSelector('.done');

            let jsCoverage;
            if (options.coverage) {
                jsCoverage = await page.coverage.stopJSCoverage();

                try {
                    await puppeteerCoverage.add(jsCoverage, testPath);
                } catch (e) {
                    sourceMapError = e;
                }
            }

            for (let i = 0; i < results.length; i++) {
                if (results[i].trace) {
                    try {
                        results[i].trace = await applySourceMapToTrace(results[i].trace, jsCoverage);
                    } catch (e) {
                        // Ignore
                    }
                }
            }

            await page.close();
            resolve(results);
        } catch (e) {
            reject(e);
        }
    });
}

function killWithError(message) {
    if (message) {
        console.log(`⚠️  ${chalk__default["default"].bold(message)}`);
    }
    process.exit(1);
}

function logAssertion(testData) {
    const lineNumber = testData.source.position.line;
    const lineWidth = (lineNumber + 2).toString().length;

    const indent = spaces(4);
    console.log(`\n${chalk__default["default"].yellow(formatLine(lineNumber - 1, lineWidth))}`);
    console.log(`${chalk__default["default"].yellow(formatLine(lineNumber, lineWidth))} ${indent}${syntaxHighlight(testData.source.code)}`);
    let leftIndex = testData.left.range[0];

    // Move it to after the last dot
    if (testData.left.code.indexOf('.') !== -1) {
        const bits = testData.left.code.split('.');
        bits.pop();
        leftIndex += bits.join('.').length + 1;
    }
    let rightIndex = -1;

    if (testData.right) {
        rightIndex = testData.right.range[0];
        if (looksTheSame(testData.right.code, testData.right.value)) {
            rightIndex = -1;
        }
    }

    if (leftIndex > -1) {
        console.log(`${chalk__default["default"].yellow(formatLine(lineNumber + 1, lineWidth))} ${indent}${spaces(leftIndex)}${chalk__default["default"].gray('|')}${rightIndex > -1 ? spaces(rightIndex - leftIndex - 1) + chalk__default["default"].gray('|') : ''}`);
        if (rightIndex > -1) {
            console.log(`${spaces(lineWidth)} ${indent}${spaces(leftIndex)}${chalk__default["default"].gray('|')}${rightIndex > -1 ? spaces(rightIndex - leftIndex - 1) + syntaxHighlight(JSON.stringify(testData.right.value)) : ''}`);
        }
        console.log(`${spaces(lineWidth)} ${indent}${spaces(leftIndex)}${syntaxHighlight(JSON.stringify(testData.left.value))}\n`);
    }
}

function logError(error, options) {
    console.log(`\n${chalk__default["default"].bold.underline(error.name)}\n`);
    if (error.type === 'taskerror') {
        console.log(`⚠️  ${chalk__default["default"].red(error.data)}\n`);

        if (!options.node) {
            console.log(`❓  Perhaps you meant to run your tests in node using the ${chalk__default["default"].bold('--node')} flag\n`);
        }
        return;
    }

    for (const test of error.data) {
        if (test.failures === 0) {
            continue;
        }

        console.log(`❌  ${chalk__default["default"].red.bold(test.name)}`);
        if (test.data) {
            logAssertion(test.data);
            continue;
        }

        if (test.trace) {
            console.log(`\n⚠️  ${test.trace}\n`);
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
        console.log('💯  All tests passed!');
        return 0;
    }

    if (failures > 0) {
        if (options.fastFail) {
            console.log('');
        }

        console.log(`💔  ${failures} test${failures !== 1 ? 's' : ''} failed!`);
    }

    for (const error of errors) {
        logError(error, options);
    }

    return 1;
}

function logLogs(exitCode) {
    if (logs.length === 0) {
        return;
    }

    // If we are good an extra line before the console logs
    if (exitCode === 0) {
        console.log('');
    }

    console.log(chalk__default["default"].bold.underline.blue('Console Logs\n'));
    for (const log of logs) {
        if (typeof log === 'object' && log.constructor.name === 'Array' && log[0] === puppeteerObjectText) {
            console.log(log[1], log[2]);
            continue;
        }

        console.log(log);
    }
    console.log('');
}

function logCoverage(options) {
    if (!options.coverage) {
        return;
    }

    if (sourceMapError !== null) {
        console.log('⚠️  Error generating sourcemaps');
        console.log(sourceMapError);
        return;
    }

    for (const path of coveragePaths) {
        try {
            const coverage = fs$1.readFileSync(path);
            fs$1.unlinkSync(path);
            map.merge(JSON.parse(coverage));
        } catch (e) {
            // Empty
        }
    }

    if (!options.node) {
        map.merge(puppeteerCoverage.toIstanbul());
    }

    // This is how to get the complete list of uncovered lines
    // map.files().forEach(function (f) {
    //     var fc = map.fileCoverageFor(f);
    //     console.log(f, fc.getUncoveredLines());
    // });

    const reporter = createReporter();
    const reportersToUse = ['lcov', 'text-summary'];
    if (options.verbose) {
        console.log('');
        reportersToUse.splice(1, 0, 'text');
    }
    reporter.addAll(reportersToUse);
    reporter.write(map);

    console.log(`\n💾  HTML coverage report available at ${chalk__default["default"].bold.underline('coverage/lcov-report/index.html')}`);
}

async function runTests(options) {
    const startTime = new Date().getTime();

    const q = new Queue({
        concurrency: options.concurrency
    });

    let files = [];
    let totalTests = 0;
    for (const path of options.paths) {
        const { paths, count } = await getFilesToRun(path, options);
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

    console.log('🌙  Running tests…');
    if (!options.verbose) {
        bar = new ProgressBar__default["default"]('⏳  [:bar] :percent (:current/:total)', {
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
            q.addTask(runTestNode(filePath, options), filePath);
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

    async function handleComplete() {
        const exitCode = logErrors(results, options);

        const endTime = new Date().getTime();

        logLogs(exitCode);
        logCoverage(options);

        console.log(`⚡️  Took ${getElapsedTime(startTime, endTime)}`);

        // We can always close the browser
        if (!options.node) {
            await browser.close();
        }

        if (options.debug) {
            // In debug mode we want to keep the server running
            return;
        }

        if (!options.node) {
            await server.close();
        }

        process.exit(exitCode);
    }

    q.on('taskend', (name, data) => {
        // console.log('taskend', name, data);
        results.push({
            type: 'taskend',
            name,
            data
        });

        const failures = data.reduce((a, b) => a + b.failures, 0);

        if (options.fastFail && failures > 0) {
            handleComplete();
        }
    });

    q.on('taskerror', (name, data) => {
        // console.log('taskerror', name, data);
        results.push({
            type: 'taskerror',
            name,
            data
        });

        if (options.fastFail) {
            handleComplete();
        }
    });

    q.on('complete', handleComplete);
    q.start();
}

const fs = require('fs');
const yargs = require('yargs');
const os = require('os');
const path = require('path');
const version = require('./../package.json').version;
const ci = require('ci-info');

function showUsage(message) {
    console.log([
        '            ',
        '     ,/   * ',
        `  _,'/_   |          Luna v${version}`,
        '  \`(")\' ,\'/'].join('\n'));
    console.log('\n\x1B[1mUSAGE\x1B[0m');
    console.log('luna /path/to/tests');
    console.log('\n\x1B[1mOPTIONS\x1B[0m');
    console.log('-n, --node           Run unit tests from node environment instead of a browser');
    console.log('-c, --concurrency    Number of test files to run at a time (default: 1)');
    console.log('-f, --fast-fail      Fail immediately after a test failure');
    console.log('-x, --no-coverage    Disable code coverage');
    console.log('-t, --timeout        Maximum time in seconds to wait for async tests to complete (default: 5)');
    console.log('-i, --inject         JavaScript file(s) to inject into the page');
    console.log('-d, --debug          Keep the test server running for debugging purposes');
    console.log('-s, --svelte         Path or glob of svelte components to compile');
    console.log('-p, --port           Port to run webserver on (default: 5862)');
    console.log('-h, --help           Show usage');
    console.log('-v, --verbose        Show verbose output when tests run');
    console.log('--version            Show version');

    if (message) {
        console.log(`\n⚠️  ${chalk__default["default"].bold(message)}`);
    }
}

// Override default help
const argv = yargs
    .alias('h', 'help')
    .alias('v', 'verbose')
    .alias('c', 'concurrency')
    .alias('f', 'fast-fail')
    .alias('n', 'node')
    .alias('x', 'no-coverage')
    .alias('p', 'port')
    .alias('t', 'timeout')
    .alias('i', 'inject')
    .alias('d', 'debug')
    .alias('s', 'svelte')
    .help('').argv;

if (argv.help) {
    showUsage();
    process.exit(0);
}

if (argv._.length < 1) {
    showUsage('No test path specified\n');
    process.exit(1);
}

const paths = [];
for (let i = 0; i < argv._.length; i++) {
    if (fs.existsSync(argv._[i])) {
        paths.push(argv._[i]);
    }
}

if (paths.length === 0) {
    showUsage('No files found at provided paths');
    process.exit(1);
}

// yargv tries to be too smart and when you prefix a flag with --no-{flagName}
// it automatically sets the result to {flagName}: false which was not what I
// was expecting. This makes sure that if the flag is set to false the other
// value comes in too.
if (argv.coverage === false) {
    argv.noCoverage = true;
}

const options = {
    paths,
    binary: argv.$0,
    coverage: !argv.noCoverage,
    concurrency: argv.concurrency || 1,
    port: argv.port || 5862,
    verbose: argv.verbose,
    node: argv.node,
    inject: argv.inject,
    singleRun: argv['single-run'],
    fastFail: argv['fast-fail'],
    debug: argv.debug,
    svelte: argv.svelte,
    timeout: argv.timeout || 5
};

// Force verbose mode from a CI environment
if (ci.isCI) {
    options.verbose = true;
}

(async() => {
    try {
        if (options.singleRun) {
            // There is a limitation on how much output can be captured from a
            // child process:
            //
            // @see https://github.com/nodejs/node/issues/19218
            let fileName;
            const hasCoverage = options.coverage;
            if (hasCoverage) {
                fileName = path.join(os.tmpdir(), `coverage-${process.pid}.json`);
                console.log(PREFIX.coverage, fileName);
            }

            await singleRun(options);

            /* global __coverage__ */
            if (hasCoverage && typeof __coverage__ !== 'undefined') {
                fs.writeFileSync(fileName, JSON.stringify(__coverage__));
            }
            process.exit(0);
            return;
        }
        await runTests(options);
    } catch (e) {
        console.error('Error running tests', e);
        process.exit(1);
    }
})();
