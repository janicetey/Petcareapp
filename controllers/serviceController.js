const petModel = require('../models/petModel');
const serviceModel = require('../models/serviceModel');
const serviceBookingModel = require('../models/serviceBookingModel');
const boardingBookingModel = require('../models/boardingBookingModel');

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDateString(dateString) {
  if (typeof dateString !== 'string' || dateString.trim() === '') return false;

  const match = /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  if (!match) return false;

  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;

  const normalized = formatLocalDate(date);
  return normalized === dateString;
}

function getTodayString() {
  return formatLocalDate(new Date());
}

function showServicesOverview(req, res) {
  res.render('servicesOverview', {
    session: req.session,
    activePage: 'services'
  });
}

function listServices(req, res) {
  const ownerId = req.session.user.id;
  const selectedPetId = req.query.petId;

  petModel.getPetsByOwner(ownerId, (petErr, pets) => {
    if (petErr) {
      console.error(petErr);
      return res.status(500).send('Unable to load pets.');
    }

    serviceModel.getActiveServices((serviceErr, services) => {
      if (serviceErr) {
        console.error(serviceErr);
        return res.status(500).send('Unable to load services.');
      }

      let finalSelectedPetId = '';
      if (selectedPetId && pets.some((pet) => String(pet.id) === String(selectedPetId))) {
        finalSelectedPetId = String(selectedPetId);
      }

      return res.render('services', {
        pets,
        services,
        selectedPetId: finalSelectedPetId,
        today: getTodayString(),
        messages: req.flash('success'),
        errors: req.flash('error'),
        session: req.session,
        activePage: 'services'
      });
    });
  });
}

function createBooking(req, res) {
  const ownerId = req.session.user.id;
  const submittedPetId = req.body.petId;
  const submittedServiceId = req.body.serviceId;
  const submittedDate = req.body.bookingDate;

  const petId = Number(submittedPetId);
  const serviceId = Number(submittedServiceId);

  const validationError = 'Choose a pet, service, and valid booking date.';
  const unavailableError = 'That pet or service is unavailable for booking.';
  const databaseError = 'Unable to create the booking. Please try again.';

  const hasValidPetId = Number.isInteger(petId) && petId > 0;
  const hasValidServiceId = Number.isInteger(serviceId) && serviceId > 0;
  const hasValidDate = isValidDateString(submittedDate)
    && submittedDate >= getTodayString();

  if (!hasValidPetId || !hasValidServiceId || !hasValidDate) {
    req.flash('error', validationError);
    return res.redirect('/services');
  }

  serviceBookingModel.createPendingBooking(ownerId, petId, serviceId, submittedDate, (err, result) => {
    if (err) {
      console.error(err);
      req.flash('error', databaseError);
      return res.redirect(`/services${submittedPetId ? `?petId=${submittedPetId}` : ''}`);
    }

    if (!result) {
      req.flash('error', unavailableError);
      return res.redirect('/services');
    }

    req.flash('success', 'Booking created. Payment is pending; no payment has been processed.');
    return res.redirect('/bookings');
  });
}

function listBookings(req, res) {
  const ownerId = req.session.user.id;

  serviceBookingModel.getBookingsByOwner(ownerId, (serviceErr, serviceBookings) => {
    if (serviceErr) {
      console.error('Unable to load pet service bookings:', serviceErr);
      return res.status(500).send('Unable to load booking history.');
    }

    boardingBookingModel.getBoardingBookingsByOwner(ownerId, (boardingErr, boardingBookings) => {
      if (boardingErr) {
        console.error('Unable to load pet boarding bookings:', boardingErr);
        if (boardingErr.code === 'ER_NO_SUCH_TABLE') {
          const errors = req.flash('error');
          errors.push('Pet Boarding history is unavailable until the boarding_bookings database migration is applied.');
          return res.render('bookings', {
            bookings: serviceBookings,
            messages: req.flash('success'),
            errors,
            session: req.session
          });
        }
        return res.status(500).send('Unable to load booking history.');
      }

      const bookings = serviceBookings.concat(boardingBookings).sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      return res.render('bookings', {
        bookings,
        messages: req.flash('success'),
        errors: req.flash('error'),
        session: req.session
      });
    });
  });
}

module.exports = {
  showServicesOverview,
  listServices,
  createBooking,
  listBookings
};
