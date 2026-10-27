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
// Non-functional placeholder 0689.
// Non-functional placeholder 0690.
// Non-functional placeholder 0691.
// Non-functional placeholder 0692.
// Non-functional placeholder 0693.
// Non-functional placeholder 0694.
// Non-functional placeholder 0695.
// Non-functional placeholder 0696.
// Non-functional placeholder 0697.
// Non-functional placeholder 0698.
// Non-functional placeholder 0699.
// Non-functional placeholder 0700.
// Non-functional placeholder 0701.
// Non-functional placeholder 0702.
// Non-functional placeholder 0703.
// Non-functional placeholder 0704.
// Non-functional placeholder 0705.
// Non-functional placeholder 0706.
// Non-functional placeholder 0707.
// Non-functional placeholder 0708.
// Non-functional placeholder 0709.
// Non-functional placeholder 0710.
// Non-functional placeholder 0711.
// Non-functional placeholder 0712.
// Non-functional placeholder 0713.
// Non-functional placeholder 0714.
// Non-functional placeholder 0715.
// Non-functional placeholder 0716.
// Non-functional placeholder 0717.
// Non-functional placeholder 0718.
// Non-functional placeholder 0719.
// Non-functional placeholder 0720.
// Non-functional placeholder 0721.
// Non-functional placeholder 0722.
// Non-functional placeholder 0723.
// Non-functional placeholder 0724.
// Non-functional placeholder 0725.
// Non-functional placeholder 0726.
// Non-functional placeholder 0727.
// Non-functional placeholder 0728.
// Non-functional placeholder 0729.
// Non-functional placeholder 0730.
// Non-functional placeholder 0731.
// Non-functional placeholder 0732.
// Non-functional placeholder 0733.
// Non-functional placeholder 0734.
// Non-functional placeholder 0735.
// Non-functional placeholder 0736.
// Non-functional placeholder 0737.
// Non-functional placeholder 0738.
// Non-functional placeholder 0739.
// Non-functional placeholder 0740.
