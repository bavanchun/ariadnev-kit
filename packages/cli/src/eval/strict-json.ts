class DuplicateJsonKeyError extends Error {}

class JsonCursor {
  private offset = 0;

  constructor(
    private readonly input: string,
    private readonly source: string,
  ) {}

  scan(): void {
    this.value();
    this.whitespace();
    if (this.offset !== this.input.length) this.invalid();
  }

  private whitespace(): void {
    while (/\s/.test(this.input[this.offset] ?? "")) this.offset += 1;
  }

  private invalid(): never {
    throw new Error(`${this.source}: must be valid JSON`);
  }

  private string(): string {
    const start = this.offset;
    if (this.input[this.offset] !== '"') this.invalid();
    this.offset += 1;
    while (this.offset < this.input.length) {
      const character = this.input[this.offset];
      if (character === '"') {
        this.offset += 1;
        return JSON.parse(this.input.slice(start, this.offset)) as string;
      }
      if (character === "\\") this.offset += 1;
      this.offset += 1;
    }
    return this.invalid();
  }

  private primitive(): void {
    const start = this.offset;
    while (this.offset < this.input.length && !/[\s,\]}]/.test(this.input[this.offset])) this.offset += 1;
    if (start === this.offset) this.invalid();
  }

  private value(): void {
    this.whitespace();
    const character = this.input[this.offset];
    if (character === "{") this.object();
    else if (character === "[") this.array();
    else if (character === '"') this.string();
    else this.primitive();
  }

  private object(): void {
    this.offset += 1;
    this.whitespace();
    if (this.input[this.offset] === "}") {
      this.offset += 1;
      return;
    }
    const keys = new Set<string>();
    while (this.offset < this.input.length) {
      this.whitespace();
      const key = this.string();
      if (keys.has(key)) throw new DuplicateJsonKeyError(`${this.source}: duplicate JSON object key: ${key}`);
      keys.add(key);
      this.whitespace();
      if (this.input[this.offset] !== ":") this.invalid();
      this.offset += 1;
      this.value();
      this.whitespace();
      if (this.input[this.offset] === "}") {
        this.offset += 1;
        return;
      }
      if (this.input[this.offset] !== ",") this.invalid();
      this.offset += 1;
    }
    this.invalid();
  }

  private array(): void {
    this.offset += 1;
    this.whitespace();
    if (this.input[this.offset] === "]") {
      this.offset += 1;
      return;
    }
    while (this.offset < this.input.length) {
      this.value();
      this.whitespace();
      if (this.input[this.offset] === "]") {
        this.offset += 1;
        return;
      }
      if (this.input[this.offset] !== ",") this.invalid();
      this.offset += 1;
    }
    this.invalid();
  }
}

export function parseStrictJson(input: string, source: string): unknown {
  try {
    new JsonCursor(input, source).scan();
    return JSON.parse(input) as unknown;
  } catch (error) {
    if (error instanceof DuplicateJsonKeyError) throw error;
    throw new Error(`${source}: must be valid JSON`);
  }
}
