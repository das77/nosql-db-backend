const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    minlength: [3, 'Title must be at least 3 characters'],
    maxlength: [120, 'Title must be at most 120 characters']
  },
  body: {
    type: String,
    required: [true, 'Body is required'],
    minlength: [10, 'Body must be at least 10 characters']
  },
  status: {
    type: String,
    enum: { values: ['draft', 'published', 'archived'], message: 'Status must be draft, published, or archived' },
    default: 'draft'
  },
  tags: {
    type: [String],
    default: []
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author is required']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index: the common access pattern is a status filter with the default
// -createdAt sort, which this satisfies as one index scan. Its `status` prefix also
// serves bare `status` lookups, so a separate { status: 1 } would be redundant.
postSchema.index({ status: 1, createdAt: -1 });
// Backs ?author=<id> and the ownership lookups on PUT/DELETE.
postSchema.index({ author: 1 });
// tags is deliberately NOT indexed: it's an $in over a small, low-cardinality array,
// and a multikey index only pays off once cardinality or query volume justifies it.
// (Step 3 added one speculatively; step 10 removed it.)

module.exports = mongoose.model('Post', postSchema);
