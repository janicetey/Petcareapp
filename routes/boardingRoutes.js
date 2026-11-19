const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middleware/auth');
const boardingController = require('../controllers/boardingController');

router.get('/boarding', isLoggedIn, boardingController.showBoarding);
router.get('/boarding/book', isLoggedIn, boardingController.showBookingForm);
router.post('/boarding/book', isLoggedIn, boardingController.createBooking);
router.get('/boarding/confirmation/:reference', isLoggedIn, boardingController.showConfirmation);

module.exports = router;
