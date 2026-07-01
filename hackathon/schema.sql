-- Anti-Fraud Class Attendance System: Relational Schema (MySQL / SQLite)
-- Prepared by Senior Full-Stack Developer & Security Architect

-- 1. Students Table
-- Stores student metadata and encrypted facial feature vectors.
CREATE TABLE IF NOT EXISTS Students (
    student_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    -- Encrypted facial feature vector (stored as encrypted JSON or binary blob)
    -- Encrypted at rest using AES-256-CBC
    encrypted_face_vector TEXT NOT NULL,
    encryption_iv VARCHAR(32) NOT NULL, -- Initialization Vector for AES
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);

-- 2. Sessions Table
-- Stores lecturer-created attendance sessions with active geofencing boundaries and TOTP secrets.
CREATE TABLE IF NOT EXISTS Sessions (
    session_id VARCHAR(50) PRIMARY KEY,
    lecturer_id VARCHAR(50) NOT NULL,
    course_name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL, -- Geofencing Center Latitude
    longitude DECIMAL(11, 8) NOT NULL, -- Geofencing Center Longitude
    radius_meters INT NOT NULL DEFAULT 15, -- Acceptable geofencing radius (e.g., 15m)
    qr_secret_key VARCHAR(64) NOT NULL, -- Unique HMAC/TOTP secret for dynamic QR sync
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active TINYINT(1) DEFAULT 1
);

-- 3. Attendance Logs Table
-- Logs successful attendance check-ins with verification parameters.
CREATE TABLE IF NOT EXISTS Attendance_Logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL,
    session_id VARCHAR(50) NOT NULL,
    checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    gps_latitude DECIMAL(10, 8) NOT NULL,
    gps_longitude DECIMAL(11, 8) NOT NULL,
    distance_meters DECIMAL(6, 2) NOT NULL, -- Calculated distance from geofence center
    prompted_emotion VARCHAR(20) NOT NULL, -- The randomly prompted liveness emotion (e.g., 'SMILE')
    liveness_verified TINYINT(1) DEFAULT 1,
    device_fingerprint VARCHAR(256) DEFAULT NULL, -- SHA-256 hash of browser/device characteristics to prevent multi-device proxying
    FOREIGN KEY (student_id) REFERENCES Students(student_id),
    FOREIGN KEY (session_id) REFERENCES Sessions(session_id),
    UNIQUE KEY uq_student_session (student_id, session_id) -- Prevents double logging
);

-- 4. Fraud Logs Table
-- Captures detailed records of failed check-in attempts to identify proxy check-ins, spoofing, or geofence breaches.
CREATE TABLE IF NOT EXISTS Fraud_Logs (
    fraud_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(50) DEFAULT NULL, -- May be null if student fails onboarding/lookup
    session_id VARCHAR(50) DEFAULT NULL,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fraud_type VARCHAR(50) NOT NULL, -- 'EXPIRED_QR', 'GPS_OUT_OF_BOUNDS', 'LIVENESS_FAILURE', 'REPLAY_ATTACK', 'DEVICE_SHARING'
    gps_latitude DECIMAL(10, 8) DEFAULT NULL,
    gps_longitude DECIMAL(11, 8) DEFAULT NULL,
    distance_meters DECIMAL(6, 2) DEFAULT NULL,
    face_similarity_score DECIMAL(5, 4) DEFAULT NULL,
    device_fingerprint VARCHAR(256) DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    raw_payload_dump TEXT DEFAULT NULL -- Dump of the request payload for forensic analysis
);
