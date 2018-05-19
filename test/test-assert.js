import { escapeQuotes, findLineAndColumnForPosition } from '../src/assert';

export function testFindLineAndColumnForPosition(t) {
    const someCode = `function something() {
    const something = true;
    return something;
}`;

    const pos = findLineAndColumnForPosition(someCode, 30);

    // @todo create a shortcut for comparing objects
    t.assert(typeof pos === 'object');
    t.assert(pos.hasOwnProperty('line'));
    t.assert(pos.hasOwnProperty('column'));
    t.assert(pos.line === 2);
    t.assert(pos.column === 8);
}

export function testEscapeQuotes(t) {
    const string = "what's going on";
    t.assert(escapeQuotes(string) === "what");
}
