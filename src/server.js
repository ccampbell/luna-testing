const express = require('express');
const fs = require('fs');
const rollup = require('rollup');
const buble = require('rollup-plugin-buble');
const replace = require('rollup-plugin-replace');
const istanbul = require('rollup-plugin-istanbul');
import assert from './rollup-assert';

async function bundleHandler(req, res) {
    const filePath = req.params[0];

    const exists = fs.existsSync(filePath);
    if (!exists) {
        res.status(404).send('File does not exist');
        return;
    }

    try {
        const bundle = await rollup.rollup({
            input: 'src/run.js',
            treeshake: true, // for testing
            plugins: [
                replace({
                    TEST_FILE_PATH: `${process.cwd()}/${filePath}`
                }),
                // istanbul({
                //     exclude: [filePath]
                // }),
                buble({
                    target: {
                        chrome: 63
                    },
                    jsx: 'React.createElement'
                }),
                assert()
            ]
        });

        let { code, map } = await bundle.generate({
            format: 'iife',
            freeze: true,
            sourcemap: 'inline'
        });

        code += `\n//# sourceMappingURL=${map.toUrl()}\n`;

        res.set('Content-Type', 'application/javascript');
        res.send(code);
    } catch (e) {
        console.log(e);
        res.status(500).send(e);
        return;
    }
}

function runHandler(req, res) {
    const filePath = req.params[0];
    const bundlePath = `/bundle/${filePath}`;
    res.status(200).send(`<!DOCTYPE html><head><title>${filePath} – Test Runner</title></head><body><script src="${bundlePath}"></script></body>`);
}

export async function startServer(options) {
    const app = express();
    app.get(/\/bundle\/(.*)/, bundleHandler);
    app.get(/\/run\/(.*)/, runHandler);
    return app.listen(2662, () => {
        if (options.verbose) {
            console.log('Server started at http://localhost:2662…')
        }
    });
}
