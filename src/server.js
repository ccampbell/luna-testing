const express = require('express');
const fs = require('fs');
const path = require('path');
const rollup = require('rollup');
const buble = require('rollup-plugin-buble');
const replace = require('rollup-plugin-replace');
const coverage = require('rollup-plugin-istanbul');
import assert from './rollup-assert';
import chalk from 'chalk';

let runOptions;

export async function getBundle(filePath, options) {
    return new Promise(async(resolve, reject) => {
        try {
            const plugins = [
                replace({
                    TEST_FILE_PATH: path.join(process.cwd(), filePath),
                    TEST_TIMEOUT: options.timeout
                }),
                buble({
                    target: {
                        chrome: 63
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

            const bundle = await rollup.rollup({
                input: path.resolve(`${__dirname}/../src`, options.node ? 'run-node.js' : 'run-browser.js'),
                external: ['chalk'],
                treeshake: true,
                plugins
            });

            /* eslint-disable prefer-const */
            let { code, map } = await bundle.generate({
                format: options.node ? 'cjs' : 'iife',
                freeze: true,
                sourcemap: 'inline'
            });
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

    const exists = fs.existsSync(filePath);
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
    res.status(200).send(`<!DOCTYPE html><head><title>${filePath} – Test Runner</title></head><body><script src="${bundlePath}"></script></body>`);
}

export async function startServer(options) {
    runOptions = options;

    const app = express();
    app.get(/\/bundle\/(.*)/, bundleHandler);
    app.get(/\/run\/(.*)/, runHandler);
    return app.listen(options.port, () => {
        if (options.verbose) {
            console.log(`🔌  Server started at ${chalk.bold(`http://localhost:${options.port}`)}…`);
        }
    });
}
