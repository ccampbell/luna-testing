import { findLineAndColumnForPosition, findPositionForLineAndColumn } from './util';

const sourceMap = require('source-map');
const v8toIstanbul = require('v8-to-istanbul');

function addRangeToCoverage(newCoverage, sources, start, end) {
    const index = sources.indexOf(start.source);
    newCoverage[index].ranges.push({
        start: findPositionForLineAndColumn(newCoverage[index].text, start),
        end: findPositionForLineAndColumn(newCoverage[index].text, end)
    });
}

function addToCoverage({ newCoverage, sources, code, range, consumer }) {
    const start = findLineAndColumnForPosition(code, range.start);
    const end = findLineAndColumnForPosition(code, range.end);
    start.bias = sourceMap.SourceMapConsumer.LEAST_UPPER_BOUND;
    end.bias = sourceMap.SourceMapConsumer.LEAST_UPPER_BOUND;

    const startData = consumer.originalPositionFor(start);
    const endData = consumer.originalPositionFor(end);

    if (startData.source === endData.source) {
        addRangeToCoverage(newCoverage, sources, startData, endData);
        return;
    }

    const newRanges = [];
    const start2 = start;
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

    for (const newRange of newRanges) {
        addRangeToCoverage(newCoverage, sources, newRange[0], newRange[1]);
    }
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

    if (remove > -1) {
        newCoverage.splice(remove, 1);
    }

    return Promise.resolve(newCoverage);
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

    return coverage.map((item) => ({
        scriptId: id++,
        url: `file://${item.url}`,
        functions: [{
            ranges: item.ranges.map(convertRange),
            isBlockCoverage: true
        }]
    }));
}

function convertToIstanbul(coverage) {
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

export async function puppeteerToIstanbul(coverage, ignore) {
    return new Promise(async(resolve, reject) => {
        if (coverage.length === 0) {
            resolve(coverage);
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

        const v8Coverage = convertToV8(sourceMapCoverage);
        const istanbulCoverage = convertToIstanbul(v8Coverage);
        resolve(istanbulCoverage);
    });
}
