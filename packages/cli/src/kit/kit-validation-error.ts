export class KitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KitValidationError";
  }
}
