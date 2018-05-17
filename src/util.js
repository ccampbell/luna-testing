import chalk from 'chalk';

export function lower(string) {
    return string.toLowerCase();
}

export function extractFunctionNames(source) {
    const re = /export(?: async)?\s+function\s+(test.*?)\(/g;
    let match;
    const names = [];
    while (match = re.exec(source)) {
        names.push(match[1]);
    }

    return names;
}

export function namesToArray(names) {
    let string = '[\n    \'';
    string += names.join('\',\n    \'');
    string += '\'\n];\n';
    return string;
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

    response += `${seconds} second${seconds != 1 ? 's' : ''}`;
    return response
}

export function syntaxHighlight(code) {
    const operator = /\+|\!|\-|&|>|<|\||\*|\=/g;
    const string = /('|")(.*?)(\1)/g;
    const constant = /\b(\d+|true|false)\b/g;
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
