-- Additive Pet Boarding booking schema.
-- Review this script and verify the table does not already exist before running.
-- This file is intentionally not executed by the application.
USE petcare;

CREATE TABLE boarding_bookings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_reference VARCHAR(32) NOT NULL UNIQUE,
  submission_token CHAR(48) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  pet_id INT UNSIGNED NOT NULL,
  room_type VARCHAR(50) NOT NULL,
  check_in_date DATE NOT NULL,
  check_in_time TIME NOT NULL,
  pick_up_date DATE NOT NULL,
  pick_up_time TIME NOT NULL,
  number_of_nights SMALLINT UNSIGNED NOT NULL,
  price_per_night DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  booking_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_boarding_bookings_submission (user_id, submission_token),
  INDEX idx_boarding_bookings_user_created (user_id, created_at),
  INDEX idx_boarding_bookings_pet_id (pet_id),
  CONSTRAINT fk_boarding_bookings_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_boarding_bookings_pet
    FOREIGN KEY (pet_id) REFERENCES pets(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;
