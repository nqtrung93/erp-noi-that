// Bọc async controller để tự forward lỗi sang errorHandler.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Lỗi có status code để errorHandler trả đúng mã.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new ApiError(400, msg);
export const unauthorized = (msg = "Chưa đăng nhập") => new ApiError(401, msg);
export const forbidden = (msg = "Không có quyền") => new ApiError(403, msg);
export const notFound = (msg = "Không tìm thấy") => new ApiError(404, msg);
