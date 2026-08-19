const express = require('express');
const controller = require('../controllers/authController');
const { registerValidation, loginValidation, handleValidationErrors } = require('../validators');

const router = express.Router();

router.post('/register', registerValidation, handleValidationErrors, controller.register);
router.post('/login', loginValidation, handleValidationErrors, controller.login);

module.exports = router;
