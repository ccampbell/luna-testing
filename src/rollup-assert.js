import MagicString from 'magic-string';
const esprima = require('esprima');
const escodegen = require('escodegen');

function findLineAndColumnForPosition(code, index) {
    const lines = code.split('\n');
    let pos = 0;
    let lastPos = 0;
    let line = 0;
    let column = 0;
    while (pos < index) {
        const nextLine = lines.shift();
        line += 1;
        lastPos = pos;
        pos += nextLine.length + 1; // 1 for the \n
    }

    column += (index - lastPos) + 1; // 1 to not be zero indexed
    return { line, column }
}

function escapeQuotes(string) {
    return string.replace(/'/g, "\\'");
}

function getReplacement(assertCode, file, position) {
    const ast = esprima.parse(assertCode);
    const args = ast.body[0].expression.arguments;

    const isBinaryExpression = args[0].type === 'BinaryExpression';
    let leftCode = escodegen.generate(isBinaryExpression ? args[0].left : args[0]);
    let newCode = `const left = ${leftCode};\n`;
    let rightCode = '';
    let operator = '';
    if (isBinaryExpression) {
        rightCode = escodegen.generate(args[0].right);
        operator = args[0].operator;
        newCode += `const right = ${rightCode};\n`;
    }

    newCode += `t.assert({
    source: {
        code: '${escapeQuotes(assertCode)}',
        file: '${file}',
        position: {
            line: ${position.line},
            column: ${position.column}
        }
    },
    left: {
        code: '${escapeQuotes(leftCode)}',
        value: left
    }`;

    if (!isBinaryExpression) {
        newCode += `,
    value: left\n`;
    }

    if (isBinaryExpression) {
        newCode += `,
    operator: '${operator}',
    right: {
        code: '${escapeQuotes(rightCode)}',
        value: right
    },
    value: left ${operator} right\n`;
    }

    newCode += '}';

    if (args.length > 1) {
        newCode += `, ${escodegen.generate(args[1])}`;
    }

    newCode += ');'

    return newCode;
}

export default function assert() {
    return {
        name: 'assert',
        transform(code, id) {
            const re = /\bt\.assert\(.*?\);?(?=\n)/g;
            let match;
            let start;
            let end;
            let hasReplacements = false;

            const magicString = new MagicString(code);

            while (match = re.exec(code)) {
                hasReplacements = true;

                start = match.index;
                end = start + match[0].length;

                const position = findLineAndColumnForPosition(code, start);
                const replacement = getReplacement(match[0], id, position);

                magicString.overwrite(start, end, replacement);
            }

            if (!hasReplacements) {
                return null;
            }

            let result = {
                code: magicString.toString(),
                map: magicString.generateMap({ hires: true })
            };

            return result;
        }
    }
}
