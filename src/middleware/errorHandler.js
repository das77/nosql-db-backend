const AppError = require('../utils/AppError');

function send(res, status, message, details = null) {
  res.status(status).json({ error: { message, status, details } });
}

// Last app.use — every error response in the API is produced here.
// eslint-disable-next-line no-unused-vars -- Express requires the 4th param to
// recognize this as an error handler.
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    return send(res, err.status, err.message, err.details);
  }

  if (err.name === 'ValidationError') {
    return send(res, 400, 'Validation failed', Object.values(err.errors).map((e) => e.message));
  }

  if (err.name === 'CastError') {
    // The only surviving CastError source is a malformed :id on findById —
    // listPosts pre-validates ?author= with isValid() so that path can never
    // throw a CastError. Do not "fix" this into a 400 without re-checking that.
    return send(res, 404, 'Post not found');
  }

  if (err.code === 11000) {
    // Duplicate username/email is a unique-index violation, not a
    // ValidationError. 409 (not 400): the request was well-formed, it
    // conflicts with existing state.
    return send(res, 409, 'Username or email already in use');
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    // Defensive: requireAuth already catches these and rethrows as AppError so
    // it can distinguish the expired-token message. This covers any future
    // code path that verifies a token outside requireAuth.
    return send(res, 401, 'Invalid token');
  }

  console.error(err);
  send(res, 500, 'Internal server error');
}

module.exports = errorHandler;
