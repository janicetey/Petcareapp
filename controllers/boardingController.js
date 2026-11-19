const crypto = require('crypto');
const boardingBookingModel = require('../models/boardingBookingModel');
const petModel = require('../models/petModel');

function showBoarding(req, res) {
  res.render('boarding', { session: req.session });
}

function showBookingForm(req, res) {
  const ownerId = req.session.user.id;

  petModel.getPetsByOwner(ownerId, (err, pets) => {
    if (err) {
      console.error('Unable to load pets for boarding form:', err);
      return res.status(500).send('Unable to load your pets.');
    }

    return res.render('boardingBooking', {
      session: req.session,
      pets,
      rooms: boardingBookingModel.ROOM_OPTIONS,
      timeSlots: boardingBookingModel.TIME_SLOTS,
      today: boardingBookingModel.getTodayString(),
      submissionToken: crypto.randomBytes(24).toString('hex'),
      errors: req.flash('error')
    });
  });
}

function createBooking(req, res) {
  const booking = {
    petId: req.body.petId,
    roomKey: req.body.roomKey,
    checkInDate: req.body.checkInDate,
    checkInTime: req.body.checkInTime,
    pickUpDate: req.body.pickUpDate,
    pickUpTime: req.body.pickUpTime,
    submissionToken: req.body.submissionToken
  };

  boardingBookingModel.createPendingBooking(req.session.user.id, booking, (err, result) => {
    if (err) {
      console.error('Unable to create pet boarding booking:', err);
      req.flash('error', 'Unable to save your boarding booking. Please try again.');
      return res.redirect('/boarding/book');
    }

    if (!result || !result.booking_reference) {
      req.flash('error', 'Check your pet, dates, times, and room selection, then try again.');
      return res.redirect('/boarding/book');
    }

    return res.redirect(`/boarding/confirmation/${encodeURIComponent(result.booking_reference)}`);
  });
}

function showConfirmation(req, res) {
  boardingBookingModel.getBoardingBookingByReference(
    req.session.user.id,
    req.params.reference,
    (err, rows) => {
      if (err) {
        console.error('Unable to load boarding booking confirmation:', err);
        return res.status(500).send('Unable to load the booking confirmation.');
      }

      if (!rows || !rows.length) {
        return res.status(404).send('Boarding booking not found.');
      }

      return res.render('boardingConfirmation', {
        session: req.session,
        booking: rows[0]
      });
    }
  );
}

module.exports = {
  showBoarding,
  showBookingForm,
  createBooking,
  showConfirmation
};
