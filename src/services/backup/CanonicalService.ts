export class CanonicalService {
  /**
   * Sorts object keys recursively and returns a deterministic, minified JSON string.
   */
  static stringify(data: any): string {
    // 1. FIXED: Handle null explicitly (JSON.stringify(null) === 'null')
    if (data === null) {
      return 'null';
    }

    // 2. Handle undefined (JSON.stringify(undefined) === undefined)
    // In arrays, this should become 'null'. In objects, the key is omitted.
    if (data === undefined) {
      return 'null'; // IMPORTANT: Return 'null' string so arrays don't break (e.g. [undefined] -> [null])
    }

    if (typeof data !== 'object') {
      return JSON.stringify(data);
    }

    if (Array.isArray(data)) {
      const arrayContent = data
        .map((item) => {
           // Standard JSON behavior: undefined in array becomes null
           return item === undefined ? 'null' : this.stringify(item);
        })
        .join(',');
      return `[${arrayContent}]`;
    }

    // It's an object
    const keys = Object.keys(data).sort();
    const objectContent = keys
      .map((key) => {
        const value = data[key];
        // Standard JSON behavior: undefined values in objects are omitted
        if (value === undefined) return null;
        return `${JSON.stringify(key)}:${this.stringify(value)}`;
      })
      .filter((item) => item !== null)
      .join(',');

    return `{${objectContent}}`;
  }
}