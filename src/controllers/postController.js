const Post = require('../models/Post');
// Registers the User model so populate('author') can resolve the 'User' ref —
// nothing else imports it until step 4 adds auth routes.
require('../models/User');

// Populate projection for author on every read path (spec: these two fields only).
const AUTHOR_FIELDS = 'username email';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// Interim error responder. Replaced by the centralized error middleware in step 5;
// the response shape is already the final one so consumers don't see a break.
function sendError(res, status, message, details = null) {
  res.status(status).json({ error: { message, status, details } });
}

// Ownership rule for PUT/DELETE: the post's author, or any admin.
// req.user is populated by the auth middleware added in step 4. Until then this
// returns 401 for every request, so these routes are closed rather than open.
// If step 4's JWT payload uses `sub` rather than `id`, the comparison below is
// the single place to adjust.
function authorizePostMutation(req, res, post) {
  if (!req.user) {
    sendError(res, 401, 'Authentication required');
    return false;
  }
  if (req.user.role !== 'admin' && post.author.toString() !== req.user.id) {
    sendError(res, 403, 'You may only modify your own posts');
    return false;
  }
  return true;
}

// GET /api/posts
async function listPosts(req, res) {
  try {
    // Whitelisted filter only — never spread req.query into the Mongo query.
    const filter = {};
    if (req.query.status !== undefined) {
      filter.status = req.query.status;
    }
    if (req.query.author !== undefined) {
      filter.author = req.query.author;
    }
    if (req.query.tags !== undefined) {
      const tags = String(req.query.tags)
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      if (tags.length > 0) {
        filter.tags = { $in: tags };
      }
    }

    // Mongoose accepts 'title -createdAt' natively, with '-' meaning descending.
    let sort = '-createdAt';
    if (req.query.sort !== undefined) {
      const fields = String(req.query.sort)
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
      if (fields.length > 0) {
        sort = fields.join(' ');
      }
    }

    let page = parseInt(req.query.page, 10);
    if (Number.isNaN(page) || page < 1) {
      page = 1;
    }
    let limit = parseInt(req.query.limit, 10);
    if (Number.isNaN(limit) || limit < 1) {
      limit = DEFAULT_LIMIT;
    }
    limit = Math.min(limit, MAX_LIMIT);
    const skip = (page - 1) * limit;

    // Both queries must share the same filter or total will be wrong.
    const [data, total] = await Promise.all([
      Post.find(filter).populate('author', AUTHOR_FIELDS).sort(sort).skip(skip).limit(limit),
      Post.countDocuments(filter)
    ]);

    res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    if (err.name === 'CastError') {
      // A bad ?author= filter value is a bad request (distinct from the 404 a
      // bad :id path param produces in getPost).
      return sendError(res, 400, 'Invalid author id');
    }
    console.error(err);
    sendError(res, 500, 'Internal server error');
  }
}

// GET /api/posts/:id
async function getPost(req, res) {
  try {
    const post = await Post.findById(req.params.id).populate('author', AUTHOR_FIELDS);
    if (!post) {
      return sendError(res, 404, 'Post not found');
    }
    res.json(post);
  } catch (err) {
    if (err.name === 'CastError') {
      // A malformed id names a resource that cannot exist — 404, not 400.
      return sendError(res, 404, 'Post not found');
    }
    console.error(err);
    sendError(res, 500, 'Internal server error');
  }
}

// POST /api/posts
// TODO(step-4): apply requireAuth middleware to this route; then source author
// from req.user.id and drop author from the body whitelist below.
async function createPost(req, res) {
  try {
    // Whitelisted body fields only — a client must not set createdAt or _id.
    const doc = {
      title: req.body.title,
      body: req.body.body,
      status: req.body.status,
      tags: req.body.tags,
      // Interim: trusted from the body until step 4 replaces it with req.user.id.
      // If absent, the schema's required validator produces the 400 below.
      author: req.body.author
    };
    const post = await Post.create(doc);
    await post.populate('author', AUTHOR_FIELDS);
    res.status(201).json(post);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return sendError(res, 400, 'Validation failed',
        Object.values(err.errors).map((e) => e.message));
    }
    if (err.name === 'CastError') {
      return sendError(res, 400, 'Invalid author id');
    }
    console.error(err);
    sendError(res, 500, 'Internal server error');
  }
}

// PUT /api/posts/:id
async function updatePost(req, res) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return sendError(res, 404, 'Post not found');
    }
    if (!authorizePostMutation(req, res, post)) {
      return;
    }
    // Same whitelist as create, minus author — ownership is not reassignable.
    for (const field of ['title', 'body', 'status', 'tags']) {
      if (req.body[field] !== undefined) {
        post[field] = req.body[field];
      }
    }
    // save() (not findByIdAndUpdate) so schema validators run without runValidators.
    await post.save();
    await post.populate('author', AUTHOR_FIELDS);
    res.json(post);
  } catch (err) {
    if (err.name === 'CastError') {
      return sendError(res, 404, 'Post not found');
    }
    if (err.name === 'ValidationError') {
      return sendError(res, 400, 'Validation failed',
        Object.values(err.errors).map((e) => e.message));
    }
    console.error(err);
    sendError(res, 500, 'Internal server error');
  }
}

// DELETE /api/posts/:id
async function deletePost(req, res) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return sendError(res, 404, 'Post not found');
    }
    if (!authorizePostMutation(req, res, post)) {
      return;
    }
    await post.deleteOne();
    res.status(204).end();
  } catch (err) {
    if (err.name === 'CastError') {
      return sendError(res, 404, 'Post not found');
    }
    console.error(err);
    sendError(res, 500, 'Internal server error');
  }
}

module.exports = { listPosts, getPost, createPost, updatePost, deletePost };
