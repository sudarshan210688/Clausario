/** Request that is well-formed but cannot be served as asked (unkeyed provider, unknown article, …) → 400. */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

/** Error with an explicit HTTP status (401, 403, 404, 409, …); the message is safe to show. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
