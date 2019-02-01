import { findLineAndColumnForPosition, findPositionForLineAndColumn } from './util';

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
    start.bias = sourceMap.SourceMapConsumer.LEAST_UPPER_BOUND;
    end.bias = sourceMap.SourceMapConsumer.LEAST_UPPER_BOUND;

    const startData = consumer.originalPositionFor(start);
    const endData = consumer.originalPositionFor(end);

    if (startData.source === endData.source && startData.source !== null) {
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

function getSourceMapData(coverage) {
    const sourceMapString = coverage.text.split('# sourceMappingURL=data:application/json;charset=utf-8;base64,').pop();
    const buf = Buffer.from(sourceMapString, 'base64');
    return JSON.parse(buf.toString());
}

export async function resolveSourceMap(coverage, ignore) {
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

        if (sourceMapData.sources[i].indexOf('/node_modules/') > -1) {
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

export async function applySourceMapToTrace(trace, coverage) {
    const sourceMapData = getSourceMapData(coverage[0]);
    const lines = trace.split('\n');
    await sourceMap.SourceMapConsumer.with(sourceMapData, null, (consumer) => {
        for (let i = 0; i < lines.length; i++) {
            lines[i] = applySourceMapToLine(lines[i], consumer);
        }
    });

    return lines.join('\n');
}
