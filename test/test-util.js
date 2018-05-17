import { extractFunctionNames, isAsync, getElapsedTime, spaces, formatLine } from '../src/util';

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
