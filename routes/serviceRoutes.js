const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middleware/auth');
const serviceController = require('../controllers/serviceController');

router.get('/services/overview', isLoggedIn, serviceController.showServicesOverview);
router.get('/services', isLoggedIn, serviceController.listServices);
router.post('/services/book', isLoggedIn, serviceController.createBooking);
router.get('/bookings/:type/:id/edit', isLoggedIn, serviceController.editBooking);
router.post('/bookings/:type/:id/edit', isLoggedIn, serviceController.updateBooking);
router.post('/bookings/:type/:id/delete', isLoggedIn, serviceController.deleteBooking);
router.get('/bookings', isLoggedIn, serviceController.listBookings);

module.exports = router;
