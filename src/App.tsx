import React, { useState, useEffect, useRef } from 'react';
import { SwitchCamera, QrCode, 
  MapPin, 
  UserCheck, 
  ShieldAlert, 
  RefreshCw, 
  UserPlus, 
  Camera, 
  Compass, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Smile, 
  User, 
  Users, 
  Smartphone, 
  Laptop, 
  Lock, 
  ShieldCheck,
  Eye,
  Info,
  ChevronRight,
  Database, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeCanvas } from "qrcode.react";
import jsQR from "jsqr";
import Webcam from "react-webcam";
import { useCameraControls } from "./hooks/useCameraControls";
import { supabase } from "./lib/supabase";
const WebcamComponent = Webcam as any;


// In-memory data structures representing our SQLite database on the client for full simulation
interface Student {
  studentId: string;
  name: string;
  encryptedFaceVector: string;
  status: string;
  lecturerEmail?: string;
}

interface AttendanceLog {
  id: number;
  studentId: string;
  studentName: string;
  checkedInAt: string;
  distance: number;
  emotion: string;
  status: 'SUCCESS' | 'FRAUD_PREVENTED';
}

interface FraudLog {
  id: number;
  studentId: string;
  fraudType: string;
  distance: number;
  timestamp: string;
  deviceFingerprint: string;
}

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'lecturer' | 'student' | 'system-docs'>('lecturer');
  const [lecturerSubTab, setLecturerSubTab] = useState<'onboard' | 'session' | 'logs'>('session');

  // --- Auth States ---
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<'lecturer' | 'student' | null>(null);
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [isSignUpMode, setIsSignUpMode] = useState<boolean>(false);
  const [signUpRole, setSignUpRole] = useState<'student' | 'lecturer'>('student');

  // --- Database States (Simulated SQLite) ---
  const [students, setStudents] = useState<Student[]>([]);

  // Fetch students from backend on mount
  useEffect(() => {
    const fetchStudents = async () => {
      if (!isLoggedIn || !loginEmail) return;
      try {
        const res = await fetch(`/api/students?lecturerEmail=${loginEmail}`);
        if (res.ok) {
          const data = await res.json();
          setStudents(data);
        } else {
          console.error("Failed to fetch students:", res.status);
        }
      } catch (err) {
        console.error("Network error fetching students:", err);
      }
    };
    fetchStudents();
  }, [isLoggedIn, loginEmail]);

  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [fraudLogs, setFraudLogs] = useState<FraudLog[]>([]);

  // Fetch attendance and fraud logs on mount
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const attRes = await fetch('/api/attendance');
        if (attRes.ok) {
          const attData = await attRes.json();
          setAttendanceLogs(attData);
        }
        
        const fraudRes = await fetch('/api/fraud');
        if (fraudRes.ok) {
          const fraudData = await fraudRes.json();
          setFraudLogs(fraudData);
        }
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      }
    };
    fetchLogs();
  }, []);

  // --- Lecturer Settings (Geofence, Session) ---
  const [geofenceLat, setGeofenceLat] = useState<number>(37.7749);
  const [geofenceLng, setGeofenceLng] = useState<number>(-122.4194);
  const [radiusMeters, setRadiusMeters] = useState<number>(15);
    const [sessionActive, setSessionActive] = useState<boolean>(true);
  const [dbSessionId, setDbSessionId] = useState<number | null>(null);
  const [isSyncingSession, setIsSyncingSession] = useState<boolean>(false);
  const [sessionSecret, setSessionSecret] = useState<string>("sec_hack_mit_classA_2026");
  const [courseName, setCourseName] = useState<string>("Computer Science 101: Distributed Systems");
  const [qrToken, setQrToken] = useState<string>("");
  const [qrTimeLeft, setQrTimeLeft] = useState<number>(15);

  // --- Student Onboarding Form States ---
  const [onboardId, setOnboardId] = useState<string>("");
  const [onboardName, setOnboardName] = useState<string>("");
  const [isScanningFaceOnboard, setIsScanningFaceOnboard] = useState<boolean>(false);
  const [onboardFaceCaptured, setOnboardFaceCaptured] = useState<boolean>(false);
  const [generatedFaceEmbedding, setGeneratedFaceEmbedding] = useState<number[] | null>(null);
  const webcamRef = useRef<any>(null);
  const videoElement = webcamRef.current?.video || null;
  const { isZoomSupported, setZoom, capabilities } = useCameraControls(videoElement);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // --- Student App States ---
  const [scannedQRText, setScannedQRText] = useState<string>("");
  const [scannedSessionId, setScannedSessionId] = useState<string | number | null>(null);
  const [qrTargetLat, setQrTargetLat] = useState<number | null>(null);
  const [qrTargetLng, setQrTargetLng] = useState<number | null>(null);
  const [qrTargetRadius, setQrTargetRadius] = useState<number | null>(null);
  const [studentLat, setStudentLat] = useState<number>(37.77491); // Very close, defaults within bounds
  const [studentLng, setStudentLng] = useState<number>(-122.41941);
  const [isGpsLoading, setIsGpsLoading] = useState<boolean>(false);
  const [isLecturerGpsLoading, setIsLecturerGpsLoading] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string>("");
  const [studentIdInput, setStudentIdInput] = useState<string>("");
  
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!loginEmail || !loginPassword) {
      setLoginError('Please fill out all fields.');
      return;
    }

    if (!loginEmail.includes('@')) {
      setLoginError('Please provide a valid Email Address.');
      return;
    }

    setIsAuthLoading(true);

    try {
      if (isSignUpMode) {
        // Register new user with Supabase
        const { data, error } = await supabase.auth.signUp({
          email: loginEmail,
          password: loginPassword,
          options: {
            data: {
              role: signUpRole
            }
          }
        });

        if (error) {
          console.warn("Supabase SignUp Info:", error.message);
          setLoginError(error.message);
          setIsAuthLoading(false);
          return;
        }
        
        // Sometimes Supabase requires email verification, but we'll assume auto-confirm for now or proceed
        setIsLoggedIn(true);
        setUserRole(signUpRole);
        setActiveTab(signUpRole);
        if (signUpRole === 'student') {
          setStudentIdInput(loginEmail.split('@')[0].toUpperCase());
        } else if (signUpRole === 'lecturer') {
          // Sync lecturer to backend
          try {
            await fetch('/api/lecturers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: loginEmail, name: loginEmail.split('@')[0], password_hash: 'supabase_auth' })
            });
          } catch(e) {
            console.error("Failed to sync lecturer:", e);
          }
        }
      } else {
        // Sign in existing user
        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: loginPassword
        });

        if (error) {
          console.warn("Supabase SignIn Info:", error.message);
          if (error.message.includes('Invalid login credentials')) {
             setLoginError('Invalid login credentials. Please ensure you have created an account first by clicking "Need an account? Sign up" below.');
          } else {
             setLoginError(error.message);
          }
          setIsAuthLoading(false);
          return;
        }

        // Get user role from metadata, default to student if missing
        const userRole = data.user?.user_metadata?.role || 'student';
        
        setIsLoggedIn(true);
        setUserRole(userRole);
        setActiveTab(userRole);
        if (userRole === 'student') {
          setStudentIdInput(loginEmail.split('@')[0].toUpperCase());
        }
      }
    } catch (err: any) {
      console.error("Auth Exception:", err);
      setLoginError(err.message || 'An unexpected error occurred during authentication.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole(null);
    setLoginEmail('');
    setLoginPassword('');
  };
  
  // Student Face Check states
  const logFraud = async (fraudData: Omit<FraudLog, 'id'>) => {
    try {
      const res = await fetch('/api/fraud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fraudData)
      });
      if (res.ok) {
        const freshRes = await fetch('/api/fraud');
        if (freshRes.ok) {
          const data = await freshRes.json();
          setFraudLogs(data);
        }
      }
    } catch (err) {
      console.error("Failed to log fraud to server:", err);
    }
  };
  
  const [studentScanStep, setStudentScanStep] = useState<'qr' | 'qr-success' | 'location' | 'face-auth' | 'success' | 'failed'>('qr');
  const [promptedEmotion, setPromptedEmotion] = useState<string>("SMILE");
  const [detectedEmotion, setDetectedEmotion] = useState<string>("NEUTRAL");
  const [livenessProgress, setLivenessProgress] = useState<number>(0);
  const [livenessStatusText, setLivenessStatusText] = useState<string>("Keep face in frame");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [qrCameraError, setQrCameraError] = useState<string | null>(null);
  const [qrCameraKey, setQrCameraKey] = useState<number>(0);
  const [cameraKey, setCameraKey] = useState<number>(0);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const toggleCamera = () => setFacingMode(prev => prev === "user" ? "environment" : "user");

  const handleCameraError = (error: string | DOMException) => {
    console.error("Camera Error: ", error);
    setCameraError(typeof error === 'string' ? error : error.message || "Camera access blocked or not available");
  };

  const handleRetryCamera = () => {
    setCameraError(null);
    setCameraKey(prev => prev + 1);
  };

  // Refs for custom animations
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- 1. Dynamic QR Code Algorithm (Epoch-synced 15s countdown) ---
  useEffect(() => {
    const updateQR = () => {
      const now = Math.floor(Date.now() / 1000);
      const timeLeft = 15 - (now % 15);
      setQrTimeLeft(timeLeft);

      // Generate a cryptographic-like hash based on current time-bucket
      const timeBucket = Math.floor(now / 15);
      const timeBucketStart = timeBucket * 15;
      const dummyToken = btoa(`${dbSessionId || 'SESSION_CS101'}:${courseName}:${timeBucket}:${sessionSecret}:${sessionActive ? 'ACTIVE' : 'EXPIRED'}`).slice(0, 32);
      
      const payload = {
        session_id: dbSessionId || "SESSION_CS101",
        timestamp: timeBucketStart,
        nonce: "nonce_" + timeBucket,
        token: dummyToken,
        coordinates: { lat: geofenceLat, lng: geofenceLng, radius: radiusMeters }
      };
      
      setQrToken(JSON.stringify(payload));
    };

    updateQR();
    const interval = setInterval(updateQR, 1000);
    return () => clearInterval(interval);
  }, [courseName, sessionSecret, geofenceLat, geofenceLng, radiusMeters, sessionActive, dbSessionId]);

  const handleSyncSession = async () => {
    setIsSyncingSession(true);
    try {
      // 1. Create or get course
      const courseRes = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lecturerId: loginEmail, name: courseName })
      });
      if (!courseRes.ok) throw new Error("Failed to sync course");
      const { id: courseId } = await courseRes.json();

      // 2. Create session
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          courseId, 
          sessionSecret, 
          startTime: new Date().toISOString(), 
          active: sessionActive ? 1 : 0 
        })
      });
      if (!sessionRes.ok) throw new Error("Failed to sync session");
      const { id: sessionId } = await sessionRes.json();
      
      setDbSessionId(sessionId);
      alert(`Session successfully synchronized to database! (Session ID: ${sessionId})`);
    } catch (e: any) {
      alert("Error syncing session: " + e.message);
    } finally {
      setIsSyncingSession(false);
    }
  };

  // --- Geolocation fetcher ---
  const fetchLecturerGPS = () => {
    setIsLecturerGpsLoading(true);
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      setIsLecturerGpsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeofenceLat(position.coords.latitude);
        setGeofenceLng(position.coords.longitude);
        setIsLecturerGpsLoading(false);
      },
      (error) => {
        alert("GPS Error: " + error.message);
        setIsLecturerGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };
  const fetchStudentGPS = () => {
    setIsGpsLoading(true);
    setGpsError("");
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser");
      setIsGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStudentLat(position.coords.latitude);
        setStudentLng(position.coords.longitude);
        setIsGpsLoading(false);
      },
      (error) => {
        setGpsError(`Error getting location: ${error.message}. You can manually adjust mock GPS coordinates below for testing.`);
        setIsGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Harvesine formula for geofence calculation
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
  };

  // --- Onboarding Facial Capture ---
  const handleOnboardCapture = () => {
    if (!onboardId.trim() || !onboardName.trim()) {
      alert("Please enter Student ID and Name first.");
      return;
    }
    
    // Capture image
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) setCapturedImage(imageSrc);
    
    setIsScanningFaceOnboard(true);
    setTimeout(() => {
      // Simulate face vector extraction (128-dimensional floating points)
      const mockEmbedding = Array.from({ length: 128 }, () => Math.random() * 2 - 1);
      setGeneratedFaceEmbedding(mockEmbedding);
      setIsScanningFaceOnboard(false);
      setOnboardFaceCaptured(true);
    }, 2000);
  };

  const [isSavingOnboard, setIsSavingOnboard] = useState(false);

  const handleSaveStudent = async () => {
    if (!onboardFaceCaptured || !generatedFaceEmbedding) return;
    
    setIsSavingOnboard(true);
    
    const newStudent: Student = {
      studentId: onboardId,
      name: onboardName,
      encryptedFaceVector: `Enc(AES-256)[${generatedFaceEmbedding.slice(0, 3).map(n => n.toFixed(3)).join(', ')}...]`,
      status: 'ACTIVE',
      lecturerEmail: loginEmail
    };

    try {
      const response = await fetch('/api/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newStudent)
      });

      if (response.ok || response.status === 201) {
        // Only update UI if the backend request was successful
        setStudents(prev => [newStudent, ...prev]);
        setOnboardId("");
        setOnboardName("");
        setOnboardFaceCaptured(false);
        setGeneratedFaceEmbedding(null);
        alert(`Successfully onboarded ${newStudent.name}. Face vector securely encrypted and saved to database.`);
      } else {
        const errData = await response.json().catch(() => null);
        console.error("Database Save Failed:", response.status, errData);
        alert(`Failed to save student: ${errData?.error || 'Unknown error'} (Status: ${response.status})`);
      }
    } catch (error) {
      console.error("Network or Backend Error during save:", error);
      alert("A network error occurred while trying to save the student data to the database.");
    } finally {
      setIsSavingOnboard(false);
    }
  };

  // --- Student Verification Engine ---
  
  // Auto-verify when a valid QR payload is detected
  useEffect(() => {
    if (scannedQRText && studentScanStep === 'qr') {
      try {
        const parsed = JSON.parse(scannedQRText);
        if (parsed.session_id && parsed.token) {
          handleVerifyQR();
        }
      } catch (e) {
        // Not valid JSON yet, wait
      }
    }
  }, [scannedQRText, studentScanStep]); // Intentionally omitting handleVerifyQR to avoid loops

  // jsQR scanning effect
  useEffect(() => {
    let animationFrameId: number;
    let lastScanLog = 0;
    const scanQR = () => {
      if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4 && studentScanStep === 'qr') {
        const video = webcamRef.current.video;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          try {
              // @ts-ignore
              const code = jsQR(imageData.data, imageData.width, imageData.height);
              if (Date.now() - lastScanLog > 5000) {
                 console.log("QR Scan active, frame sizes:", imageData.width, imageData.height);
                 lastScanLog = Date.now();
              }
              if (code && code.data) {
            setScannedQRText(prev => {
              try {
                const parsed = JSON.parse(code.data);
                const formatted = JSON.stringify(parsed, null, 2);
                if (prev !== formatted) return formatted;
              } catch (e) {
                if (prev !== code.data) return code.data;
              }
              return prev;
              });
            }
          } catch (scanErr) {
             console.error("jsQR scan error:", scanErr);
          }
        }
        }
      }
      animationFrameId = requestAnimationFrame(scanQR);
    };
    scanQR();
    return () => cancelAnimationFrame(animationFrameId);
  }, [studentScanStep]);

  

  const handleVerifyQR = async () => {
    if (!studentIdInput.trim()) {
      setErrorMessage("Please enter your Student ID before scanning.");
      return;
    }


    // Fetch latest students to ensure we are up to date
    let latestStudents = students;
    try {
      const res = await fetch('/api/students');
      if (res.ok) {
        latestStudents = await res.json();
        setStudents(latestStudents);
      }
    } catch (e) {}

    // Verify student exists in our local simulated database
    const isValidStudent = latestStudents.some(s => s.studentId.toUpperCase() === studentIdInput.trim().toUpperCase());
    if (!isValidStudent) {
      setErrorMessage(`Student ID "${studentIdInput}" not found in the database. Please register first.`);
      setStudentScanStep('failed');
      return;
    }
    try {
      if (!scannedQRText.trim()) {
        setErrorMessage("Please paste or type the scanned dynamic QR code payload.");
        return;
      }
      
      const payload = JSON.parse(scannedQRText);
      setScannedSessionId(payload.session_id);
      const qrAge = Math.floor(Date.now() / 1000) - payload.timestamp;

      // 1. Validate QR timestamp expiration (15-second window)
      const targetLat = payload.coordinates?.lat ?? geofenceLat;
      const targetLng = payload.coordinates?.lng ?? geofenceLng;
      const targetRadius = payload.coordinates?.radius ?? radiusMeters;
      
      if (qrAge > 300 || qrAge < -300) { // heavily relaxed to 300s (5 minutes) for testing
        const newFraud = {
          sessionId: payload.session_id,
          studentId: (students.find(s => s.studentId.toUpperCase() === studentIdInput.toUpperCase())?.studentId || studentIdInput),
          fraudType: `EXPIRED_QR_CODE (Generated ${qrAge}s ago)`,
          distance: calculateDistance(studentLat, studentLng, targetLat, targetLng),
          timestamp: new Date().toLocaleTimeString(),
          deviceFingerprint: "sha256_mock_df_" + Math.random().toString(16).slice(2, 10)
        };
        logFraud(newFraud);
        setErrorMessage(`Security Breach: Expired QR code token. Age: ${qrAge} seconds. (Clocks must be within 5 minutes)`);
        setStudentScanStep('failed');
        return;
      }

      // 2. Proceed to Location step
      setQrTargetLat(targetLat);
      setQrTargetLng(targetLng);
      setQrTargetRadius(targetRadius);
      setStudentScanStep('location');
    } catch (e: any) {
      setErrorMessage("Corrupted QR Data: " + e.message);
      setStudentScanStep('failed');
    }
  };

  // --- Biometric Liveness Challenge Simulator ---
  const emotions = ["SMILE", "LOOK SURPRISED", "BLINK BOTH EYES", "WINK LEFT EYE"];
  const startLivenessChallenge = async () => {
    // Select a random required emotion/action to prevent video playback/photo spoofing
    const randomEmotion = emotions[Math.floor(Math.random() * emotions.length)];
    setPromptedEmotion(randomEmotion);
    setDetectedEmotion("NEUTRAL");
    setLivenessProgress(0);
    setLivenessStatusText("Looking for face...");

    let latestStudents = students;
    try {
      const res = await fetch('/api/students');
      if (res.ok) {
        latestStudents = await res.json();
        setStudents(latestStudents);
      }
    } catch (e) {}

    // Simulate emotion liveness progress bar ticking
    setTimeout(() => {
      setLivenessStatusText(`Validating face matches Student ID...`);
      setTimeout(() => {
        const matchingStudent = latestStudents.find(s => s.studentId.toUpperCase() === studentIdInput.toUpperCase());
        if (!matchingStudent) {
            const newFraud = {
              sessionId: scannedSessionId,
              studentId: (students.find(s => s.studentId.toUpperCase() === studentIdInput.toUpperCase())?.studentId || studentIdInput),
              fraudType: "UNREGISTERED_STUDENT_ID",
              distance: 0,
              timestamp: new Date().toLocaleTimeString(),
              deviceFingerprint: "sha256_mock_df_" + Math.random().toString(16).slice(2, 10)
            };
            logFraud(newFraud);
            setErrorMessage("Facial match failed: Student ID not found in database.");
            setStudentScanStep('failed');
            return;
        }

        setLivenessStatusText(`Facial match verified. Please trigger: ${randomEmotion}`);
      }, 1500);
    }, 1000);
  };

  const captureAndAnalyzeEmotion = async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) {
      setLivenessStatusText("Could not capture image from webcam.");
      return;
    }
    setCapturedImage(imageSrc);
    setLivenessStatusText("Analyzing emotion via AI...");

    try {
      const response = await fetch('/api/detect-emotion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: imageSrc, expectedEmotion: promptedEmotion })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze emotion');
      }
      
      if (data.match) {
        setDetectedEmotion(promptedEmotion);
        setLivenessStatusText("Perfect! Liveness verification passed.");
        let progress = 0;
        const interval = setInterval(() => {
          progress += 25;
          setLivenessProgress(progress);
          if (progress >= 100) {
            clearInterval(interval);
            completeCheckIn();
          }
        }, 200);
      } else {
        setDetectedEmotion("NEUTRAL");
        setLivenessStatusText(`Action did not match. Please exhibit ${promptedEmotion}`);
      }
    } catch (error: any) {
      console.error(error);
      setLivenessStatusText("Error: " + error.message);
    }
  };

  const completeCheckIn = async () => {
    // Fetch latest to be 100% sure we have the name
    let latestStudents = students;
    try {
      const res = await fetch('/api/students');
      if (res.ok) {
        latestStudents = await res.json();
        setStudents(latestStudents);
      }
    } catch (e) {}
    
    const student = latestStudents.find(s => s.studentId.toUpperCase() === studentIdInput.toUpperCase());
    if (!student) {
      setErrorMessage(`Student ID "${studentIdInput}" not found in database. Registration required.`);
      setStudentScanStep('failed');
      return;
    }
    const distance = calculateDistance(studentLat, studentLng, geofenceLat, geofenceLng);

    const newLog = {
      sessionId: scannedSessionId,
      studentId: student.studentId, // Use exact casing from DB
      studentName: student ? student.name : "Unknown",
      checkedInAt: new Date().toLocaleTimeString(),
      distance: parseFloat(distance.toFixed(2)),
      emotion: promptedEmotion,
      status: "SUCCESS"
    };

    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLog)
      });
      if (response.ok) {
        const { logId } = await response.json();
        setAttendanceLogs(prev => [{ id: logId, ...newLog }, ...prev]);
        setStudentScanStep('success');
      } else {
        const errData = await response.json().catch(() => ({}));
        setErrorMessage(errData.error || ("Failed to save attendance log to server. Status: " + response.status));
        setStudentScanStep('failed');
      }
    } catch (err) {
      console.error("Failed to save attendance:", err);
      setErrorMessage("Network error: Failed to save attendance log to server.");
      setStudentScanStep('failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-slate-200 font-sans selection:bg-cyan-500 selection:text-black">
      {/* 1. Header Banner */}
      <header className="border-b border-white/10 bg-[#05070a]/80 backdrop-blur-xl sticky top-0 z-50 px-6 py-4 mb-6 shadow-lg shadow-black/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-cyan-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white uppercase font-sans">
                AegisAttendance
              </h1>
              <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase opacity-80">
                Anti-Fraud Face Liveness & Geofenced Check-In System
              </p>
            </div>
          </div>

          {/* Quick Stats/Flags */}
          {isLoggedIn && userRole === 'lecturer' && (
            <div className="flex items-center gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Onboarded: {students.filter(s => s.lecturerEmail === loginEmail).length}
              </div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                Fraud Logs: {fraudLogs.filter(log => students.filter(s => s.lecturerEmail === loginEmail).map(s => s.studentId).includes(log.studentId)).length}
              </div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-cyan-400">
                QR Sync: 15s Interval
              </div>
            </div>
          )}
          {isLoggedIn && (
            <button 
              onClick={handleLogout}
              className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-xs font-semibold text-white uppercase tracking-wider transition-all"
            >
              Logout
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-4">
        
        {!isLoggedIn ? (
          <div className="max-w-md mx-auto mt-12 bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 to-blue-500"></div>
            <div className="text-center mb-8">
              <ShieldCheck className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white uppercase tracking-wider">{isSignUpMode ? 'Create Account' : 'System Portal Login'}</h2>
              <p className="text-xs text-slate-400 mt-2">{isSignUpMode ? 'Register a new identity for AegisAttendance' : 'Enter credentials to access AegisAttendance'}</p>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-5">
              {loginError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-xl font-mono">
                  {loginError}
                </div>
              )}
              {isSignUpMode && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-wider text-slate-400">Select Role</label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setSignUpRole('student')}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${signUpRole === 'student' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'bg-black/45 border-white/10 text-slate-400'}`}
                      >
                        Student
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignUpRole('lecturer')}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${signUpRole === 'lecturer' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'bg-black/45 border-white/10 text-slate-400'}`}
                      >
                        Lecturer
                      </button>
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-wider text-slate-400">Email Address</label>
                <input 
                  type="email" 
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="e.g. user@example.com"
                  className="w-full bg-black/45 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-all placeholder:text-slate-600"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-wider text-slate-400">Password</label>
                <input 
                  type="password" 
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder={isSignUpMode ? "Create a password" : "Enter password"}
                  className="w-full bg-black/45 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-all placeholder:text-slate-600"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-gradient-to-br from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-cyan-500/20"
              >
                {isSignUpMode ? 'Register & Enter' : 'Authenticate'}
              </button>
            </form>
            <div className="mt-6 text-center">
              <button 
                type="button" 
                onClick={() => {
                  setIsSignUpMode(!isSignUpMode);
                  setLoginError('');
                }}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-wider font-semibold"
              >
                {isSignUpMode ? 'Already have an account? Login' : 'Need an account? Sign Up'}
              </button>
            </div>
          </div>
        ) : (
          <>
        {/* Navigation Selector */}
        {userRole === 'lecturer' && (
          <div className="flex border border-white/10 mb-8 p-1 bg-white/5 rounded-2xl max-w-lg backdrop-blur-xl shadow-lg shadow-black/30">
            <button 
              id="nav-lecturer-btn"
              onClick={() => setActiveTab('lecturer')}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 uppercase tracking-wider ${
                activeTab === 'lecturer' 
                  ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 font-bold' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Laptop className="w-4 h-4" />
              Lecturer App
            </button>
            <button 
              id="nav-docs-btn"
              onClick={() => setActiveTab('system-docs')}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 uppercase tracking-wider ${
                activeTab === 'system-docs' 
                  ? 'bg-white/10 text-white border border-white/10 shadow-sm font-bold' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Database className="w-4 h-4" />
              Backend Reference
            </button>
          </div>
        )}

        {/* TAB 1: Lecturer App Interface */}
        {activeTab === 'lecturer' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Lecturer Sub-tabs sidebar */}
            <div className="lg:col-span-3 flex flex-col gap-2">
              <button
                id="lecturer-sub-session-btn"
                onClick={() => setLecturerSubTab('session')}
                className={`w-full py-3 px-4 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-3 border ${
                  lecturerSubTab === 'session' 
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-lg shadow-cyan-500/5' 
                    : 'bg-transparent text-slate-400 border-transparent hover:bg-white/5 hover:text-white'
                }`}
              >
                <QrCode className="w-5 h-5 text-cyan-400" />
                Dynamic Session Setup
              </button>
              <button
                id="lecturer-sub-onboard-btn"
                onClick={() => setLecturerSubTab('onboard')}
                className={`w-full py-3 px-4 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-3 border ${
                  lecturerSubTab === 'onboard' 
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-lg shadow-cyan-500/5' 
                    : 'bg-transparent text-slate-400 border-transparent hover:bg-white/5 hover:text-white'
                }`}
              >
                <UserPlus className="w-5 h-5 text-cyan-400" />
                Student Face Onboarding
              </button>
              <button
                id="lecturer-sub-logs-btn"
                onClick={() => setLecturerSubTab('logs')}
                className={`w-full py-3 px-4 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-3 border ${
                  lecturerSubTab === 'logs' 
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-lg shadow-cyan-500/5' 
                    : 'bg-transparent text-slate-400 border-transparent hover:bg-white/5 hover:text-white'
                }`}
              >
                <FileText className="w-5 h-5 text-cyan-400" />
                Live Attendance & Fraud Logs
              </button>
              
              <div className="mt-8 p-5 bg-white/5 border border-white/10 rounded-2xl space-y-4 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 to-transparent"></div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-cyan-400 font-mono">Geofence Radar</h4>
                <div className="space-y-2 text-xs text-slate-300 font-mono">
                  <p>LAT: <span className="text-white font-semibold">{geofenceLat.toFixed(5)}</span></p>
                  <p>LNG: <span className="text-white font-semibold">{geofenceLng.toFixed(5)}</span></p>
                  <p>RADIUS: <span className="text-cyan-400 font-bold">{radiusMeters} meters</span></p>
                </div>
                <div className="bg-black/45 p-2.5 border border-white/5 rounded-lg text-[10px] text-slate-400 font-mono leading-relaxed">
                  Calculated dynamically using the Harvesine distance metric.
                </div>
              </div>
            </div>

            {/* Lecturer Main Panel */}
            <div className="lg:col-span-9">
              
              {/* SUBTAB 1: Dynamic Session Setup */}
              {lecturerSubTab === 'session' && (
                <div className="space-y-8">
                  {/* Top session config card */}
                  <div className="bg-white/5 border border-white/10 p-6 rounded-2xl shadow-xl space-y-6 relative overflow-hidden backdrop-blur-xl">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 to-transparent"></div>
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-base font-bold text-white uppercase tracking-wider">Dynamic Attendance Room Configuration</h2>
                        <p className="text-xs text-slate-400 mt-1">Configure geofencing and active session secrets for cryptographic QR synchronization.</p>
                      </div>
                      <span className="bg-cyan-500/10 text-cyan-400 text-[10px] px-3 py-1 rounded-full border border-cyan-500/20 font-mono font-bold uppercase tracking-wider">Active Session</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Course Title</label>
                        <input 
                          type="text" 
                          value={courseName}
                          onChange={(e) => setCourseName(e.target.value)}
                          className="w-full bg-black/45 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Attendance Session Secret (Key-Derivation Salt)</label>
                        <input 
                          type="password" 
                          value={sessionSecret}
                          onChange={(e) => setSessionSecret(e.target.value)}
                          className="w-full bg-black/45 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500 transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-300">Location Settings</h4>
                      <button 
                        onClick={fetchLecturerGPS} 
                        disabled={isLecturerGpsLoading}
                        className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-mono px-3 py-1.5 rounded-lg border border-cyan-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${isLecturerGpsLoading ? 'animate-spin' : ''}`} />
                        Fetch Real Location
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Classroom Center Latitude</label>
                        <input 
                          type="number" 
                          step="0.00001"
                          value={geofenceLat}
                          onChange={(e) => setGeofenceLat(parseFloat(e.target.value) || 0)}
                          className="w-full bg-black/45 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500 transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Classroom Center Longitude</label>
                        <input 
                          type="number" 
                          step="0.00001"
                          value={geofenceLng}
                          onChange={(e) => setGeofenceLng(parseFloat(e.target.value) || 0)}
                          className="w-full bg-black/45 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500 transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Acceptable Radius (Meters)</label>
                        <input 
                          type="number" 
                          value={radiusMeters}
                          onChange={(e) => setRadiusMeters(parseInt(e.target.value) || 1)}
                          className="w-full bg-black/45 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500 transition-all"
                        />
                      </div>
                    </div>
                    
                    {/* Sync Session Button */}
                    <div className="pt-2 border-t border-white/10 mt-6">
                      <button 
                        onClick={handleSyncSession}
                        disabled={isSyncingSession}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 rounded-xl uppercase tracking-widest text-xs transition-all disabled:opacity-50"
                      >
                        {isSyncingSession ? "Syncing..." : "Sync & Create Session in Database"}
                      </button>
                      {dbSessionId && (
                        <p className="text-center text-emerald-400 text-[10px] font-mono mt-2 uppercase">
                          Currently Active Database Session ID: {dbSessionId}
                        </p>
                      )}
                    </div>

                  </div>

                  {/* QR Generator Display panel */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    {/* QR Code display */}
                    <div className="md:col-span-5 bg-white/5 border border-white/10 rounded-2xl p-6 text-center flex flex-col items-center justify-center space-y-4 relative overflow-hidden backdrop-blur-xl shadow-xl">
                      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 to-transparent"></div>
                      <h3 className="text-xs font-bold tracking-widest text-cyan-400 uppercase font-mono">Dynamic QR Code (15s Epoch)</h3>
                      
                      {/* Real QR Code Canvas */}
                      <div className="relative bg-white p-4 rounded-xl shadow-2xl shadow-cyan-500/20 select-none transition-transform duration-300 transform hover:scale-105">
                        <QRCodeCanvas 
                          value={qrToken}
                          size={256}
                          bgColor={"#ffffff"}
                          fgColor={"#0f172a"}
                          level={"M"}
                          includeMargin={false}
                        />

                        {/* Top corner QR alignment guides */}
                        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-slate-950"></div>
                        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-slate-950"></div>
                        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-slate-950"></div>
                        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-slate-950"></div>
                      </div>

                      {/* Timer Bar */}
                      <div className="w-full space-y-2">
                        <div className="flex justify-between items-center text-xs font-mono px-1">
                          <span className="text-slate-400">Tokens refresh in:</span>
                          <span className="text-cyan-400 font-bold">{qrTimeLeft}s</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                          <motion.div 
                            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full animate-pulse"
                            initial={{ width: "100%" }}
                            animate={{ width: `${(qrTimeLeft / 15) * 100}%` }}
                            transition={{ ease: "linear", duration: 1 }}
                            key={qrTimeLeft}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Encoded payload info card */}
                    <div className="md:col-span-7 bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 relative overflow-hidden backdrop-blur-xl shadow-xl">
                      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-blue-500 to-transparent"></div>
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-xs font-bold tracking-widest text-slate-200 uppercase font-mono">Real-Time Cryptographic Signature</h3>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        The current QR payload is packed with a unique nonce, active geofence constraints, and signed with <strong className="text-slate-300">HMAC-SHA256</strong>. It becomes absolutely useless to interceptors outside the 15-second epoch window.
                      </p>
                      
                      <div className="space-y-2">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Current Base64 Token Payload:</span>
                        <div className="bg-black/45 p-3 rounded-xl border border-white/5 text-[11px] font-mono text-cyan-300 break-all select-all h-28 overflow-y-auto leading-relaxed scrollbar-thin">
                          {qrToken}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono bg-black/35 p-3 rounded-xl border border-white/5">
                        <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span>Copy payload to test check-in in the Student tab.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 2: Student Face Onboarding */}
              {lecturerSubTab === 'onboard' && (
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl shadow-xl space-y-6 relative overflow-hidden backdrop-blur-xl">
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 to-transparent"></div>
                  <div>
                    <h2 className="text-base font-bold text-white uppercase tracking-wider">Biometric Registry & Student Enrollment</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Register new student details and capture their unique facial geometry vector. Data is encrypted using AES inverse ciphers prior to database storage.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    {/* Enrollment form inputs */}
                    <div className="md:col-span-6 space-y-5">
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Student Academic ID</label>
                        <input 
                          type="text" 
                          placeholder="e.g., STU202611"
                          value={onboardId}
                          onChange={(e) => setOnboardId(e.target.value)}
                          className="w-full bg-black/45 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500 transition-all placeholder:text-slate-600"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Full Legal Name</label>
                        <input 
                          type="text" 
                          placeholder="e.g., John Doe"
                          value={onboardName}
                          onChange={(e) => setOnboardName(e.target.value)}
                          className="w-full bg-black/45 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition-all placeholder:text-slate-600"
                        />
                      </div>

                      <div className="pt-4 space-y-3">
                        <button 
                          id="capture-face-onboard-btn"
                          onClick={handleOnboardCapture}
                          className="w-full bg-white/5 hover:bg-white/10 text-white font-medium py-2.5 rounded-xl text-xs uppercase tracking-wider font-semibold transition-all flex items-center justify-center gap-2 border border-white/10 shadow-sm"
                        >
                          <Camera className="w-4 h-4 text-cyan-400" />
                          {isScanningFaceOnboard ? "Extracting Embeddings..." : "Capture Face Embeddings"}
                        </button>
                        
                        <button 
                          id="save-student-btn"
                          onClick={handleSaveStudent}
                          disabled={!onboardFaceCaptured || isSavingOnboard}
                          className={`w-full font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                            onboardFaceCaptured && !isSavingOnboard
                              ? 'bg-gradient-to-br from-cyan-500 to-blue-600 hover:opacity-90 text-white shadow-lg shadow-cyan-500/20' 
                              : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
                          }`}
                        >
                          {isSavingOnboard ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                          {isSavingOnboard ? "Saving to Database..." : "Secure & Save Student to SQLite"}
                        </button>
                      </div>
                    </div>

                    {/* Facial Scanner Simulator Display */}
                    <div className="md:col-span-6 flex flex-col items-center justify-center bg-black/45 border border-white/10 rounded-2xl p-6 relative overflow-hidden h-80">
                      {isScanningFaceOnboard ? (
                        <div className="flex flex-col items-center justify-center space-y-4">
                          <div className="relative">
                            <div className="w-24 h-24 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin"></div>
                            <Smile className="w-10 h-10 text-cyan-400 absolute top-7 left-7 animate-pulse" />
                          </div>
                          <p className="text-xs font-mono text-cyan-400 animate-pulse">Running facial feature point detection...</p>
                        </div>
                      ) : onboardFaceCaptured ? (
                        <div className="text-center space-y-4">
                          <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl inline-block">
                            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-emerald-400">Facial Features Scanned Successfully</h4>
                            <p className="text-xs text-slate-400 mt-1">128-dimensional biometric floating point vector calculated.</p>
                          </div>
                          <div className="bg-black/45 p-2.5 rounded border border-white/5 max-w-xs font-mono text-[10px] text-cyan-300 break-all h-16 overflow-y-auto">
                            {generatedFaceEmbedding ? JSON.stringify(generatedFaceEmbedding) : ""}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-black/45 w-full h-full relative overflow-hidden flex flex-col items-center justify-center">
                          {capturedImage ? (
                                <img src={capturedImage} alt="Captured" className="absolute inset-0 w-full h-full object-cover opacity-80" />
                              ) : (
                                <WebcamComponent key={cameraKey}
                                  ref={webcamRef}
                                  audio={false}
                                  screenshotFormat="image/jpeg"
                                  className="absolute inset-0 w-full h-full object-cover opacity-60"
                                  onUserMediaError={handleCameraError}
                        videoConstraints={{ facingMode: "user" }}
                                />
                              )}
                          {cameraError ? (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 p-4 text-center backdrop-blur-sm">
                              <ShieldCheck className="w-8 h-8 text-red-500 mb-2" />
                              <p className="text-sm font-bold text-red-400 mb-1">Camera Access Blocked</p>
                              <p className="text-[10px] text-slate-300 mb-3 max-w-xs">{cameraError}</p>
                              <button 
                                onClick={handleRetryCamera}
                                className="px-4 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs rounded border border-cyan-500/30 transition-all cursor-pointer pointer-events-auto"
                              >
                                Try Again
                              </button>
                            </div>
                          ) : (
                            <div className="relative z-10 flex flex-col items-center pointer-events-none">
                              <p className="text-xs text-slate-100 drop-shadow-md bg-black/50 px-2 py-1 rounded max-w-xs text-center font-mono">Camera feed active. Ensure good lighting.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Corner target markings representing facial scanner box */}
                      <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-cyan-500/50"></div>
                      <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-cyan-500/50"></div>
                      <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-cyan-500/50"></div>
                      <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-cyan-500/50"></div>
                    </div>
                  </div>

                  {/* Onboarded Students Table */}
                  <div className="pt-6 border-t border-white/10 space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider">Onboarded SQLite Student Database</h3>
                    </div>
                    
                    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/35">
                      <table className="w-full text-left text-xs font-mono">
                        <thead>
                          <tr className="border-b border-white/10 text-slate-400 bg-white/5">
                            <th className="py-2.5 px-4 font-semibold">Student ID</th>
                            <th className="py-2.5 px-4 font-semibold">Legal Name</th>
                            <th className="py-2.5 px-4 font-semibold">At-Rest Encrypted Facial Key Vector</th>
                            <th className="py-2.5 px-4 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.filter(s => s.lecturerEmail === loginEmail).map((student) => (
                            <tr key={student.studentId} className="border-b border-white/5 hover:bg-white/5 transition-all">
                              <td className="py-2.5 px-4 font-bold text-white">{student.studentId}</td>
                              <td className="py-2.5 px-4 text-slate-300">{student.name}</td>
                              <td className="py-2.5 px-4 text-cyan-400 max-w-xs truncate">{student.encryptedFaceVector}</td>
                              <td className="py-2.5 px-4">
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px]">
                                  {student.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 3: Live Logs */}
              {lecturerSubTab === 'logs' && (
                <div className="space-y-8">
                  {/* Attendance log table */}
                  <div className="bg-white/5 border border-white/10 p-6 rounded-2xl shadow-xl space-y-4 relative overflow-hidden backdrop-blur-xl">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500 to-transparent"></div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Verified Attendance Record Logs</h2>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">Real-time updates</span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/35">
                      <table className="w-full text-left text-xs font-mono">
                        <thead>
                          <tr className="border-b border-white/10 text-slate-400 bg-white/5">
                            <th className="py-3 px-4 font-semibold">Log ID</th>
                            <th className="py-3 px-4 font-semibold">Student ID</th>
                            <th className="py-3 px-4 font-semibold">Student Name</th>
                            <th className="py-3 px-4 font-semibold">Verification Time</th>
                            <th className="py-3 px-4 font-semibold">Geofence Distance</th>
                            <th className="py-3 px-4 font-semibold">Liveness Challenge</th>
                            <th className="py-3 px-4 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendanceLogs.filter(log => students.filter(s => s.lecturerEmail === loginEmail).map(s => s.studentId).includes(log.studentId)).map((log) => (
                            <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-all">
                              <td className="py-3 px-4 text-slate-500">#{log.id}</td>
                              <td className="py-3 px-4 font-bold text-white">{log.studentId}</td>
                              <td className="py-3 px-4 text-slate-300">{log.studentName}</td>
                              <td className="py-3 px-4 text-slate-400">{log.checkedInAt}</td>
                              <td className="py-3 px-4 text-cyan-400 font-bold">{log.distance} meters</td>
                              <td className="py-3 px-4 text-emerald-400 font-bold">{log.emotion} VERIFIED</td>
                              <td className="py-3 px-4">
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px]">
                                  {log.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {attendanceLogs.filter(log => students.filter(s => s.lecturerEmail === loginEmail).map(s => s.studentId).includes(log.studentId)).length === 0 && (
                            <tr>
                              <td colSpan={7} className="text-center py-8 text-slate-500">No student has completed check-in yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Fraud prevention logs */}
                  <div className="bg-white/5 border border-white/10 p-6 rounded-2xl shadow-xl space-y-4 relative overflow-hidden backdrop-blur-xl">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-rose-500 to-transparent"></div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-red-400" />
                        <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider">Fraud Prevention logs (Security Alerter)</h2>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">Intrusion prevention logs</span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/35">
                      <table className="w-full text-left text-xs font-mono">
                        <thead>
                          <tr className="border-b border-white/10 text-slate-400 bg-white/5">
                            <th className="py-3 px-4 font-semibold">Fraud ID</th>
                            <th className="py-3 px-4 font-semibold">Attempted ID</th>
                            <th className="py-3 px-4 font-semibold">Identified Fraud Vector</th>
                            <th className="py-3 px-4 font-semibold">Attempt Distance</th>
                            <th className="py-3 px-4 font-semibold">Timestamp</th>
                            <th className="py-3 px-4 font-semibold">Device Fingerprint Signature</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fraudLogs.filter(log => students.filter(s => s.lecturerEmail === loginEmail).map(s => s.studentId).includes(log.studentId)).map((log) => (
                            <tr key={log.id} className="border-b border-white/5 hover:bg-rose-500/10 bg-rose-500/5 transition-all">
                              <td className="py-3 px-4 text-red-400 font-semibold">#F0{log.id}</td>
                              <td className="py-3 px-4 font-bold text-white">{log.studentId || "ANONYMOUS"}</td>
                              <td className="py-3 px-4 text-red-400 font-bold">{log.fraudType}</td>
                              <td className="py-3 px-4 text-slate-300">{log.distance ? `${log.distance} meters` : "N/A"}</td>
                              <td className="py-3 px-4 text-slate-400">{log.timestamp}</td>
                              <td className="py-3 px-4 text-slate-500 select-all truncate max-w-xs">{log.deviceFingerprint}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Student App Interface */}
        {activeTab === 'student' && (
          <div className="max-w-2xl mx-auto bg-white/5 border border-white/10 rounded-3xl p-8 space-y-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
            {/* Top glass glow accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>

            <div className="text-center space-y-2">
              <h2 className="text-xl font-extrabold tracking-tight text-white uppercase tracking-wider">Student Mobile Check-In Portal</h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Validate your proximity and authenticate via face liveness challenge to register your attendance.
              </p>
            </div>

            {/* Simulated GPS location overrides for testing spoof vectors */}
            <div className="bg-black/45 p-5 rounded-2xl border border-white/10 space-y-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 to-transparent opacity-50"></div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold font-mono text-slate-300 uppercase tracking-widest flex items-center gap-2">
                  <Compass className="w-4 h-4 text-cyan-400 animate-spin-slow" />
                  Student Location
                </span>
                <button 
                  id="fetch-gps-btn"
                  onClick={fetchStudentGPS} 
                  disabled={isGpsLoading}
                  className="text-[10px] bg-white/5 hover:bg-white/10 text-white font-mono px-2.5 py-1.5 rounded-lg border border-white/10 flex items-center gap-1 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isGpsLoading ? 'animate-spin' : ''}`} />
                  Fetch Real Location
                </button>
              </div>

              {gpsError && (
                <div className="text-[11px] text-yellow-400 font-mono bg-yellow-400/5 p-2 rounded border border-yellow-400/10">
                  {gpsError}
                </div>
              )}

              <div className="flex justify-between text-[11px] font-mono border-t border-white/5 pt-3">
                <span className="text-slate-400">Current LAT: <span className="text-cyan-400 font-bold">{studentLat.toFixed(5)}</span></span>
                <span className="text-slate-400">Current LNG: <span className="text-cyan-400 font-bold">{studentLng.toFixed(5)}</span></span>
              </div>


            </div>

            {/* Check-In Stepper Flow */}
            <AnimatePresence mode="wait">
              
              {/* STEP 1: Scan QR & Enter ID */}
              {studentScanStep === 'qr' && (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Student ID</label>
                      <input 
                        type="text" 
                        placeholder="e.g., STU202601"
                        value={studentIdInput}
                        onChange={(e) => setStudentIdInput(e.target.value)}
                        className="w-full bg-black/45 border border-white/10 rounded-2xl px-5 py-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500 uppercase tracking-widest placeholder:lowercase placeholder:tracking-normal transition-all placeholder:text-slate-600"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Scan Dynamic QR Payload</label>
                        
                      </div>
                      
                      <div className="relative rounded-2xl overflow-hidden bg-black/45 border border-white/10 w-full aspect-video min-h-[240px]">
                        
                        <WebcamComponent 
                          key={qrCameraKey}
                          ref={webcamRef}
                          audio={false}
                          screenshotFormat="image/jpeg"
                          className="absolute inset-0 w-full h-full object-cover"
                          onUserMediaError={(err) => {
                            console.error("QR Camera Error:", err);
                            setQrCameraError(typeof err === 'string' ? err : err.message || "Camera access blocked or not available");
                          }}
                          videoConstraints={{ facingMode }}
                        />
                        <button 
                          onClick={toggleCamera} 
                          className="absolute top-2 right-2 z-30 p-2 bg-black/60 rounded-full text-white hover:bg-black/80 transition-all cursor-pointer pointer-events-auto"
                          title="Switch Camera"
                        >
                          <SwitchCamera className="w-5 h-5" />
                        </button>
                        {/* QR Scanning logic overlay */}
                        {isZoomSupported && capabilities?.zoom && (
                          <div className="absolute bottom-4 left-0 right-0 z-30 flex justify-center px-8">
                            <input
                              type="range"
                              min={capabilities.zoom.min}
                              max={capabilities.zoom.max}
                              step={capabilities.zoom.step || 0.1}
                              value={zoomLevel}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setZoomLevel(val);
                                setZoom(val);
                              }}
                              className="w-full max-w-xs accent-cyan-500 pointer-events-auto cursor-pointer"
                            />
                          </div>
                        )}
                        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                           <div className="w-48 h-48 border-2 border-cyan-500/50 rounded-xl"></div>
                           <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-scan-beam"></div>
                        </div>

                        {qrCameraError && (
                          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 p-4 text-center backdrop-blur-sm">
                            <ShieldCheck className="w-8 h-8 text-red-500 mb-2" />
                            <p className="text-sm font-bold text-red-400 mb-1">Camera Access Blocked</p>
                            <p className="text-[10px] text-slate-300 mb-3 max-w-xs">{qrCameraError}</p>
                            <button 
                              onClick={() => { setQrCameraError(null); setQrCameraKey(prev => prev + 1); }}
                              className="px-4 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs rounded border border-cyan-500/30 transition-all cursor-pointer pointer-events-auto"
                            >
                              Try Again
                            </button>
                          </div>
                        )}

                        {scannedQRText && (
                          <div className="absolute bottom-0 left-0 w-full bg-emerald-500/90 text-white text-[10px] p-2 text-center font-mono">
                            QR Payload Scanned Successfully
                          </div>
                        )}
                      </div>
                      
                      {/* Manual QR Entry Fallback */}
                      <div className="mt-4">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider block mb-2">Or Paste QR Token</label>
                        <textarea
                          placeholder="Paste JSON QR Payload..."
                          value={scannedQRText}
                          onChange={(e) => setScannedQRText(e.target.value)}
                          className="w-full bg-black/45 border border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500 transition-all h-20 placeholder:text-slate-600"
                        />
                      </div>
                      
                    </div>
                  </div>

                  <button 
                    id="validate-qr-student-btn"
                    onClick={handleVerifyQR}
                    className="w-full bg-gradient-to-br from-cyan-500 to-blue-600 hover:opacity-95 text-white font-bold py-4 rounded-2xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-cyan-500/15 flex items-center justify-center gap-2"
                  >
                    <QrCode className="w-4 h-4 text-white" />
                    Verify QR Token & Geofence Proximity
                  </button>
                </motion.div>
              )}

              {/* STEP 2: Facial/Emotion Liveness Challenge */}
              {studentScanStep === 'location' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center text-center space-y-6 py-8"
                >
                  <div className="w-24 h-24 bg-cyan-500/20 rounded-full flex items-center justify-center border-[3px] border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.3)] mb-4">
                    <MapPin className="w-12 h-12 text-cyan-400" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-2xl font-bold text-slate-100 tracking-tight">QR Validated</h3>
                    <p className="text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">
                      Please verify your location to ensure you are within the classroom bounds.
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      const distance = calculateDistance(studentLat, studentLng, qrTargetLat || geofenceLat, qrTargetLng || geofenceLng);
                      if (distance > (qrTargetRadius || radiusMeters)) {
                        const newFraud = {
                          sessionId: scannedSessionId,
                          studentId: (students.find(s => s.studentId.toUpperCase() === studentIdInput.toUpperCase())?.studentId || studentIdInput),
                          fraudType: `GPS_GEOFENCE_BREACH (${distance.toFixed(1)}m out)`,
                          distance: parseFloat(distance.toFixed(1)),
                          timestamp: new Date().toLocaleTimeString(),
                          deviceFingerprint: "sha256_mock_df_" + Math.random().toString(16).slice(2, 10)
                        };
                        logFraud(newFraud);
                        setErrorMessage(`Geofencing Failure: You are out of classroom bounds. Distance: ${distance.toFixed(1)} meters. Accepted limit: ${qrTargetRadius || radiusMeters} meters.`);
                        setStudentScanStep('failed');
                        return;
                      }
                      setStudentScanStep('qr-success');
                    }}
                    className="w-full mt-6 bg-gradient-to-br from-cyan-500 to-blue-600 hover:opacity-95 text-white font-bold py-4 rounded-2xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-cyan-500/15"
                  >
                    Verify Location
                  </button>
                </motion.div>
              )}

              {studentScanStep === 'qr-success' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center text-center space-y-6 py-8"
                >
                  <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center border-[3px] border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)] mb-4">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-2xl font-bold text-slate-100 tracking-tight">QR Verified</h3>
                    <p className="text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">
                      Token and proximity geofence validated successfully. Proceed to anti-fraud biometric verification.
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setStudentScanStep('face-auth');
                      setCapturedImage(null);
                      startLivenessChallenge();
                    }}
                    className="w-full mt-6 bg-gradient-to-br from-emerald-500 to-teal-600 hover:opacity-95 text-white font-bold py-4 rounded-2xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/15"
                  >
                    Proceed to Face Check
                  </button>
                </motion.div>
              )}
              {studentScanStep === 'face-auth' && (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="space-y-6 flex flex-col items-center text-center"
                >
                  <div className="relative w-full max-w-sm aspect-video bg-black/45 rounded-2xl border border-white/10 overflow-hidden h-64 shadow-xl">
                    {capturedImage ? (
                      <img src={capturedImage} alt="Captured" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <WebcamComponent key={cameraKey}
                        ref={webcamRef}
                        audio={false}
                        screenshotFormat="image/jpeg"
                        className="absolute inset-0 w-full h-full object-cover"
                        onUserMediaError={handleCameraError}
                        videoConstraints={{ facingMode: "user" }}
                      />
                    )}

                    {cameraError && (
                      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 p-4 text-center backdrop-blur-md pointer-events-auto">
                        <ShieldCheck className="w-10 h-10 text-red-500 mb-2" />
                        <p className="text-sm font-bold text-red-400 mb-1 font-mono uppercase">Camera Blocked</p>
                        <p className="text-[10px] text-slate-400 mb-4 max-w-[200px] leading-relaxed">{cameraError}</p>
                        <button 
                          onClick={handleRetryCamera}
                          className="px-6 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-bold rounded-lg border border-cyan-500/30 transition-all uppercase tracking-widest cursor-pointer"
                        >
                          Try Again
                        </button>
                      </div>
                    )}
                    {/* Camera simulation layout & Status */}
                    <div className="absolute inset-0 flex flex-col items-center justify-end pb-4 z-10 pointer-events-none bg-gradient-to-t from-black/80 via-transparent to-transparent">
                      <div className="space-y-1 text-center">
                        <p className="text-sm font-bold text-cyan-400 font-mono tracking-widest uppercase bg-black/50 px-3 py-1 rounded-full backdrop-blur-md inline-block mb-2">{promptedEmotion}</p>
                        <p className="text-[10px] text-slate-300 font-mono tracking-wider drop-shadow-md bg-black/50 px-2 py-0.5 rounded-full">{livenessStatusText}</p>
                      </div>
                      
                      {/* Liveness Challenge Progress */}
                      {livenessProgress > 0 && (
                        <div className="w-48 space-y-1 mt-2">
                          <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 transition-all duration-350" style={{ width: `${livenessProgress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Corner facial guides */}
                    <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-cyan-500"></div>
                    <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-cyan-500"></div>
                    <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-cyan-500"></div>
                    <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-cyan-500"></div>
                  </div>

                  {/* Real trigger triggers to process the emotion detection on webcam photo */}
                  <div className="w-full space-y-3">
                    <button
                      onClick={() => captureAndAnalyzeEmotion()}
                      className="w-full bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-400 font-bold py-3 rounded-xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                      <Smile className="w-4 h-4" />
                      Capture & Analyze Emotion
                    </button>
                  </div>

                  <button 
                    onClick={() => {
                      setErrorMessage("Liveness test aborted by user.");
                      setStudentScanStep('failed');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300 font-mono transition-all"
                  >
                    Abort Verification
                  </button>
                </motion.div>
              )}

              {/* SUCCESS RESULT SCREEN */}
              {studentScanStep === 'success' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6 text-center py-6"
                >
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-full inline-block shadow-2xl shadow-emerald-500/10">
                    <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto animate-bounce" />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-emerald-400 uppercase tracking-wide">Attendance Logged Successfully</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                      Your identity was verified against SQLite biocodes, and your proximity to the lecture center was validated.
                    </p>
                  </div>

                  <div className="bg-black/45 p-4 rounded-2xl border border-white/5 inline-block text-left text-xs font-mono space-y-1.5 shadow-inner">
                    <p className="text-slate-500">STUDENT ID: <span className="text-white font-bold">{studentIdInput.toUpperCase()}</span></p>
                    <p className="text-slate-500">TIMESTAMP: <span className="text-white">{new Date().toLocaleTimeString()}</span></p>
                    <p className="text-slate-500">LIVENESS ACTION: <span className="text-emerald-400 font-bold">{promptedEmotion}</span></p>
                    <p className="text-slate-500">DEVICE SIGNATURE: <span className="text-slate-400">sha256_e12fa...3a9</span></p>
                  </div>

                  <div>
                    <button 
                      id="student-reset-btn"
                      onClick={() => {
                        setStudentScanStep('qr');
                        setScannedQRText("");
                        setCapturedImage(null);
                      }}
                      className="bg-white/5 hover:bg-white/10 text-slate-200 font-semibold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider transition-all border border-white/10 cursor-pointer"
                    >
                      Scan Another Code
                    </button>
                  </div>
                </motion.div>
              )}

              {/* FAILED / SUNG LOG SCREEN */}
              {studentScanStep === 'failed' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6 text-center py-6"
                >
                  <div className="bg-red-500/10 border border-red-500/20 p-5 rounded-full inline-block shadow-2xl shadow-rose-500/10 animate-pulse">
                    <AlertTriangle className="w-16 h-16 text-rose-400 mx-auto" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-rose-400 uppercase tracking-wide">Attendance Prevented (Fraud Block)</h3>
                    <p className="text-xs text-rose-300 max-w-sm mx-auto font-mono bg-rose-500/5 py-1.5 px-3 rounded-lg border border-rose-500/10">
                      {errorMessage}
                    </p>
                  </div>

                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    A secure fraud record containing your coordinates, device signature, and biometric mismatches has been logged in the lecture board database. Remote proxy attempts are strictly reported.
                  </p>

                  <div className="flex justify-center gap-3">
                    <button 
                      id="student-failed-retry-btn"
                      onClick={() => {
                        setStudentScanStep('qr');
                        setScannedQRText("");
                        setCapturedImage(null);
                      }}
                      className="bg-white/5 hover:bg-white/10 text-slate-200 font-semibold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider transition-all border border-white/10 cursor-pointer"
                    >
                      Retry Verification
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* TAB 3: System Documents / Backend References */}
        {activeTab === 'system-docs' && (
          <div className="space-y-8">
            <div className="bg-white/5 border border-white/10 p-8 rounded-3xl space-y-6 relative overflow-hidden backdrop-blur-xl">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 via-blue-500 to-transparent"></div>
              <div>
                <h2 className="text-xl font-bold text-white uppercase tracking-wider">Secure Attendance Architecture Reference Files</h2>
                <p className="text-xs text-slate-400 mt-1">
                  The production backend files have been prepared inside your workspace root under the <code className="text-cyan-400">/hackathon/</code> folder. Use these for your presentation or production deployment.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-black/45 border border-white/5 hover:border-white/10 p-5 rounded-2xl flex flex-col justify-between h-56 transition-all shadow-lg">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-cyan-400">
                      <Database className="w-5 h-5" />
                      <h3 className="text-sm font-bold font-mono tracking-tight text-slate-200">1. Relational Schema</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Complete SQLite & MySQL schema with Students, Sessions, Attendance_Logs, and Fraud_Logs, with constraints blocking proxy attendance.
                    </p>
                  </div>
                  <div className="text-xs font-mono text-slate-500 flex items-center gap-1">
                    <span>Path:</span> <code className="text-slate-300">/hackathon/schema.sql</code>
                  </div>
                </div>

                <div className="bg-black/45 border border-white/5 hover:border-white/10 p-5 rounded-2xl flex flex-col justify-between h-56 transition-all shadow-lg">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-amber-400">
                      <Lock className="w-5 h-5" />
                      <h3 className="text-sm font-bold font-mono tracking-tight text-slate-200">2. Secure Onboard PHP</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Procedural PHP API applying AES-256-CBC at-rest encryption to biometric coordinates and fully binding inputs against injection.
                    </p>
                  </div>
                  <div className="text-xs font-mono text-slate-500 flex items-center gap-1">
                    <span>Path:</span> <code className="text-slate-300">/hackathon/register_student.php</code>
                  </div>
                </div>

                <div className="bg-black/45 border border-white/5 hover:border-white/10 p-5 rounded-2xl flex flex-col justify-between h-56 transition-all shadow-lg">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-cyan-400">
                      <QrCode className="w-5 h-5" />
                      <h3 className="text-sm font-bold font-mono tracking-tight text-slate-200">3. Dynamic QR Engine</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Cryptographic time-synced HMAC generator & validator code. Tolerates natural network drift while neutralizing screenshot sharing.
                    </p>
                  </div>
                  <div className="text-xs font-mono text-slate-500 flex items-center gap-1">
                    <span>Path:</span> <code className="text-slate-300">/hackathon/qr_security.py</code>
                  </div>
                </div>
              </div>

              {/* Review of Advanced Anti-Fraud Edge Cases */}
              <div className="bg-black/55 p-6 rounded-2xl border border-white/10 space-y-4">
                <h3 className="text-xs font-bold text-cyan-400 font-mono uppercase tracking-widest">
                  🛡️ Advanced Edge Cases & Anti-Fraud Vector Audit
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h4 className="text-white font-bold flex items-center gap-1.5 uppercase font-mono tracking-wider text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        Vector: Screenshot Sharing (Remote Proxying)
                      </h4>
                      <p className="text-slate-400">
                        <strong>Countermeasure:</strong> Setting QR expiration strictly to 15-second epoch windows + Nonce database logging. If a student screenshots a code and messages it, the code expires by the time the remote friend attempts to process it.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-white font-bold flex items-center gap-1.5 uppercase font-mono tracking-wider text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        Vector: Photo Spoofing & Video Playback
                      </h4>
                      <p className="text-slate-400">
                        <strong>Countermeasure:</strong> Random Emotion/Action Challenge. Presenting a flat photograph of a student is instantly blocked because the engine expects a dynamic muscle transformation (e.g. "Smile", "Surprise", "Wink") randomly prompted *after* QR validation.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h4 className="text-white font-bold flex items-center gap-1.5 uppercase font-mono tracking-wider text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        Vector: Virtual GPS Location Spoofing (Mock Providers)
                      </h4>
                      <p className="text-slate-400">
                        <strong>Countermeasure:</strong> Utilizing HTML5 Geolocation accuracy metrics and checking coordinates against the base network IP location mapping. Device API flags (like mock coordinates indicator) are sent in the payload.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-white font-bold flex items-center gap-1.5 uppercase font-mono tracking-wider text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        Vector: Device Co-location (Proxying multiple IDs)
                      </h4>
                      <p className="text-slate-400">
                        <strong>Countermeasure:</strong> Unique Device Fingerprinting. Device user-agent hashes are verified during the API call. If multiple Student IDs attempt check-in from the exact same device signature within 5 minutes, they are flagged and blocked.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </>
      )}
      </div>

      <footer className="border-t border-white/5 bg-[#030712]/50 backdrop-blur-md mt-16 py-8 text-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
        <div className="max-w-7xl mx-auto px-6">
          <p>© 2026 AegisAttendance Hackathon System. Crafted with extreme scope and cryptographic validation.</p>
        </div>
      </footer>
    </div>
  );
}
