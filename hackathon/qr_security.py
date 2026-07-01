# Anti-Fraud Class Attendance System: Secure Dynamic 15-Second QR Generator & Validator
# Language: Python 3
# Security Features: SHA-256 HMAC, Time-Based Token Sync, Drift Tolerance, Replay Attack Protection (Nonce Tracking)

import hmac
import hashlib
import time
import secrets
import json

class QRTimeSyncManager:
    """
    Manages the generation and validation of secure, time-synced QR code tokens.
    Designed for a highly-competitive environment to eliminate proxy scanning.
    """
    
    INTERVAL_SECONDS = 15
    DRIFT_TOLERANCE = 1  # ±1 interval (15s tolerance) to handle network delay & clock drift
    
    def __init__(self, server_secret_key: str):
        """
        :param server_secret_key: High-entropy system secret used as a base salt
        """
        self.server_secret_key = server_secret_key.encode('utf-8')
        
    def _get_time_window(self, timestamp: float = None) -> int:
        """
        Calculates the unique time window counter.
        Divides Unix timestamp into discrete 15-second buckets.
        """
        t = timestamp if timestamp is not None else time.time()
        return int(t) // self.INTERVAL_SECONDS

    def generate_qr_payload(self, session_id: str, session_secret: str) -> str:
        """
        Generates a secure, cryptographically signed QR payload valid for the current 15s window.
        
        :param session_id: The ID of the current lecture session
        :param session_secret: A session-specific key stored in the database
        :return: JSON string payload containing session details, timestamp, nonce, and HMAC token
        """
        now = time.time()
        timestamp_sec = int(now)
        time_window = self._get_time_window(now)
        
        # Nonce to prevent duplicate signatures within the exact same second
        nonce = secrets.token_hex(8)
        
        # Combine parameters to sign
        # Adding the time_window ensures the token changes exactly every 15 seconds
        message = f"{session_id}:{timestamp_sec}:{nonce}:{time_window}".encode('utf-8')
        
        # Generate HMAC-SHA256 using the combination of server_secret and session_secret as key
        key = hmac.new(self.server_secret_key, session_secret.encode('utf-8'), hashlib.sha256).digest()
        token = hmac.new(key, message, hashlib.sha256).hexdigest()
        
        payload = {
            "session_id": session_id,
            "timestamp": timestamp_sec,
            "nonce": nonce,
            "token": token
        }
        
        return json.dumps(payload)

    def validate_qr_payload(self, scanned_payload_json: str, session_secret: str, registered_nonces: set) -> tuple:
        """
        Validates the scanned QR payload against the current server time and check bounds.
        
        :param scanned_payload_json: The raw QR code JSON scanned by the student
        :param session_secret: The lecturer session secret key retrieved from DB
        :param registered_nonces: Cache/Database set of already-used nonces to prevent replay attacks
        :return: (bool, str) - Success status and diagnostic message
        """
        try:
            payload = json.loads(scanned_payload_json)
            session_id = payload.get("session_id")
            timestamp_sec = int(payload.get("timestamp"))
            nonce = payload.get("nonce")
            scanned_token = payload.get("token")
        except (ValueError, TypeError, KeyError, json.JSONDecodeError):
            return False, "Invalid QR payload format."
            
        if not all([session_id, timestamp_sec, nonce, scanned_token]):
            return False, "Missing required fields in QR payload."
            
        current_time = time.time()
        
        # 1. Replay Attack Protection: Check if the unique nonce has already been consumed
        nonce_signature = f"{session_id}:{nonce}"
        if nonce_signature in registered_nonces:
            return False, "Replay attack detected! This dynamic QR code instance has already been used."
            
        # 2. Strict Expiry Check (Absolute maximum threshold)
        # Prevents students from scanning a QR code, taking their time, and checking in minutes later
        if abs(current_time - timestamp_sec) > (self.INTERVAL_SECONDS * (self.DRIFT_TOLERANCE + 1)):
            return False, "QR code has expired. Please scan the newly generated QR code."
            
        # 3. Cryptographic Signature Match (Validating against time-buckets)
        # We check the current bucket, and adjacent buckets (for clock drift)
        current_window = self._get_time_window(current_time)
        key = hmac.new(self.server_secret_key, session_secret.encode('utf-8'), hashlib.sha256).digest()
        
        is_token_valid = False
        # Checking window, window - 1, and window + 1
        for drift in range(-self.DRIFT_TOLERANCE, self.DRIFT_TOLERANCE + 1):
            target_window = current_window + drift
            
            # Reconstruct the expected message signed in the generator
            expected_msg = f"{session_id}:{timestamp_sec}:{nonce}:{target_window}".encode('utf-8')
            expected_token = hmac.new(key, expected_msg, hashlib.sha256).hexdigest()
            
            # Constant-time comparison to prevent timing side-channel attacks
            if hmac.compare_digest(expected_token, scanned_token):
                is_token_valid = True
                break
                
        if not is_token_valid:
            return False, "Cryptographic signature mismatch. Possible fraudulent/spoofed QR generator."
            
        # Successfully validated!
        # Caller MUST add the `nonce_signature` to their registered nonces database/cache to block future replays.
        return True, "QR payload verified successfully."

# Example usage for testing:
if __name__ == "__main__":
    # Test Setup
    SYSTEM_SECRET = "super_secret_system_level_pepper_key_123456"
    SESSION_ID = "LECTURE_MATH_101"
    SESSION_SECRET = "random_session_specific_salt_987654321"
    
    manager = QRTimeSyncManager(SYSTEM_SECRET)
    
    # Generate dynamic payload on lecturer screen
    payload = manager.generate_qr_payload(SESSION_ID, SESSION_SECRET)
    print("Generated Dynamic QR Payload:\n", payload)
    
    # Simulated database cache for spent nonces (in production this would be Redis or DB Table)
    used_nonces = set()
    
    # 1. Check valid scan immediately
    success, msg = manager.validate_qr_payload(payload, SESSION_SECRET, used_nonces)
    print(f"\nScan 1 (Immediate): Success={success}, Message='{msg}'")
    
    # Simulate spending the nonce on successful validation
    parsed = json.loads(payload)
    used_nonces.add(f"{SESSION_ID}:{parsed['nonce']}")
    
    # 2. Check replay attack
    success, msg = manager.validate_qr_payload(payload, SESSION_SECRET, used_nonces)
    print(f"Scan 2 (Replay Attempt): Success={success}, Message='{msg}'")
    
    # 3. Simulate clock drift / expired code (after 30 seconds)
    print("\nSimulating 30-second delay (expiry test)...")
    # Generating payload with a manual backdated timestamp
    backdated_now = time.time() - 30
    backdated_timestamp = int(backdated_now)
    backdated_window = manager._get_time_window(backdated_now)
    backdated_nonce = "stale_nonce_123"
    
    backdated_msg = f"{SESSION_ID}:{backdated_timestamp}:{backdated_nonce}:{backdated_window}".encode('utf-8')
    key = hmac.new(SYSTEM_SECRET.encode('utf-8'), SESSION_SECRET.encode('utf-8'), hashlib.sha256).digest()
    backdated_token = hmac.new(key, backdated_msg, hashlib.sha256).hexdigest()
    
    stale_payload = json.dumps({
        "session_id": SESSION_ID,
        "timestamp": backdated_timestamp,
        "nonce": backdated_nonce,
        "token": backdated_token
    })
    
    success, msg = manager.validate_qr_payload(stale_payload, SESSION_SECRET, used_nonces)
    print(f"Scan 3 (30s Backdated Stale QR): Success={success}, Message='{msg}'")
