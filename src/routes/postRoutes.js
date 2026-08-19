const express = require('express');
const controller = require('../controllers/postController');
const requireAuth = require('../middleware/requireAuth');
const {
  postCreateValidation,
  postUpdateValidation,
  handleValidationErrors
} = require('../validators');

const router = express.Router();

router.get('/', controller.listPosts);
router.get('/:id', controller.getPost);
// requireAuth runs first so an unauthenticated request gets 401 rather than
// leaking which fields failed validation. DELETE has no body to validate.
router.post('/', requireAuth, postCreateValidation, handleValidationErrors, controller.createPost);
router.put('/:id', requireAuth, postUpdateValidation, handleValidationErrors, controller.updatePost);
router.delete('/:id', requireAuth, controller.deletePost);

module.exports = router;
