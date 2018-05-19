export function findLineAndColumnForPosition(code, index) {
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

export function escapeQuotes(string) {
    return string.replace(/'/g, "\\'");
}
