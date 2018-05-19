// This is the runner that runs from node.js to execute the tests
import { startServer, getBundle } from './server';
import { extractFunctionNames, formatLine, getElapsedTime, syntaxHighlight, spaces } from './util';
import Queue from './classes/Queue';
import ProgressBar from 'progress';
import chalk from 'chalk';

const fs = require('fs');
const spawn = require('child_process').spawn;
const puppeteer = require('puppeteer');
const walk = require('walk');

let bar;
const logs = [];

function getTestCount(path) {
    const contents = fs.readFileSync(path);
    return extractFunctionNames(contents.toString()).length;
}

async function getFilesToRun(path, options) {
    return new Promise((resolve, reject) => {
        const stats = fs.lstatSync(path);
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
export async function singleRun(options) {
    function requireFromString(src, filename) {
        var m = new module.constructor();
        m.paths = module.paths;
        m._compile(src, filename);
        return m.exports;
    }

    const testPath = options.paths[0];
    const code = await getBundle(testPath, true);
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

    if (message) {
        logs.push(message);
    }
}

function groupLines(string) {
    const bits = string.split(/^Results/gm);
    let lines = bits[0].split('\n');
    if (bits[1]) {
        lines.push(`Results ${bits[1]}`);
    }

    return lines;
}

async function runTestNode(testPath, options) {
    return new Promise((resolve, reject) => {
        // console.log('runTestNode', testPath, options);
        var test = spawn(options.binary, [testPath, '--node', '--single-run']);

        let results = {};
        test.stdout.on('data', (output) => {
            const lines = groupLines(output.toString());
            for (const line of lines) {
                results = handleMessage(line, testPath, options);
            }
        });

        test.stderr.on('data', (output) => {
            reject(output.toString());
        })

        test.on('close', () => {
            resolve(results);
        });
    });
}

async function runTestBrowser(browser, testPath, options) {
    return new Promise(async (resolve, reject) => {
        try {
            const page = await browser.newPage();
            const url = `http://localhost:2662/run/${testPath}`
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
            await page.waitForSelector('.done')
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
    }

    if (leftIndex > -1) {
        console.log(`${chalk.yellow(formatLine(lineNumber + 1, lineWidth))} ${indent}${spaces(leftIndex)}${chalk.gray('|')}${rightIndex > -1 ? spaces(rightIndex - leftIndex - 1) + chalk.gray('|') : ''}`);
        console.log(`${spaces(lineWidth)} ${indent}${spaces(leftIndex)}${chalk.gray('|')}${rightIndex > -1 ? spaces(rightIndex - leftIndex - 1) + syntaxHighlight(testData.right.value) : ''}`);
        console.log(`${spaces(lineWidth)} ${indent}${spaces(leftIndex)}${syntaxHighlight(testData.left.value)}\n`);
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
    let count = 0;
    let failures = 0;
    for (const test of tests) {
        if (test.type === 'taskerror') {
            errors.push(test);
            continue;
        }

        for (const result of test.data) {
            count += 1;
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

export async function runTests(options) {
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

        console.log(`⚡️  Took ${getElapsedTime(startTime, endTime)}`);

        if (!options.node) {
            await browser.close();
            await server.close();
        }
        process.exit(exitCode);
    });

    q.start();
}
