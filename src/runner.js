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

async function runTest(browser, testPath) {
    return new Promise(async (resolve, reject) => {
        try {
            const page = await browser.newPage();
            const url = `http://localhost:2662/run/${testPath}`
            page.on('console', msg => {
                console.log(msg._text);
            });

            await page.goto(url, { timeout: 5000 });
            await page.waitForSelector('.done')
            await page.close();
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

export async function runTests(options) {
    const server = await startServer();
    const browser = await puppeteer.launch();

    const q = new Queue({
        concurrency: options.concurrency
    });

    const files = await getFilesToRun(options.path)
    for (const filePath of files) {
        q.addTask(runTest(browser, filePath), filePath);
    }

    // q.on('start', () => {
    //     console.log('start');
    // })

    // q.on('taskstart', (name) => {
    //     console.log('taskstart', name);
    // })

    // q.on('taskend', (name) => {
    //     console.log('taskend', name);
    // })

    q.on('complete', async () => {
        await browser.close();
        await server.close();
        process.exit(0);
    });

    q.start();
}
