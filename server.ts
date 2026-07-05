import express from 'express';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const PORT = 3000;

const SUPABASE_URL = "https://emylqqnhotwhfgqrdaci.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVteWxxcW5ob3R3aGZncXJkYWNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMjg2NTMsImV4cCI6MjA5ODcwNDY1M30.WSU2ErgJeYO4lTPbyhAVuPOOAxuFcZvXj-dZuaYdhGY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Lecturers
  app.post('/api/lecturers', async (req, res) => {
    const { email, name, password_hash } = req.body;
    try {
      const { data, error } = await supabase.from('lecturers').insert([{ email, name, password_hash }]).select();
      if (error) throw error;
      res.status(201).json({ id: data[0]?.id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/lecturers', async (req, res) => {
    try {
      const { data, error } = await supabase.from('lecturers').select('*');
      if (error) throw error;
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Courses
    app.post('/api/courses', async (req, res) => {
    const { lecturerId, name } = req.body;
    try {
      // lecturerId is actually email from frontend
      let { data: lecData } = await supabase.from('lecturers').select('id').eq('email', lecturerId).single();
      let lecId = lecData ? lecData.id : 1; // fallback to 1 if not found

      const { data, error } = await supabase.from('courses').insert([{ lecturer_id: lecId, name }]).select();
      if (error) throw error;
      res.status(201).json({ id: data[0]?.id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/courses', async (req, res) => {
    try {
      const { data, error } = await supabase.from('courses').select('*');
      if (error) throw error;
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Sessions
  app.post('/api/sessions', async (req, res) => {
    const { courseId, sessionSecret, startTime, active } = req.body;
    try {
      const { data, error } = await supabase.from('sessions').insert([{ course_id: courseId, session_secret: sessionSecret, start_time: startTime, active: active !== undefined ? active : 1 }]).select();
      if (error) throw error;
      res.status(201).json({ id: data[0]?.id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/sessions', async (req, res) => {
    try {
      const { data, error } = await supabase.from('sessions').select('*');
      if (error) throw error;
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Enrollments
  app.post('/api/enrollments', async (req, res) => {
    const { studentId, courseId } = req.body;
    try {
      const { error } = await supabase.from('enrollments').insert([{ studentId, courseId }]);
      if (error) throw error;
      res.status(201).json({ message: 'Enrolled successfully' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/enrollments', async (req, res) => {
    try {
      const { data, error } = await supabase.from('enrollments').select('*');
      if (error) throw error;
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Attendance
  app.post('/api/attendance', async (req, res) => {
    const { sessionId, studentId, studentName, checkedInAt, distance, emotion, status } = req.body;
    
    if (!studentId || !studentName) {
      return res.status(400).json({ error: 'Missing required fields: studentId and studentName are mandatory.' });
    }

    try {
      // Robust DB logging using Supabase. Under the hood, this uses parameterized queries, preventing SQL injection.
      const payload = {
        session_id: sessionId || null,
        student_id: studentId,
        student_name: studentName,
        checked_in_at: checkedInAt || new Date().toISOString(),
        distance: distance !== undefined ? Number(distance) : null,
        emotion: emotion || null,
        status: status || 'PENDING'
      };

      const { data, error } = await supabase.from('attendance_logs').insert([payload]).select();
      
      if (error) {
        // Log the exact database error to a server-side file instead of just swallowing or dumping it entirely to the client
        
        const logMsg = `[${new Date().toISOString()}] DB_INSERT_ERROR in /api/attendance: ${JSON.stringify(error)} | Payload: ${JSON.stringify(payload)}\n`;
        fs.appendFileSync('server_errors.log', logMsg);
        
        throw error;
      }
      
      res.status(201).json({ 
        message: 'Attendance logged successfully',
        logId: data[0]?.id
      });
    } catch (error: any) {
      console.error('Attendance log error:', error);
      if (error?.code === '23503') {
        return res.status(404).json({ error: 'Database record not found (Foreign Key Constraint Failed)', details: error.message });
      }
      // Mask internal database details from the client-facing 500 error
      res.status(500).json({ 
         error: 'Failed to log attendance due to an internal server error. Please check server_errors.log for details.',
         code: error.code || 'UNKNOWN_ERR'
      });
    }
  });
  app.get('/api/attendance', async (req, res) => {
    try {
      const { data, error } = await supabase.from('attendance_logs').select('*').order('id', { ascending: false });
      if (error) throw error;
      const mappedData = data.map((item: any) => ({
        ...item,
                studentId: item.student_id || item.studentId,
        studentName: item.student_name || item.studentName,
        lecturerEmail: item.lecturer_email || item.lecturerEmail,
        sessionId: item.session_id || item.sessionId,
        checkedInAt: item.checked_in_at || item.checkedInAt,
        fraudType: item.fraud_type || item.fraudType,
        deviceFingerprint: item.device_fingerprint || item.deviceFingerprint,
        encryptedFaceVector: item.encrypted_face_vector || item.encryptedFaceVector
      }));
      res.status(200).json(mappedData);
    } catch (error: any) {
      console.error('Database query error:', error);
      res.status(500).json({ error: 'Failed to retrieve attendance logs', details: error.message });
    }
  });

  // Fraud
  app.post('/api/fraud', async (req, res) => {
    const { sessionId, studentId, fraudType, distance, timestamp, deviceFingerprint } = req.body;
    
    try {
      const { error } = await supabase.from('fraud_logs').insert([{
        session_id: sessionId || null,
        student_id: studentId,
        fraud_type: fraudType,
        distance,
        timestamp,
        device_fingerprint: deviceFingerprint
      }]);
      
      if (error) throw error;
      
      res.status(201).json({ 
        message: 'Fraud logged successfully'
      });
    } catch (error: any) {
      console.error('Fraud log error:', error);
      if (error?.code === '23503') {
         return res.status(404).json({ error: 'Database record not found (Foreign Key Constraint Failed)', details: error.message });
      }
      res.status(500).json({ error: 'Failed to log fraud', details: error.message });
    }
  });

  app.get('/api/fraud', async (req, res) => {
    try {
      const { data, error } = await supabase.from('fraud_logs').select('*').order('id', { ascending: false });
      if (error) throw error;
      const mappedData = (data as any[]).map((item: any) => ({
        ...item,
        studentId: item.student_id || item.studentId,
        studentName: item.student_name || item.studentName,
        sessionId: item.session_id || item.sessionId,
        checkedInAt: item.checked_in_at || item.checkedInAt,
        fraudType: item.fraud_type || item.fraudType,
        deviceFingerprint: item.device_fingerprint || item.deviceFingerprint,
        encryptedFaceVector: item.encrypted_face_vector || item.encryptedFaceVector
      }));
      res.status(200).json(mappedData);
    } catch (error: any) {
      console.error('Database query error:', error);
      res.status(500).json({ error: 'Failed to retrieve fraud logs', details: error.message });
    }
  });

  // Students
    app.post('/api/students', async (req, res) => {
    try {
      const { studentId, name, encryptedFaceVector, status, lecturerEmail } = req.body;
      
      console.log(`[POST /api/students] Received payload: ${JSON.stringify({ studentId, name, status })}`);

      if (!studentId || !name || !encryptedFaceVector) {
        console.warn('[POST /api/students] Missing required fields in payload.');
        return res.status(400).json({ error: 'Missing required fields: studentId, name, and encryptedFaceVector are required.' });
      }

            const { data, error } = await supabase.from('students').insert([{
        student_id: studentId,
        name,
        encrypted_face_vector: encryptedFaceVector,
        status: status || 'ACTIVE',
        lecturer_email: lecturerEmail
      }]).select();
      
      if (error) {
        if (error.code === '23505') {
           return res.status(409).json({ error: 'Student ID already exists.', details: error.message });
        }
        throw error;
      }
      
      console.log('[POST /api/students] Transaction committed successfully.');
      
      return res.status(201).json({ 
        message: 'Student saved successfully',
        student: data[0]
      });
    } catch (error: any) {
      console.error('[POST /api/students] CRITICAL DATABASE ERROR:', error);

      return res.status(500).json({ 
        error: 'Failed to save student to database', 
        details: error.message || 'Unknown database execution error'
      });
    }
  });

    app.get('/api/students', async (req, res) => {
    try {
      const lecturerEmail = req.query.lecturerEmail;
      console.log('[GET /api/students] Fetching students from database for lecturer:', lecturerEmail);
      
            let query = supabase.from('students').select('student_id, name, encrypted_face_vector, status, lecturer_email').order('student_id', { ascending: false });
      
      if (lecturerEmail) {
         query = query.eq('lecturer_email', lecturerEmail);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      console.log(`[GET /api/students] Successfully retrieved ${data.length} students.`);
      const mappedData = (data as any[]).map((item: any) => ({
        ...item,
        studentId: item.student_id || item.studentId,
        studentName: item.student_name || item.studentName,
        sessionId: item.session_id || item.sessionId,
        checkedInAt: item.checked_in_at || item.checkedInAt,
        fraudType: item.fraud_type || item.fraudType,
        deviceFingerprint: item.device_fingerprint || item.deviceFingerprint,
        encryptedFaceVector: item.encrypted_face_vector || item.encryptedFaceVector
      }));
      res.status(200).json(mappedData);
    } catch (error: any) {
      console.error('[GET /api/students] CRITICAL DATABASE ERROR:', error);
      res.status(500).json({ error: 'Failed to retrieve students', details: error.message || 'Unknown database execution error' });
    }
  });



  app.post('/api/detect-emotion', async (req, res) => {
    try {
      const { image, expectedEmotion } = req.body;
      if (!image) {
        return res.status(400).json({ error: 'Missing image data' });
      }

      // Initialize Gemini
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Data
                }
              },
              {
                text: `Does the person in this image clearly exhibit the following action/emotion: "${expectedEmotion}"? Reply only with YES or NO.`
              }
            ]
          }
        ]
      });
      
      const text = response.text.trim().toUpperCase();
      const isMatch = text.includes('YES');
      
      res.json({ match: isMatch, detectedText: text });
    } catch (error) {
      console.error('Emotion detection error:', error);
      res.status(500).json({ error: 'Failed to detect emotion' });
    }
  });

  // Vite middleware
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
