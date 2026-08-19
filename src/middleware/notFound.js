const AppError = require('../utils/AppError');

// Unmatched route — without this, Express's built-in handler returns an HTML
// page, the only response in the API that wouldn't match the error envelope.
function notFound(req, res, next) {
  next(new AppError(404, `Cannot ${req.method} ${req.originalUrl}`));
}

module.exports = notFound;
