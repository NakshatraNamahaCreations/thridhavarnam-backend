const express = require('express');

const auth = require('../middleware/auth');

const router = express.Router();

const {
  createEnquiry,
  getEnquiries,
  getEnquiry,
  updateEnquiry,
  deleteEnquiry,
} = require('../controllers/enquiryController');


// Public website
router.post('/', createEnquiry);


// Admin panel — customer enquiries contain personal data, so admin-only.
router.get('/', auth, getEnquiries);
router.get('/:id', auth, getEnquiry);
router.put('/:id', auth, updateEnquiry);
router.delete('/:id', auth, deleteEnquiry);


module.exports = router;