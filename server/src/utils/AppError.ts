export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown[] = [],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message = 'Permintaan tidak valid', details: unknown[] = []): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Silakan login terlebih dahulu'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Anda tidak memiliki akses ke sumber daya ini'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Data tidak ditemukan'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message = 'Data sudah ada atau bentrok'): AppError {
    return new AppError(409, 'CONFLICT', message);
  }
}
