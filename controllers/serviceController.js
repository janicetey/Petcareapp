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

function getBookingType(req, res) {
  if (req.params.type === 'service') return 'service';
  if (req.params.type === 'boarding') return 'boarding';
  res.status(404).send('Booking not found.');
  return null;
}

function isValidBookingId(value) {
  const bookingId = Number(value);
  return Number.isSafeInteger(bookingId) && bookingId > 0;
}

function renderBookingEdit(req, res, booking, pets, services) {
  return res.render('editBooking', {
    booking,
    bookingType: req.params.type,
    pets,
    services: services || [],
    rooms: boardingBookingModel.ROOM_OPTIONS,
    timeSlots: boardingBookingModel.TIME_SLOTS,
    messages: req.flash('success'),
    errors: req.flash('error'),
    session: req.session
  });
}

function editBooking(req, res) {
  const bookingType = getBookingType(req, res);
  if (!bookingType) return;
  if (!isValidBookingId(req.params.id)) return res.status(404).send('Booking not found.');

  const ownerId = req.session.user.id;
  const getBooking = bookingType === 'service'
    ? serviceBookingModel.getBookingByIdAndOwner
    : boardingBookingModel.getBoardingBookingByIdAndOwner;

  getBooking(ownerId, Number(req.params.id), (bookingError, rows) => {
    if (bookingError) {
      console.error('Unable to load booking for editing:', bookingError);
      return res.status(500).send('Unable to load the booking.');
    }

    if (!rows || !rows.length) return res.status(404).send('Booking not found.');
    const booking = rows[0];

    petModel.getPetsByOwner(ownerId, (petError, pets) => {
      if (petError) {
        console.error('Unable to load pets for booking edit:', petError);
        return res.status(500).send('Unable to load your pets.');
      }

      if (bookingType === 'boarding') {
        return renderBookingEdit(req, res, booking, pets);
      }

      serviceModel.getServicesForBookingEdit((serviceError, services) => {
        if (serviceError) {
          console.error('Unable to load services for booking edit:', serviceError);
          return res.status(500).send('Unable to load services.');
        }
        return renderBookingEdit(req, res, booking, pets, services);
      });
    });
  });
}

function updateBooking(req, res) {
  const bookingType = getBookingType(req, res);
  if (!bookingType) return;
  if (!isValidBookingId(req.params.id)) return res.status(404).send('Booking not found.');

  const ownerId = req.session.user.id;
  const bookingId = Number(req.params.id);
  const editPath = `/bookings/${bookingType}/${bookingId}/edit`;

  if (bookingType === 'service') {
    const booking = {
      petId: Number(req.body.petId),
      serviceId: Number(req.body.serviceId),
      bookingDate: req.body.bookingDate
    };
    if (!Number.isInteger(booking.petId) || booking.petId < 1
      || !Number.isInteger(booking.serviceId) || booking.serviceId < 1
      || !isValidDateString(booking.bookingDate)) {
      req.flash('error', 'Choose a pet, service, and valid booking date.');
      return res.redirect(editPath);
    }

    return serviceBookingModel.updateBooking(ownerId, bookingId, booking, (error, result) => {
      if (error) {
        console.error('Unable to update pet service booking:', error);
        req.flash('error', 'Unable to update the booking. Please try again.');
        return res.redirect(editPath);
      }
      if (!result) return res.status(404).send('Booking not found.');
      if (result.invalid) {
        req.flash('error', 'Choose one of your pets and a valid service.');
        return res.redirect(editPath);
      }
      req.flash('success', 'Pet Service booking updated successfully.');
      return res.redirect('/bookings');
    });
  }

  const booking = {
    petId: req.body.petId,
    roomKey: req.body.roomKey,
    checkInDate: req.body.checkInDate,
    checkInTime: req.body.checkInTime,
    pickUpDate: req.body.pickUpDate,
    pickUpTime: req.body.pickUpTime
  };
  const petId = Number(booking.petId);
  const roomExists = boardingBookingModel.ROOM_OPTIONS.some((room) => room.key === booking.roomKey);
  const datesValid = boardingBookingModel.isValidDateString(booking.checkInDate)
    && boardingBookingModel.isValidDateString(booking.pickUpDate)
    && booking.pickUpDate > booking.checkInDate;
  const timesValid = boardingBookingModel.TIME_SLOTS.some((slot) => slot.value === booking.checkInTime)
    && boardingBookingModel.TIME_SLOTS.some((slot) => slot.value === booking.pickUpTime);

  if (!Number.isInteger(petId) || petId < 1 || !roomExists || !datesValid || !timesValid) {
    req.flash('error', 'Check your pet, dates, times, and room selection, then try again.');
    return res.redirect(editPath);
  }

  boardingBookingModel.updateBoardingBooking(ownerId, bookingId, booking, (error, result) => {
    if (error) {
      console.error('Unable to update pet boarding booking:', error);
      req.flash('error', 'Unable to update the booking. Please try again.');
      return res.redirect(editPath);
    }
    if (!result) return res.status(404).send('Booking not found.');
    if (result.invalid) {
      req.flash('error', 'Choose one of your pets, then try again.');
      return res.redirect(editPath);
    }
    req.flash('success', 'Pet Boarding booking updated successfully.');
    return res.redirect('/bookings');
  });
}

function deleteBooking(req, res) {
  const bookingType = getBookingType(req, res);
  if (!bookingType) return;
  if (!isValidBookingId(req.params.id)) return res.status(404).send('Booking not found.');

  const ownerId = req.session.user.id;
  const bookingId = Number(req.params.id);
  const deleteModel = bookingType === 'service'
    ? serviceBookingModel.deleteBooking
    : boardingBookingModel.deleteBoardingBooking;

  deleteModel(ownerId, bookingId, (error, result) => {
    if (error) {
      console.error('Unable to delete booking:', error);
      req.flash('error', 'Unable to delete the booking. Please try again.');
      return res.redirect('/bookings');
    }
    if (!result || !result.affectedRows) return res.status(404).send('Booking not found.');
    req.flash('success', 'Booking deleted successfully.');
    return res.redirect('/bookings');
  });
}

module.exports = {
  showServicesOverview,
  listServices,
  createBooking,
  listBookings,
  editBooking,
  updateBooking,
  deleteBooking
};
