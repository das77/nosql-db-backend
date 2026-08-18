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

// These back the ?status= / ?author= / ?tags= filters added in step 3.
postSchema.index({ status: 1 });
postSchema.index({ author: 1 });
postSchema.index({ tags: 1 });

module.exports = mongoose.model('Post', postSchema);
