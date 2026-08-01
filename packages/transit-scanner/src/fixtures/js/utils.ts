// transit:function
export function processFile(data: string): string {
    return data;
}

// No marker, but exported (should be discovered as tier 1)
export function helper(data: string): string {
    return data;
}

// Not exported (should NOT be discovered)
function internal(): void {}
