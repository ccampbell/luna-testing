import chalk from 'chalk';

const operator = /\+|\!|\-|&|>|<|\||\*|\=/g;
const string = /('|"|`)([\s\S]*?)(\1)/g;
const escapedStringChars = /\\('|"|`)/g
const constant = /\b(\d+|true|false)\b/g;
const commentLine = /\/\/(.*)/g;
const commentMultiline = /\/\*([\s\S]*?)\*\//g;

export function extractFunctionNames(source) {
    source = source.replace(commentLine, '');
    source = source.replace(commentMultiline, '');
    source = source.replace(escapedStringChars, '');
    source = source.replace(string, '__STRING__');

    const re = /export(?: async)?\s+function\s+(test.*?)\(/g;
    let match;
    const names = [];
    while (match = re.exec(source)) {
        names.push(match[1]);
    }

    return names;
}

export function isAsync(fn) {
    const AsyncFunction = (async () => {}).constructor;
    return fn instanceof AsyncFunction;
}

export function getElapsedTime(startTime, endTime) {
    const elapsed = endTime / 1000 - startTime / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.round((elapsed - (minutes * 60)) * 100) / 100;

    let response = '';
    if (minutes > 0) {
        response += `${minutes} minute${minutes != 1 ? 's' : ''}, `;
    }

    if (seconds < 1) {
        return response.slice(0, -2);
    }

    response += `${seconds} second${seconds != 1 ? 's' : ''}`;
    return response
}

export function syntaxHighlight(code) {
    let strings = [];
    let stringMap = {};

    code = code.replace(string, (match) => {
        const stringName = `__STRING__${strings.length}`;
        strings.push(stringName);
        stringMap[stringName] = match;
        return stringName;
    });

    code = code.replace(operator, (match) => {
        return chalk.magenta(match)
    });

    code = code.replace(constant, (match) => {
        return chalk.yellow(match);
    });

    for (const stringName of strings) {
        code = code.replace(stringName, chalk.green(stringMap[stringName]));
    }

    return code;
}

export function spaces(count) {
    let str = '';
    for (let i = 0; i < count; i++) {
        str += ' ';
    }
    return str;
}

export function formatLine(number, width) {
    let numberString = number.toString();
    let numberWidth = numberString.length;
    while (numberWidth < width) {
        numberString = ` ${numberString}`;
        numberWidth += 1;
    }

    return numberString;
}
