// Errors this code raises deliberately, carrying the status the handler should use.
// Framework errors (Mongoose, JWT, Mongo) are classified by name/code instead.
class AppError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
  }
}

module.exports = AppError;
