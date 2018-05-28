import chalk from 'chalk';

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
