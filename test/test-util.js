import {
    deepEquals,
    extractFunctionNames,
    findLineAndColumnForPosition,
    findPositionForLineAndColumn,
    formatLine,
    getElapsedTime,
    isAsync,
    looksTheSame,
    spaces,
    combineRanges
} from '../src/util';

export function testExtractFunctionNames(t) {
    const fakeCode = `function something() {}
export function somethingElse() {}
export function testSomething() {}
export async function testMoreThings() {
    const wow = \`
export function testString() {}\`;
}

// export function testAnother() {}

/*
export function testInsideComment() {}
*/
`;

    const functionNames = extractFunctionNames(fakeCode);
    t.assert(functionNames.length === 2);
    t.assert(functionNames[0] === 'testSomething');
    t.assert(functionNames[1] === 'testMoreThings');
}

export function testIsAsync(t) {
    const fn = () => {};
    t.assert(isAsync(fn) === false);

    const asyncFn = async() => {};
    t.assert(isAsync(asyncFn) === true);
}

export function testGetElapsedTime(t) {
    const start = new Date().getTime();
    let end = start + 5123;

    let elapsed = getElapsedTime(start, end);
    t.assert(elapsed === '5.12 seconds');

    end = start + 67500;
    elapsed = getElapsedTime(start, end);
    t.assert(elapsed === '1 minute, 7.5 seconds');

    end = start + 300000;
    elapsed = getElapsedTime(start, end);
    t.assert(elapsed === '5 minutes');

    end = start + 550;
    elapsed = getElapsedTime(start, end);
    t.assert(elapsed === '0.55 seconds');
}

export function testSpaces(t) {
    t.assert(spaces(1) === ' ');
    t.assert(spaces(4) === '    ');
}

export function testFormatLine(t) {
    t.assert(formatLine(55, 3) === ' 55');
    t.assert(formatLine(55, 4) === '  55');
    t.assert(formatLine(100, 4) === ' 100');
    t.assert(formatLine(5, 1) === '5');
}

export function testLooksTheSame(t) {
    const first = '{one: 1, two: 2, three: 3}';
    const second = {"one":1,"two":2,"three":3};
    t.assert(looksTheSame(first, second));

    const anotherFirst = '{one: 1, two: 2, }';
    t.assert(looksTheSame(anotherFirst, second) === false, 'Invalid JSON should be false');
}

export function testDeepEquals(t) {
    const first = {
        one: 1,
        two: 2,
        three: {
            number: 3,
            text: 'three'
        }
    };

    const second = {
        three: {
            number: 3,
            text: 'three'
        },
        two: 2,
        one: 1
    };

    t.assert(deepEquals(first, second) === true);
}

export function testFindLineAndColumnForPosition(t) {
    const someCode = `function something() {
    const something = true;
    return something;
}`;

    const pos = findLineAndColumnForPosition(someCode, 30);
    t.assert(pos == {line: 2, column: 7}, 'Position should match');

    const zero = findLineAndColumnForPosition(someCode, 0);
    t.assert(zero == {line: 1, column: 0});
}

export function testFindPositionForLineAndColumn(t) {
    const someCode = `function something() {
    const something = true;
    return something;
}`;

    const position = findPositionForLineAndColumn(someCode, {line: 2, column: 7});
    t.assert(position === 30);

    const position2 = findPositionForLineAndColumn(someCode, {line: 1, column: 0});
    t.assert(position2 === 0);
}

export function testCombineRanges(t) {
    let range1 = [
        { start: 5, end: 10 },
        { start: 20, end: 100 },
        { start: 200, end: 500 }
    ];

    let range2 = [
        { start: 0, end: 7 },
        { start: 13, end: 17 },
        { start: 99, end: 600 }
    ];

    let newRanges = combineRanges(range1, range2);
    let expected = [
        { start: 0, end: 10 },
        { start: 13, end: 17 },
        { start: 20, end: 600 }
    ];

    t.assert(newRanges == expected);

    let range3 = [
        { start: 7, end: 1000 }
    ];

    expected = [
        { start: 5, end: 1000 }
    ];

    newRanges = combineRanges(range1, range3);
    t.assert(newRanges == expected);
}
