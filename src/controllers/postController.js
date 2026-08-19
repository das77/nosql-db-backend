const mongoose = require('mongoose');
const Post = require('../models/Post');
// Registers the User model so populate('author') can resolve the 'User' ref.
require('../models/User');
const AppError = require('../utils/AppError');

// Populate projection for author on every read path (spec: these two fields only).
const AUTHOR_FIELDS = 'username email';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// Ownership rule for PUT/DELETE: the post's author, or any admin.
// req.user is populated by the requireAuth middleware. The !req.user branch is
// unreachable in practice (requireAuth guards every caller) — it stays as a
// defensive assertion so this function is safe even if a route forgets the
// middleware.
function assertCanMutate(req, post) {
  if (!req.user) {
    throw new AppError(401, 'Authentication required');
  }
  if (req.user.role !== 'admin' && post.author.toString() !== req.user.id) {
    throw new AppError(403, 'You may only modify your own posts');
  }
}

// GET /api/posts
async function listPosts(req, res) {
  // Whitelisted filter only — never spread req.query into the Mongo query.
  const filter = {};
  if (req.query.status !== undefined) {
    filter.status = req.query.status;
  }
  if (req.query.author !== undefined) {
    // Reject here rather than letting Mongo raise a CastError: that keeps
    // CastError unambiguously meaning "bad :id" for the central handler.
    if (!mongoose.Types.ObjectId.isValid(req.query.author)) {
      throw new AppError(400, 'Invalid author id');
    }
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
}

// GET /api/posts/:id
async function getPost(req, res) {
  const post = await Post.findById(req.params.id).populate('author', AUTHOR_FIELDS);
  if (!post) {
    throw new AppError(404, 'Post not found');
  }
  res.json(post);
}

// POST /api/posts
async function createPost(req, res) {
  // Whitelisted body fields only — a client must not set createdAt or _id.
  const doc = {
    title: req.body.title,
    body: req.body.body,
    status: req.body.status,
    tags: req.body.tags,
    // From the verified token, never the body — clients cannot forge authorship.
    author: req.user.id
  };
  const post = await Post.create(doc);
  await post.populate('author', AUTHOR_FIELDS);
  res.status(201).json(post);
}

// PUT /api/posts/:id
async function updatePost(req, res) {
  const post = await Post.findById(req.params.id);
  if (!post) {
    throw new AppError(404, 'Post not found');
  }
  assertCanMutate(req, post);
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
}

// DELETE /api/posts/:id
async function deletePost(req, res) {
  const post = await Post.findById(req.params.id);
  if (!post) {
    throw new AppError(404, 'Post not found');
  }
  assertCanMutate(req, post);
  await post.deleteOne();
  res.status(204).end();
}

module.exports = { listPosts, getPost, createPost, updatePost, deletePost };
