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

    const currentPosition = start;
    currentPosition.bias = sourceMap.SourceMapConsumer.LEAST_UPPER_BOUND;

    let lastSource = null;
    let currentData = null;
    let lastData = null;
    let newStart;
    let newEnd;
    while (currentPosition.line <= end.line) {
        // Keep the position for the first iteration and moving forward add a
        // line at a time
        if (currentData !== null) {
            currentPosition.line++;
            currentPosition.column = 0;
        }

        const isEnd = currentPosition.line === end.line;
        if (isEnd) {
            currentPosition.column = end.column;
        }

        currentData = consumer.originalPositionFor(currentPosition);
        const hasSource = currentData.source !== null;

        // If this is the end then add the range and return
        if (isEnd && newStart) {
            newEnd = hasSource ? currentData : lastData;
            addRangeToCoverage(newCoverage, sources, newStart, newEnd);
            return;
        }

        if (!hasSource) {
            continue;
        }

        // Situations where we want to start a new range and push this one onto
        // the stack
        const isNewSource = currentData.source !== lastSource && currentData.source !== null;
        const isBigLineJump = !isNewSource && lastData && (currentData.line - lastData.line > 2);
        const isNegativeLineJump = !isNewSource && lastData && currentData.line < lastData.line;
        if (isNewSource || isBigLineJump || isNegativeLineJump) {
            lastSource = currentData.source;

            // If we haven’t started a range then we should set this position
            // to the start of the range and continue on in the loop
            if (!newStart) {
                newStart = currentData;
                lastData = currentData;
                continue;
            }

            // Otherwise we should use the previous data to mark the end of the
            // last range and start a new range where we are
            newEnd = lastData;
            addRangeToCoverage(newCoverage, sources, newStart, newEnd);

            newStart = currentData;
            newEnd = null;
        }

        lastData = currentData;
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
