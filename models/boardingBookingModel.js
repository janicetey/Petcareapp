const crypto = require('crypto');
const connection = require('../config/db');

const ROOM_OPTIONS = [
  {
    key: 'deluxe',
    name: 'Deluxe Den',
    dimensions: '1.5m x 1.5m',
    area: '~25 sqft',
    suitableFor: 'Small-Medium size',
    nightlyRateCents: 8800
  },
  {
    key: 'premier',
    name: 'Premier Den',
    dimensions: '1.8m x 1.5m',
    area: '~30 sqft',
    suitableFor: 'Medium-Large size',
    nightlyRateCents: 10800
  }
];

const TIME_SLOTS = [];
for (let hour = 8; hour <= 20; hour += 1) {
  for (const minute of [0, 30]) {
    if (hour === 20 && minute === 30) continue;
    const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const displayHour = hour % 12 || 12;
    const period = hour < 12 ? 'AM' : 'PM';
    TIME_SLOTS.push({
      value,
      label: `${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`
    });
  }
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getNights(checkInDate, pickUpDate) {
  const checkIn = Date.parse(`${checkInDate}T00:00:00.000Z`);
  const pickUp = Date.parse(`${pickUpDate}T00:00:00.000Z`);
  return (pickUp - checkIn) / 86400000;
}

function getRoom(roomKey) {
  return ROOM_OPTIONS.find((room) => room.key === roomKey);
}

function getTodayString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getBoardingBookingsByOwner(ownerId, callback) {
  const sql = `
    SELECT
      bb.id AS booking_id,
      bb.booking_reference,
      'Pet Boarding' AS booking_type,
      DATE_FORMAT(bb.check_in_date, '%Y-%m-%d') AS check_in_date,
      DATE_FORMAT(bb.check_in_time, '%H:%i') AS check_in_time,
      DATE_FORMAT(bb.pick_up_date, '%Y-%m-%d') AS pick_up_date,
      DATE_FORMAT(bb.pick_up_time, '%H:%i') AS pick_up_time,
      bb.number_of_nights,
      bb.price_per_night,
      bb.total_price,
      bb.room_type,
      bb.booking_status,
      p.name AS pet_name,
      bb.created_at
    FROM boarding_bookings bb
    JOIN pets p ON p.id = bb.pet_id AND p.owner_id = bb.user_id
    WHERE bb.user_id = ?
    ORDER BY bb.created_at DESC, bb.id DESC
  `;
  connection.query(sql, [ownerId], callback);
}

function getBoardingBookingByReference(ownerId, bookingReference, callback) {
  const sql = `
    SELECT
      bb.id AS booking_id,
      bb.booking_reference,
      'Pet Boarding' AS booking_type,
      DATE_FORMAT(bb.check_in_date, '%Y-%m-%d') AS check_in_date,
      DATE_FORMAT(bb.check_in_time, '%H:%i') AS check_in_time,
      DATE_FORMAT(bb.pick_up_date, '%Y-%m-%d') AS pick_up_date,
      DATE_FORMAT(bb.pick_up_time, '%H:%i') AS pick_up_time,
      bb.number_of_nights,
      bb.price_per_night,
      bb.total_price,
      bb.room_type,
      bb.booking_status,
      p.name AS pet_name,
      bb.created_at
    FROM boarding_bookings bb
    JOIN pets p ON p.id = bb.pet_id AND p.owner_id = bb.user_id
    WHERE bb.user_id = ? AND bb.booking_reference = ?
    LIMIT 1
  `;
  connection.query(sql, [ownerId, bookingReference], callback);
}

function getBoardingBookingByIdAndOwner(ownerId, bookingId, callback) {
  const sql = `
    SELECT
      bb.id AS booking_id,
      bb.pet_id,
      bb.booking_reference,
      DATE_FORMAT(bb.check_in_date, '%Y-%m-%d') AS check_in_date,
      DATE_FORMAT(bb.check_in_time, '%H:%i') AS check_in_time,
      DATE_FORMAT(bb.pick_up_date, '%Y-%m-%d') AS pick_up_date,
      DATE_FORMAT(bb.pick_up_time, '%H:%i') AS pick_up_time,
      bb.number_of_nights,
      bb.price_per_night,
      bb.total_price,
      bb.room_type,
      bb.booking_status
    FROM boarding_bookings bb
    JOIN pets p ON p.id = bb.pet_id AND p.owner_id = bb.user_id
    WHERE bb.user_id = ? AND bb.id = ?
    LIMIT 1
  `;
  connection.query(sql, [ownerId, bookingId], callback);
}

function updateBoardingBooking(ownerId, bookingId, booking, callback) {
  const room = getRoom(booking.roomKey);
  const petId = Number(booking.petId);
  if (!room
    || !Number.isInteger(petId)
    || petId < 1
    || !isValidDateString(booking.checkInDate)
    || !isValidDateString(booking.pickUpDate)
    || booking.pickUpDate <= booking.checkInDate
    || !TIME_SLOTS.some((slot) => slot.value === booking.checkInTime)
    || !TIME_SLOTS.some((slot) => slot.value === booking.pickUpTime)) {
    return callback(null, null);
  }

  const numberOfNights = getNights(booking.checkInDate, booking.pickUpDate);
  if (!Number.isInteger(numberOfNights) || numberOfNights < 1) {
    return callback(null, null);
  }

  const bookingSql = 'SELECT id FROM boarding_bookings WHERE id = ? AND user_id = ? LIMIT 1';
  connection.query(bookingSql, [bookingId, ownerId], (bookingError, bookingRows) => {
    if (bookingError) return callback(bookingError);
    if (!bookingRows || !bookingRows.length) return callback(null, null);

    const petSql = 'SELECT id FROM pets WHERE id = ? AND owner_id = ? LIMIT 1';
    connection.query(petSql, [petId, ownerId], (petError, petRows) => {
      if (petError) return callback(petError);
      if (!petRows || !petRows.length) return callback(null, { invalid: true });

      const pricePerNight = (room.nightlyRateCents / 100).toFixed(2);
      const totalPrice = ((room.nightlyRateCents * numberOfNights) / 100).toFixed(2);
      const updateSql = `
        UPDATE boarding_bookings
        SET pet_id = ?, room_type = ?, check_in_date = ?, check_in_time = ?,
            pick_up_date = ?, pick_up_time = ?, number_of_nights = ?,
            price_per_night = ?, total_price = ?
        WHERE id = ? AND user_id = ?
      `;
      const values = [
        petId,
        room.name,
        booking.checkInDate,
        `${booking.checkInTime}:00`,
        booking.pickUpDate,
        `${booking.pickUpTime}:00`,
        numberOfNights,
        pricePerNight,
        totalPrice,
        bookingId,
        ownerId
      ];
      connection.query(updateSql, values, (updateError) => {
        if (updateError) return callback(updateError);
        callback(null, { success: true });
      });
    });
  });
}

function deleteBoardingBooking(ownerId, bookingId, callback) {
  const sql = 'DELETE FROM boarding_bookings WHERE id = ? AND user_id = ?';
  connection.query(sql, [bookingId, ownerId], callback);
}

function createPendingBooking(ownerId, booking, callback) {
  const room = getRoom(booking.roomKey);
  if (!room
    || !Number.isInteger(Number(booking.petId))
    || Number(booking.petId) < 1
    || !isValidDateString(booking.checkInDate)
    || !isValidDateString(booking.pickUpDate)
    || booking.checkInDate < getTodayString()
    || booking.pickUpDate <= booking.checkInDate
    || !TIME_SLOTS.some((slot) => slot.value === booking.checkInTime)
    || !TIME_SLOTS.some((slot) => slot.value === booking.pickUpTime)
    || typeof booking.submissionToken !== 'string'
    || !/^[a-f0-9]{48}$/i.test(booking.submissionToken)) {
    return callback(null, null);
  }

  const numberOfNights = getNights(booking.checkInDate, booking.pickUpDate);
  if (!Number.isInteger(numberOfNights) || numberOfNights < 1) {
    return callback(null, null);
  }

  const pricePerNight = (room.nightlyRateCents / 100).toFixed(2);
  const totalPrice = ((room.nightlyRateCents * numberOfNights) / 100).toFixed(2);
  const bookingReference = `FTB-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;

  connection.beginTransaction((transactionError) => {
    if (transactionError) return callback(transactionError);

    const existingSql = `
      SELECT id AS booking_id, booking_reference
      FROM boarding_bookings
      WHERE user_id = ? AND submission_token = ?
      LIMIT 1
    `;
    connection.query(existingSql, [ownerId, booking.submissionToken], (existingError, existingRows) => {
      if (existingError) {
        return connection.rollback(() => callback(existingError));
      }

      if (existingRows && existingRows.length) {
        return connection.rollback(() => callback(null, existingRows[0]));
      }

      const petSql = 'SELECT id FROM pets WHERE id = ? AND owner_id = ? LIMIT 1';
      connection.query(petSql, [Number(booking.petId), ownerId], (petError, petRows) => {
        if (petError) {
          return connection.rollback(() => callback(petError));
        }

        if (!petRows || !petRows.length) {
          return connection.rollback(() => callback(null, null));
        }

        const insertSql = `
          INSERT INTO boarding_bookings (
            booking_reference, submission_token, user_id, pet_id, room_type,
            check_in_date, check_in_time, pick_up_date, pick_up_time,
            number_of_nights, price_per_night, total_price, booking_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `;
        const values = [
          bookingReference,
          booking.submissionToken,
          ownerId,
          Number(booking.petId),
          room.name,
          booking.checkInDate,
          `${booking.checkInTime}:00`,
          booking.pickUpDate,
          `${booking.pickUpTime}:00`,
          numberOfNights,
          pricePerNight,
          totalPrice
        ];

        connection.query(insertSql, values, (insertError, result) => {
          if (insertError) {
            return connection.rollback(() => {
              if (insertError.code === 'ER_DUP_ENTRY') {
                connection.query(existingSql, [ownerId, booking.submissionToken], (duplicateError, duplicateRows) => {
                  if (duplicateError) return callback(duplicateError);
                  if (duplicateRows && duplicateRows.length) return callback(null, duplicateRows[0]);
                  return callback(insertError);
                });
              } else {
                callback(insertError);
              }
            });
          }

          connection.commit((commitError) => {
            if (commitError) {
              return connection.rollback(() => callback(commitError));
            }

            callback(null, {
              booking_id: result.insertId,
              booking_reference: bookingReference
            });
          });
        });
      });
    });
  });
}

module.exports = {
  ROOM_OPTIONS,
  TIME_SLOTS,
  createPendingBooking,
  getBoardingBookingsByOwner,
  getBoardingBookingByReference,
  getBoardingBookingByIdAndOwner,
  updateBoardingBooking,
  deleteBoardingBooking,
  isValidDateString,
  getNights,
  getTodayString
};
