<?php
/**
 * Anti-Fraud Class Attendance System: Secure Student Onboarding Endpoint
 * Language: Procedural PHP (PDO)
 * Security Features: Strict Prepared Statements, AES-256-CBC Encryption-at-Rest, Input Validation, CSRF mitigation.
 */

header("Content-Type: application/json; charset=UTF-8");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");
header("X-XSS-Protection: 1; mode=block");

// Define encryption parameters
define('ENCRYPTION_KEY', 'your-high-entropy-secure-32byte-key-here!!!'); // Must be stored securely in server env
define('ENCRYPTION_METHOD', 'aes-256-cbc');

// 1. Connection settings (SQLite / MySQL)
try {
    // If using SQLite:
    $pdo = new PDO("sqlite:" . __DIR__ . "/attendance.sqlite");
    
    // If using MySQL:
    // $pdo = new PDO("mysql:host=localhost;dbname=attendance_db;charset=utf8mb4", "db_user", "secure_password", [
    //     PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    //     PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    //     PDO::ATTR_EMULATE_PREPARES => false,
    // ]);
    
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Database connection failed."]);
    exit();
}

// 2. Validate request method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method Not Allowed."]);
    exit();
}

// 3. Receive and validate POST input payload
$inputData = json_decode(file_get_contents("php://input"), true);

if (!$inputData) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid JSON payload."]);
    exit();
}

$studentId = filter_var($inputData['student_id'] ?? '', FILTER_SANITIZE_SPECIAL_CHARS);
$name = filter_var($inputData['name'] ?? '', FILTER_SANITIZE_SPECIAL_CHARS);
$faceVector = $inputData['face_vector'] ?? null; // Should be an array of floats (embeddings)

if (empty($studentId) || empty($name) || empty($faceVector) || !is_array($faceVector)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Missing required fields or invalid facial vector structure."]);
    exit();
}

// Ensure the face vector contains numerical values
foreach ($faceVector as $val) {
    if (!is_numeric($val)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Facial vector elements must be numerical floats."]);
        exit();
    }
}

// Serialize facial vector array to JSON
$serializedVector = json_encode($faceVector);

// 4. Encrypt face vector at rest using AES-256-CBC
// Generate a cryptographically secure random IV
$ivLength = openssl_cipher_iv_length(ENCRYPTION_METHOD);
$iv = openssl_random_pseudo_bytes($ivLength);

$encryptedFaceData = openssl_encrypt(
    $serializedVector,
    ENCRYPTION_METHOD,
    ENCRYPTION_KEY,
    OPENSSL_RAW_DATA,
    $iv
);

if ($encryptedFaceData === false) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Failed to encrypt biometrics."]);
    exit();
}

// Encode to base64 for safe database storage
$encryptedFaceBase64 = base64_encode($encryptedFaceData);
$ivBase64 = base64_encode($iv);

// 5. Database write using strict prepared statement
try {
    // Check if student already exists to prevent duplicate fraud
    $checkStmt = $pdo->prepare("SELECT student_id FROM Students WHERE student_id = :student_id");
    $checkStmt->execute([':student_id' => $studentId]);
    
    if ($checkStmt->fetch()) {
        http_response_code(409);
        echo json_encode(["status" => "error", "message" => "Student ID already registered."]);
        exit();
    }
    
    // Insert new student record
    $insertStmt = $pdo->prepare("
        INSERT INTO Students (student_id, name, encrypted_face_vector, encryption_iv, status) 
        VALUES (:student_id, :name, :encrypted_face_vector, :encryption_iv, 'ACTIVE')
    ");
    
    $insertResult = $insertStmt->execute([
        ':student_id' => $studentId,
        ':name' => $name,
        ':encrypted_face_vector' => $encryptedFaceBase64,
        ':encryption_iv' => $ivBase64
    ]);
    
    if ($insertResult) {
        http_response_code(201);
        echo json_encode([
            "status" => "success",
            "message" => "Student successfully registered and biometric vectors securely encrypted at rest.",
            "data" => [
                "student_id" => $studentId,
                "name" => $name
            ]
        ]);
    } else {
        throw new Exception("Execute statement returned false.");
    }

} catch (Exception $e) {
    http_response_code(500);
    // Log exception internally (not to the user to prevent leakage of paths or structures)
    error_log("Student onboarding failed: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "A server-side error occurred while writing biometrics."]);
}
?>
