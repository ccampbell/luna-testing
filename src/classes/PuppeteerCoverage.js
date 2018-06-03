import { resolveSourceMap } from '../coverage';
import { combineRanges } from '../util';
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

export default class PuppeteerCoverage {
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

    _merge(coverage) {
        for (const path in coverage) {
            this._coverage[path] = this._mergeRanges(this._coverage[path], coverage[path]);
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
