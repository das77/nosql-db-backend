const mongoose = require('mongoose');
const AppError = require('./AppError');

function encodeCursor(doc) {
  return Buffer.from(JSON.stringify({ createdAt: doc.createdAt, _id: doc._id }))
    .toString('base64');
}

// Every failure path below must be guarded explicitly. An unguarded cursor
// decoding to e.g. { _id: 'nope' } is valid base64 and valid JSON, so it reaches
// Mongoose's cast layer and dies as a CastError — which the central error handler
// maps to 404 'Post not found' (step 5). On a list endpoint that reads as a
// baffling not-found rather than the 400 this deserves. Same class of bug, and
// same fix, as the ObjectId.isValid() guard step 5 added for ?author=.
//
// One message for every failure: the cursor is opaque by contract, so which
// check failed isn't actionable for a client.
function decodeCursor(raw) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw new AppError(400, 'Invalid cursor');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AppError(400, 'Invalid cursor');
  }

  const createdAt = new Date(parsed.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new AppError(400, 'Invalid cursor');
  }

  // isValid() returns true for any 12-character string, so round-trip the value
  // to reject inputs that "validate" without actually being an ObjectId.
  if (!mongoose.Types.ObjectId.isValid(parsed._id)) {
    throw new AppError(400, 'Invalid cursor');
  }
  const _id = new mongoose.Types.ObjectId(parsed._id);
  if (String(_id) !== String(parsed._id)) {
    throw new AppError(400, 'Invalid cursor');
  }

  // Real Date/ObjectId instances, so the query never depends on implicit casting.
  return { createdAt, _id };
}

module.exports = { encodeCursor, decodeCursor };
