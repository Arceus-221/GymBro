const express = require('express');
const multer = require('multer');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const audioController = require('../controllers/audioController');

const upload = multer({
  storage: multer.memoryStorage(), // never write to disk on Render's ephemeral filesystem
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB hard cap
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/m4a', 'audio/mp4', 'audio/x-m4a', 'audio/wav'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_AUDIO_FORMAT'));
    }
    cb(null, true);
  },
});

// POST /api/audio/transcribe — multipart/form-data, field name: "audio"
router.post('/transcribe', verifyToken, upload.single('audio'), audioController.transcribe);

module.exports = router;
