// This is the runner that runs from node.js to execute the tests
import { startServer, getBundle } from './server';
import { extractFunctionNames } from './util';
import Queue from './classes/Queue';

const fs = require('fs');
const spawn = require('child_process').spawn;
const puppeteer = require('puppeteer');
const walk = require('walk');

function getTestCount(path) {
    const contents = fs.readFileSync(path);
    return extractFunctionNames(contents.toString()).length;
}

async function getFilesToRun(path) {
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
        var Module = module.constructor;
        var m = new Module();
        m._compile(src, filename);
        return m.exports;
    }

    const testPath = options.paths[0];
    const code = await getBundle(testPath, true);
    const tests = requireFromString(code, '');
    return tests.run();
}

function handleMessage(message, testPath, options) {
    if (options.verbose && /^Running/.test(message)) {
        console.log(`[${testPath}]`, message);
        return;
    }

    if (/^Results/.test(message)) {
        return JSON.parse(message.slice(8));
    }
}

async function runTestNode(testPath, options) {
    return new Promise((resolve, reject) => {
        // console.log('runTestNode', testPath, options);
        var test = spawn(options.binary, [testPath, '--node', '--single-run']);

        let results = {};
        test.stdout.on('data', (output) => {
            results = handleMessage(output.toString(), testPath, options);
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

export async function runTests(options) {
    const q = new Queue({
        concurrency: options.concurrency
    });

    let files = [];
    let totalTests = 0;
    for (const path of options.paths) {
        let { paths, count } = await getFilesToRun(path);
        files = files.concat(paths);
        totalTests += count;
    }

    if (totalTests === 0) {
        killWithError(`There were no tests exported in the specified path${files.length != 1 ? 's' : ''}: ${files.join(', ')}`);
        return;
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

    q.on('taskend', (name, data) => {
        console.log('taskend', name, data);
    });

    q.on('taskerror', (name, data) => {
        console.log('taskerror', name, data);
    });

    q.on('complete', async () => {
        if (!options.node) {
            await browser.close();
            await server.close();
        }
        process.exit(0);
    });

    q.start();
}
