const express = require('express');

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


// Admin panel
router.get('/', getEnquiries);
router.get('/:id', getEnquiry);
router.put('/:id', updateEnquiry);
router.delete('/:id', deleteEnquiry);


module.exports = router;