/**
 * Anti-Fraud Class Attendance System: Secure Dynamic 15-Second QR Generator & Validator
 * Language: JavaScript (Node.js/ESM Compatible)
 * Security Features: SHA-256 HMAC, Time-Based Token Sync, Drift Tolerance, Replay Attack Protection (Nonce Tracking)
 */

import crypto from 'crypto';

export class QRTimeSyncManager {
  /**
   * @param {string} serverSecretKey - High-entropy system secret used as a base salt
   */
  constructor(serverSecretKey) {
    this.serverSecretKey = Buffer.from(serverSecretKey, 'utf-8');
    this.INTERVAL_SECONDS = 15;
    this.DRIFT_TOLERANCE = 1; // ±1 interval (15s tolerance)
  }

  /**
   * Calculates the unique time window counter.
   * Divides Unix timestamp into discrete 15-second buckets.
   * @param {number} [timestamp] - Current timestamp in seconds
   * @returns {number}
   */
  _getTimeWindow(timestamp) {
    const t = timestamp !== undefined ? timestamp : Date.now() / 1000;
    return Math.floor(t / this.INTERVAL_SECONDS);
  }

  /**
   * Generates a secure, cryptographically signed QR payload valid for the current 15s window.
   * @param {string} sessionId - The lecture session ID
   * @param {string} sessionSecret - Session specific key from the database
   * @returns {string} JSON string of the QR payload
   */
  generateQRPayload(sessionId, sessionSecret) {
    const now = Date.now() / 1000;
    const timestampSec = Math.floor(now);
    const timeWindow = this._getTimeWindow(now);
    
    // Generate a random 16-character hex nonce
    const nonce = crypto.randomBytes(8).toString('hex');
    
    // Construct signing message
    const message = `${sessionId}:${timestampSec}:${nonce}:${timeWindow}`;
    
    // Derive Key: HMAC-SHA256 of sessionSecret using system serverSecretKey
    const key = crypto.createHmac('sha256', this.serverSecretKey)
                      .update(sessionSecret, 'utf-8')
                      .digest();
                      
    // Compute Token: HMAC-SHA256 of message using derived key
    const token = crypto.createHmac('sha256', key)
                        .update(message, 'utf-8')
                        .digest('hex');
                        
    return JSON.stringify({
      session_id: sessionId,
      timestamp: timestampSec,
      nonce: nonce,
      token: token
    });
  }

  /**
   * Validates the scanned QR payload against the current server time and check bounds.
   * @param {string} scannedPayloadJson - Scanned payload string
   * @param {string} sessionSecret - Session specific key from the database
   * @param {Set<string>} registeredNonces - Set of already-used nonces ("session_id:nonce")
   * @returns {{success: boolean, message: string}}
   */
  validateQRPayload(scannedPayloadJson, sessionSecret, registeredNonces) {
    try {
      const payload = JSON.parse(scannedPayloadJson);
      const sessionId = payload.session_id;
      const timestampSec = parseInt(payload.timestamp, 10);
      const nonce = payload.nonce;
      const scannedToken = payload.token;

      if (!sessionId || !timestampSec || !nonce || !scannedToken) {
        return { success: false, message: "Missing required fields in QR payload." };
      }

      const now = Date.now() / 1000;

      // 1. Replay Protection: Check if this nonce has been consumed
      const nonceSignature = `${sessionId}:${nonce}`;
      if (registeredNonces.has(nonceSignature)) {
        return { success: false, message: "Replay attack detected! This dynamic QR code has already been used." };
      }

      // 2. Expiry Check (Check overall timing sanity)
      if (Math.abs(now - timestampSec) > (this.INTERVAL_SECONDS * (this.DRIFT_TOLERANCE + 1))) {
        return { success: false, message: "QR code has expired. Please scan the newly generated QR code." };
      }

      // 3. Cryptographic Signature Match
      const currentWindow = this._getTimeWindow(now);
      const key = crypto.createHmac('sha256', this.serverSecretKey)
                        .update(sessionSecret, 'utf-8')
                        .digest();

      let isTokenValid = false;

      // Check current window and adjacent windows to handle clock drift
      for (let drift = -this.DRIFT_TOLERANCE; drift <= this.DRIFT_TOLERANCE; drift++) {
        const targetWindow = currentWindow + drift;
        const expectedMsg = `${sessionId}:${timestampSec}:${nonce}:${targetWindow}`;
        
        const expectedToken = crypto.createHmac('sha256', key)
                                    .update(expectedMsg, 'utf-8')
                                    .digest('hex');

        // Secure, constant-time comparison to prevent timing attacks
        if (crypto.timingSafeEqual(Buffer.from(expectedToken, 'hex'), Buffer.from(scannedToken, 'hex'))) {
          isTokenValid = true;
          break;
        }
      }

      if (!isTokenValid) {
        return { success: false, message: "Cryptographic signature mismatch. Possible fraudulent QR spoof." };
      }

      return { success: true, message: "QR payload verified successfully." };

    } catch (err) {
      return { success: false, message: `Failed to parse or validate QR payload: ${err.message}` };
    }
  }
}
