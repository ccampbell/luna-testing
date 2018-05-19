import {
    extractFunctionNames,
    formatLine,
    getElapsedTime,
    isAsync,
    looksTheSame,
    spaces
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
}
