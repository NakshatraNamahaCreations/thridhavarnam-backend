const Enquiry = require('../models/enquiry');

function generateRef() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();

  return `BSPK-${ts.slice(-5)}-${rand}`;
}

// CREATE ENQUIRY
exports.createEnquiry = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      weave,
      occasion,
      budget,
      timeline,
      notes,
    } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        message: 'Name, email and phone are required',
      });
    }

    const enquiry = await Enquiry.create({
      ref: generateRef(),
      name,
      email,
      phone,
      weave,
      occasion,
      budget,
      timeline,
      notes,
      status: 'new',
    });

    res.status(201).json(enquiry);
  } catch (error) {
    console.error('Create enquiry error:', error);

    res.status(500).json({
      message: 'Failed to create enquiry',
    });
  }
};

// GET ALL ENQUIRIES
exports.getEnquiries = async (req, res) => {
  try {
    const enquiries = await Enquiry.find()
      .sort({ createdAt: -1 });

    res.status(200).json(enquiries);
  } catch (error) {
    console.error('Get enquiries error:', error);

    res.status(500).json({
      message: 'Failed to fetch enquiries',
    });
  }
};

// GET SINGLE ENQUIRY
exports.getEnquiry = async (req, res) => {
  try {
    const enquiry = await Enquiry.findById(req.params.id);

    if (!enquiry) {
      return res.status(404).json({
        message: 'Enquiry not found',
      });
    }

    res.status(200).json(enquiry);
  } catch (error) {
    console.error('Get enquiry error:', error);

    res.status(500).json({
      message: 'Failed to fetch enquiry',
    });
  }
};

// UPDATE ENQUIRY
exports.updateEnquiry = async (req, res) => {
  try {
    const enquiry = await Enquiry.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!enquiry) {
      return res.status(404).json({
        message: 'Enquiry not found',
      });
    }

    res.status(200).json(enquiry);
  } catch (error) {
    console.error('Update enquiry error:', error);

    res.status(500).json({
      message: 'Failed to update enquiry',
    });
  }
};

// DELETE ENQUIRY
exports.deleteEnquiry = async (req, res) => {
  try {
    const enquiry = await Enquiry.findByIdAndDelete(req.params.id);

    if (!enquiry) {
      return res.status(404).json({
        message: 'Enquiry not found',
      });
    }

    res.status(200).json({
      message: 'Enquiry deleted successfully',
    });
  } catch (error) {
    console.error('Delete enquiry error:', error);

    res.status(500).json({
      message: 'Failed to delete enquiry',
    });
  }
};