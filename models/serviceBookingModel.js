const connection = require('../config/db');

function createPendingBooking(ownerId, petId, serviceId, bookingDate, callback) {
  const petSql = 'SELECT id, owner_id FROM pets WHERE id = ? LIMIT 1';
  const serviceSql = 'SELECT id, price FROM services WHERE id = ? AND is_active = 1 LIMIT 1';

  connection.beginTransaction((txErr) => {
    if (txErr) {
      return callback(txErr);
    }

    connection.query(petSql, [petId], (petErr, petRows) => {
      if (petErr) {
        return connection.rollback(() => callback(petErr));
      }

      if (!petRows || petRows.length === 0 || Number(petRows[0].owner_id) !== Number(ownerId)) {
        return connection.rollback(() => callback(null, null));
      }

      connection.query(serviceSql, [serviceId], (serviceErr, serviceRows) => {
        if (serviceErr) {
          return connection.rollback(() => callback(serviceErr));
        }

        if (!serviceRows || serviceRows.length === 0) {
          return connection.rollback(() => callback(null, null));
        }

        const bookedPrice = serviceRows[0].price;
        const insertBookingSql = 'INSERT INTO service_bookings (pet_id, service_id, booking_status, booked_price, booking_date) VALUES (?, ?, ?, ?, ?)';

        connection.query(insertBookingSql, [petId, serviceId, 'pending', bookedPrice, bookingDate], (bookingErr, bookingResult) => {
          if (bookingErr) {
            return connection.rollback(() => callback(bookingErr));
          }

          const bookingId = bookingResult && bookingResult.insertId;
          const insertPaymentSql = 'INSERT INTO payments (booking_id, amount, payment_status) VALUES (?, ?, ?)';

          connection.query(insertPaymentSql, [bookingId, bookedPrice, 'pending'], (paymentErr, paymentResult) => {
            if (paymentErr) {
              return connection.rollback(() => callback(paymentErr));
            }

            connection.commit((commitErr) => {
              if (commitErr) {
                return connection.rollback(() => callback(commitErr));
              }

              callback(null, {
                bookingId,
                paymentId: paymentResult && paymentResult.insertId
              });
            });
          });
        });
      });
    });
  });
}

function getBookingsByOwner(ownerId, callback) {
  const sql = `
    SELECT
      sb.id AS booking_id,
      sb.pet_id,
      sb.service_id,
      DATE_FORMAT(sb.booking_date, '%Y-%m-%d') AS booking_date,
      p.name AS pet_name,
      s.name AS service_name,
      sb.booked_price,
      sb.booking_status,
      pay.payment_status,
      'Pet Service' AS booking_type,
      sb.created_at
    FROM service_bookings sb
    JOIN pets p ON p.id = sb.pet_id
    JOIN services s ON s.id = sb.service_id
    LEFT JOIN payments pay ON pay.booking_id = sb.id
    WHERE p.owner_id = ?
    ORDER BY sb.created_at DESC, sb.id DESC
  `;
  connection.query(sql, [ownerId], callback);
}

function getBookingByIdAndOwner(ownerId, bookingId, callback) {
  const sql = `
    SELECT
      sb.id AS booking_id,
      sb.pet_id,
      sb.service_id,
      DATE_FORMAT(sb.booking_date, '%Y-%m-%d') AS booking_date,
      sb.booked_price,
      p.name AS pet_name,
      s.name AS service_name
    FROM service_bookings sb
    JOIN pets p ON p.id = sb.pet_id
    JOIN services s ON s.id = sb.service_id
    WHERE sb.id = ? AND p.owner_id = ?
    LIMIT 1
  `;
  connection.query(sql, [bookingId, ownerId], callback);
}

function updateBooking(ownerId, bookingId, booking, callback) {
  connection.beginTransaction((transactionError) => {
    if (transactionError) return callback(transactionError);

    const bookingSql = `
      SELECT sb.id
      FROM service_bookings sb
      JOIN pets p ON p.id = sb.pet_id
      WHERE sb.id = ? AND p.owner_id = ?
      LIMIT 1
    `;
    connection.query(bookingSql, [bookingId, ownerId], (bookingError, bookingRows) => {
      if (bookingError) {
        return connection.rollback(() => callback(bookingError));
      }

      if (!bookingRows || !bookingRows.length) {
        return connection.rollback(() => callback(null, null));
      }

      const petSql = 'SELECT id FROM pets WHERE id = ? AND owner_id = ? LIMIT 1';
      connection.query(petSql, [booking.petId, ownerId], (petError, petRows) => {
        if (petError) {
          return connection.rollback(() => callback(petError));
        }

        const serviceSql = 'SELECT price FROM services WHERE id = ? LIMIT 1';
        connection.query(serviceSql, [booking.serviceId], (serviceError, serviceRows) => {
          if (serviceError) {
            return connection.rollback(() => callback(serviceError));
          }

          if (!petRows || !petRows.length || !serviceRows || !serviceRows.length) {
            return connection.rollback(() => callback(null, { invalid: true }));
          }

          const price = serviceRows[0].price;
          const updateSql = `
            UPDATE service_bookings
            SET pet_id = ?, service_id = ?, booking_date = ?, booked_price = ?
            WHERE id = ?
          `;
          connection.query(
            updateSql,
            [booking.petId, booking.serviceId, booking.bookingDate, price, bookingId],
            (updateError) => {
              if (updateError) {
                return connection.rollback(() => callback(updateError));
              }

              const paymentSql = `
                UPDATE payments
                SET amount = ?
                WHERE booking_id = ? AND payment_status = 'pending'
              `;
              connection.query(paymentSql, [price, bookingId], (paymentError) => {
                if (paymentError) {
                  return connection.rollback(() => callback(paymentError));
                }

                connection.commit((commitError) => {
                  if (commitError) {
                    return connection.rollback(() => callback(commitError));
                  }
                  callback(null, { success: true });
                });
              });
            }
          );
        });
      });
    });
  });
}

function deleteBooking(ownerId, bookingId, callback) {
  const sql = `
    DELETE sb
    FROM service_bookings sb
    JOIN pets p ON p.id = sb.pet_id
    WHERE sb.id = ? AND p.owner_id = ?
  `;
  connection.query(sql, [bookingId, ownerId], callback);
}

module.exports = {
  createPendingBooking,
  getBookingsByOwner,
  getBookingByIdAndOwner,
  updateBooking,
  deleteBooking
};
