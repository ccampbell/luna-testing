// This is the runner that runs from node.js to execute the tests
import { startServer, getBundle } from './server';
import { extractFunctionNames, formatLine, getElapsedTime, looksTheSame, spaces, PREFIX } from './util';
import { syntaxHighlight } from './highlight';
import { applySourceMapToTrace } from './coverage';
import Queue from './classes/Queue';
import PuppeteerCoverage from './classes/PuppeteerCoverage';
import ProgressBar from 'progress';
import chalk from 'chalk';

const fs = require('fs');
const spawn = require('child_process').spawn;
const puppeteer = require('puppeteer');
const walk = require('walk');
const istanbul = require('istanbul-lib-coverage');
const createReporter = require('istanbul-api').createReporter;

let bar;
let sourceMapError = null;
const logs = [];
const map = istanbul.createCoverageMap();
const puppeteerCoverage = new PuppeteerCoverage();
const coveragePaths = [];

function getTestCount(path) {
    const contents = fs.readFileSync(path);
    return extractFunctionNames(contents.toString()).length;
}

async function getFilesToRun(path, options) {
    return new Promise((resolve, reject) => {
        path = path.replace(/\/+$/g, '');
        const stats = fs.lstatSync(path);
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
export async function singleRun(options) {
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
        console.log(`${failures === 0 ? chalk.green.bold('✔︎') : chalk.red.bold('𝗫')}  ${chalk.gray(`[${testPath}]`)}`, messageBits[1]);
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
        const args = [testPath, '--node', '--single-run', '--timeout', options.timeout];
        if (!options.coverage) {
            args.push('-x');
        }

        // On Mac and Linux the path to the executable is enough because it can
        // resolve #!/usr/bin/env node to execute it, but on Windows that
        // doesn’t work. Here we have to hardcode node as the command path and
        // prepend the luna executable to the args.
        const isWindows = process.platform === "win32";
        const command = isWindows ? process.execPath : options.binary;
        if (isWindows) {
            args.unshift(options.binary);
        }

        const test = spawn(command, args);
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
            let results = {};
            page.on('console', (msg) => {
                results = handleMessage(msg._text, testPath, options);
            });

            page.on('response', async(response) => {
                if (response.status() === 500) {
                    // For some reason I can’t figure out how to get the
                    // response body here. response.buffer(), response.text(),
                    // and response.json() do not work. So I am including the
                    // error in a header
                    const headers = response.headers();
                    reject(JSON.parse(headers.error));
                    await page.close();
                }
            });

            page.on('pageerror', async(event) => {
                reject(event);
                await page.close();
            });

            await page.goto(url, { timeout: 5000 });
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
        console.log(`⚠️  ${chalk.bold(message)}`);
    }
    process.exit(1);
}

function logAssertion(testData) {
    const lineNumber = testData.source.position.line;
    const lineWidth = (lineNumber + 2).toString().length;

    const indent = spaces(4);
    console.log(`\n${chalk.yellow(formatLine(lineNumber - 1, lineWidth))}`);
    console.log(`${chalk.yellow(formatLine(lineNumber, lineWidth))} ${indent}${syntaxHighlight(testData.source.code)}`);
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

    console.log(chalk.bold.underline.blue('Console Logs\n'));
    for (const log of logs) {
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
            const coverage = fs.readFileSync(path);
            fs.unlinkSync(path);
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

    console.log(`\n💾  HTML coverage report available at ${chalk.bold.underline('coverage/lcov-report/index.html')}`);
}

export async function runTests(options) {
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

        if (!options.node) {
            await browser.close();
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
