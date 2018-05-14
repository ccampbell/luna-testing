// This is the runner that runs from node.js to execute the tests
import { startServer } from './server';
import Queue from './classes/Queue';

const fs = require('fs');
const puppeteer = require('puppeteer');
const walk = require('walk');

async function getFilesToRun(path) {
    return new Promise((resolve, reject) => {
        const stats = fs.lstatSync(path);
        const paths = [];
        if (stats.isFile()) {
            paths.push(path);
            resolve(paths);
            return;
        }

        const walker = walk.walk(path);
        walker.on('file', (root, fileStats, next) => {
            paths.push(`${root}/${fileStats.name}`);
            next();
        });

        walker.on('errors', (root, nodeStatsArray, next) => {
            next();
        });

        walker.on('end', () => {
            resolve(paths);
        });
    });
}

async function runTest(browser, testPath, options) {
    return new Promise(async (resolve, reject) => {
        try {
            const page = await browser.newPage();
            const url = `http://localhost:2662/run/${testPath}`
            let results = {};
            page.on('console', msg => {
                if (options.verbose && /^Running/.test(msg._text)) {
                    console.log(`[${testPath}]`, msg._text);
                    return;
                }

                if (/^Results/.test(msg._text)) {
                    results = JSON.parse(msg._text.slice(8));
                    return;
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

export async function runTests(options) {
    const server = await startServer(options);
    const browser = await puppeteer.launch();

    const q = new Queue({
        concurrency: options.concurrency
    });

    let files = [];
    for (const path of options.paths) {
        const newFiles = await getFilesToRun(path);
        files = files.concat(newFiles);
    }

    for (const filePath of files) {
        q.addTask(runTest(browser, filePath, options), filePath);
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
        await browser.close();
        await server.close();
        process.exit(0);
    });

    q.start();
}
