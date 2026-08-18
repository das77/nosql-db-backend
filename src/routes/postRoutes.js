const express = require('express');
const controller = require('../controllers/postController');

const router = express.Router();

router.get('/', controller.listPosts);
router.get('/:id', controller.getPost);
// TODO(step-4): insert requireAuth before the handler on the three routes below,
// and validation chains from express-validator on POST/PUT.
router.post('/', controller.createPost);
router.put('/:id', controller.updatePost);
router.delete('/:id', controller.deletePost);

module.exports = router;
