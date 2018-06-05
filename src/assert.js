const esprima = require('esprima');
const escodegen = require('escodegen');
const MagicString = require('magic-string');
import { findLineAndColumnForPosition } from './util';

const escodegenOptions = {
    format: {
        indent: {
            style: ''
        },
        newline: '',
        json: true
    }
};

export function getData(assertCode, file, position) {
    const ast = esprima.parse(assertCode, { tolerant: true, range: true });
    const args = ast.body[0].expression.arguments;

    const isBinaryExpression = args[0].type === 'BinaryExpression';
    const leftExpression = isBinaryExpression ? args[0].left : args[0];

    const data = {
        source: {
            code: assertCode,
            file,
            position
        },
        left: {
            code: escodegen.generate(leftExpression, escodegenOptions),
            value: '{{LEFT_VALUE}}',
            range: leftExpression.range
        },
        value: '{{VALUE}}'
    };

    if (isBinaryExpression) {
        data.operator = args[0].operator;
        data.right = {
            code: escodegen.generate(args[0].right, escodegenOptions),
            value: '{{RIGHT_VALUE}}',
            range: args[0].right.range
        };
    }

    if (args.length > 1 && args[1].type === 'Literal') {
        data.message = args[1].value;
    }

    return data;
}

function getReplacement(assertCode, file, position, index) {
    const data = getData(assertCode, file, position);
    let newCode = `\n    const _left${index} = ${data.left.code};`;
    let value = `_left${index}`;
    if (data.right) {
        newCode += `\n    const _right${index} = ${data.right.code};`;
        value += ` ${data.operator} _right${index}`;
    }

    let dataString = JSON.stringify(data);

    dataString = dataString.replace('"{{LEFT_VALUE}}"', `_left${index}`);
    dataString = dataString.replace('"{{RIGHT_VALUE}}"', `_right${index}`);
    dataString = dataString.replace('"{{VALUE}}"', value);

    newCode += `\n    t.assert(${dataString}`;
    if (data.message) {
        newCode += `, ${JSON.stringify(data.message)}`;
    }
    newCode += ');';

    return newCode;
}

export function transform(code, id) {
    // @todo this should use whatever variable is passed into the test function
    // instead of looking explicitly for `t.assert()` calls
    const re = /((?:\/\/|\/\*|['"`])\s*)?\bt\.assert\(.*?\);?(?=\n)/g;
    let match;
    let start;
    let end;
    let hasReplacements = false;

    const magicString = new MagicString(code);

    let i = 0;
    while ((match = re.exec(code))) {
        if (match[1]) {
            continue;
        }

        i += 1;
        hasReplacements = true;

        start = match.index;
        end = start + match[0].length;

        const position = findLineAndColumnForPosition(code, start);
        const replacement = getReplacement(match[0], id, position, i);

        magicString.overwrite(start, end, replacement);
    }

    if (!hasReplacements) {
        return null;
    }

    return {
        code: magicString.toString(),
        map: magicString.generateMap({ hires: true })
    };
}
