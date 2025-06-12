const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const { optionalAuth } = require('../middleware/auth');
const { sendTripTrackerEmail } = require('../utils/emailService');

const router = express.Router();
const prisma = new PrismaClient();

// Apply optional auth to all routes
router.use(optionalAuth);

// Validation rules
const createTrackerValidation = [
  body('tripId')
    .notEmpty()
    .withMessage('Trip ID is required')
    .isLength({ max: 36 })
    .withMessage('Invalid trip ID'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('travelerName')
    .optional()
    .isLength({ min: 2, max: 255 })
    .withMessage('Traveler name must be between 2 and 255 characters'),
  body('phone')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Phone number must be less than 50 characters'),
  body('saveDate')
    .optional()
    .isISO8601()
    .withMessage('Save date must be a valid date'),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date')
];

// Helper function to generate unique tracker ID
const generateTrackerId = () => {
  const prefix = 'TRK';
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${randomPart}${timestamp}`;
};

// Helper function to ensure unique tracker ID
const ensureUniqueTrackerId = async (maxAttempts = 10) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const trackerId = generateTrackerId();
    
    const existing = await prisma.tripTracker.findUnique({
      where: { trackerId }
    });
    
    if (!existing) {
      return trackerId;
    }
  }
  
  throw new Error('Unable to generate unique tracker ID after multiple attempts');
};

// Create a new trip tracker with AI recommendation data
router.post('/', createTrackerValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        details: errors.array()
      });
    }

    const { tripId, email, travelerName, phone, saveDate, startDate, expiresAt, aiRecommendationData } = req.body;

    // Check if trip exists
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, tripName: true, destination: true }
    });

    if (!trip) {
      return res.status(404).json({
        error: 'Trip not found',
        message: 'The specified trip could not be found'
      });
    }

    // Generate unique tracker ID
    const trackerId = await ensureUniqueTrackerId();

    // Create tracker with enhanced metadata
    const trackerData = {
      trackerId,
      tripId,
      email,
      travelerName: travelerName || null,
      phone: phone || null,
      saveDate: saveDate ? new Date(saveDate) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null
    };

    // Update trip start date if provided
    if (startDate) {
      await prisma.trip.update({
        where: { id: tripId },
        data: {
          startDate: new Date(startDate)
        }
      });
    } else {
      // If no start date provided, set to today's date by default
      await prisma.trip.update({
        where: { id: tripId },
        data: {
          startDate: new Date()
        }
      });
    }

    const tracker = await prisma.tripTracker.create({
      data: trackerData,
      select: {
        id: true,
        trackerId: true,
        tripId: true,
        email: true,
        travelerName: true,
        phone: true,
        saveDate: true,
        isActive: true,
        accessCount: true,
        expiresAt: true,
        createdAt: true
      }
    });

    // Get trip with destinations for email
    const tripWithDestinations = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        destinations: {
          orderBy: [
            { orderIndex: 'asc' },
            { addedAt: 'asc' }
          ]
        }
      }
    });

    // Send confirmation email
    try {
      const emailResult = await sendTripTrackerEmail(
        {
          email,
          travelerName,
          trackerId,
          saveDate
        },
        {
          tripName: tripWithDestinations.tripName,
          destination: tripWithDestinations.destination,
          destinations: tripWithDestinations.destinations
        }
      );
      
      if (emailResult.success) {
        console.log(`Trip tracker email sent successfully to ${email}`);
      } else {
        console.warn(`Failed to send trip tracker email to ${email}:`, emailResult.error);
      }
    } catch (emailError) {
      console.error('Error sending trip tracker email:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Trip tracker created successfully',
      tracker: {
        ...tracker,
        tripName: trip.tripName,
        destination: trip.destination,
        shareUrl: `${req.protocol}://${req.get('host')}/trip/${trackerId}`
      }
    });

  } catch (error) {
    console.error('Create tracker error:', error);
    res.status(500).json({
      error: 'Failed to create tracker',
      message: 'An error occurred while creating the trip tracker'
    });
  }
});

// Get trip by tracker ID
router.get('/:trackerId', async (req, res) => {
  try {
    const { trackerId } = req.params;
    const { email } = req.query;

    // Find tracker
    const tracker = await prisma.tripTracker.findUnique({
      where: { trackerId },
      include: {
        trip: {
          include: {
            destinations: {
              orderBy: [
                { orderIndex: 'asc' },
                { addedAt: 'asc' }
              ]
            },
            routes: {
              orderBy: { calculatedAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    if (!tracker) {
      return res.status(404).json({
        error: 'Tracker not found',
        message: 'The specified trip tracker could not be found'
      });
    }

    if (!tracker.isActive) {
      return res.status(410).json({
        error: 'Tracker inactive',
        message: 'This trip tracker has been deactivated'
      });
    }

    // Check if tracker has expired
    if (tracker.expiresAt && new Date() > tracker.expiresAt) {
      return res.status(410).json({
        error: 'Tracker expired',
        message: 'This trip tracker has expired'
      });
    }

    // Verify email if provided
    if (email && tracker.email !== email) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Invalid email for this tracker'
      });
    }

    // Update access count and last accessed
    await prisma.tripTracker.update({
      where: { trackerId },
      data: {
        accessCount: { increment: 1 },
        lastAccessed: new Date()
      }
    });

    // Format trip data
    const trip = tracker.trip;
    const tripData = {
      id: trip.id,
      tripName: trip.tripName,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      budget: trip.budget ? parseFloat(trip.budget) : 0,
      travelers: trip.travelers,
      status: trip.status,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      destinations: trip.destinations.map(dest => ({
        id: dest.id,
        destinationId: dest.destinationId,
        name: dest.name,
        city: dest.city,
        province: dest.province,
        description: dest.description,
        category: dest.category,
        rating: dest.rating ? parseFloat(dest.rating) : null,
        budget: dest.budget ? parseFloat(dest.budget) : null,
        latitude: dest.latitude ? parseFloat(dest.latitude) : null,
        longitude: dest.longitude ? parseFloat(dest.longitude) : null,
        operatingHours: dest.operatingHours,
        contactInformation: dest.contactInformation,
        orderIndex: dest.orderIndex
      })),
      tracker_info: {
        tracker_id: tracker.trackerId,
        email: tracker.email,
        traveler_name: tracker.travelerName,
        phone: tracker.phone,
        access_count: tracker.accessCount + 1,
        created_at: tracker.createdAt,
        save_date: tracker.saveDate,
        start_date_formatted: trip.startDate 
          ? new Date(trip.startDate).toLocaleDateString('en-US', {
              year: 'numeric', 
              month: 'long', 
              day: 'numeric'
            }) 
          : new Date().toLocaleDateString('en-US', {
              year: 'numeric', 
              month: 'long', 
              day: 'numeric'
            }) + ' (Today)'
      }
    };

    // Add route data if available
    if (trip.routes && trip.routes.length > 0) {
      const route = trip.routes[0];
      tripData.routeData = {
        points: route.routeData || [],
        distanceKm: route.distanceKm ? parseFloat(route.distanceKm) : 0,
        timeMin: route.timeMinutes || 0,
        source: route.routeSource
      };
    }

    res.json({
      success: true,
      trip: tripData
    });

  } catch (error) {
    console.error('Get trip by tracker error:', error);
    res.status(500).json({
      error: 'Failed to fetch trip',
      message: 'An error occurred while fetching the trip'
    });
  }
});

// Get trackers by email
router.get('/email/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const trackers = await prisma.tripTracker.findMany({
      where: {
        email,
        isActive: true
      },
      include: {
        trip: {
          select: {
            tripName: true,
            destination: true,
            startDate: true,
            endDate: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formattedTrackers = trackers.map(tracker => ({
      trackerId: tracker.trackerId,
      tripName: tracker.trip.tripName,
      destination: tracker.trip.destination,
      startDate: tracker.trip.startDate,
      endDate: tracker.trip.endDate,
      travelerName: tracker.travelerName,
      accessCount: tracker.accessCount,
      createdAt: tracker.createdAt,
      shareUrl: `${req.protocol}://${req.get('host')}/trip/${tracker.trackerId}`
    }));

    res.json({
      success: true,
      trackers: formattedTrackers,
      count: formattedTrackers.length
    });

  } catch (error) {
    console.error('Get trackers by email error:', error);
    res.status(500).json({
      error: 'Failed to fetch trackers',
      message: 'An error occurred while fetching trip trackers'
    });
  }
});

// Update tracker
router.put('/:trackerId', [
  body('travelerName')
    .optional()
    .isLength({ min: 2, max: 255 })
    .withMessage('Traveler name must be between 2 and 255 characters'),
  body('phone')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Phone number must be less than 50 characters'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Invalid expiration date format')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        details: errors.array()
      });
    }

    const { trackerId } = req.params;
    const { travelerName, phone, expiresAt } = req.body;
    const { email } = req.query;

    // Find tracker
    const tracker = await prisma.tripTracker.findUnique({
      where: { trackerId }
    });

    if (!tracker) {
      return res.status(404).json({
        error: 'Tracker not found',
        message: 'The specified trip tracker could not be found'
      });
    }

    // Verify email access
    if (email && tracker.email !== email) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Invalid email for this tracker'
      });
    }

    // Update tracker
    const updateData = {};
    if (travelerName !== undefined) updateData.travelerName = travelerName || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const updatedTracker = await prisma.tripTracker.update({
      where: { trackerId },
      data: updateData,
      select: {
        id: true,
        trackerId: true,
        tripId: true,
        email: true,
        travelerName: true,
        phone: true,
        isActive: true,
        accessCount: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      message: 'Tracker updated successfully',
      tracker: updatedTracker
    });

  } catch (error) {
    console.error('Update tracker error:', error);
    res.status(500).json({
      error: 'Failed to update tracker',
      message: 'An error occurred while updating the tracker'
    });
  }
});

// Deactivate tracker
router.delete('/:trackerId', async (req, res) => {
  try {
    const { trackerId } = req.params;
    const { email } = req.query;

    // Find tracker
    const tracker = await prisma.tripTracker.findUnique({
      where: { trackerId }
    });

    if (!tracker) {
      return res.status(404).json({
        error: 'Tracker not found',
        message: 'The specified trip tracker could not be found'
      });
    }

    // Verify email access
    if (email && tracker.email !== email) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Invalid email for this tracker'
      });
    }

    // Deactivate tracker
    await prisma.tripTracker.update({
      where: { trackerId },
      data: { isActive: false }
    });

    res.json({
      success: true,
      message: 'Tracker deactivated successfully'
    });

  } catch (error) {
    console.error('Deactivate tracker error:', error);
    res.status(500).json({
      error: 'Failed to deactivate tracker',
      message: 'An error occurred while deactivating the tracker'
    });
  }
});

// Get tracker statistics
router.get('/:trackerId/stats', async (req, res) => {
  try {
    const { trackerId } = req.params;
    const { email } = req.query;

    // Find tracker
    const tracker = await prisma.tripTracker.findUnique({
      where: { trackerId },
      select: {
        trackerId: true,
        email: true,
        accessCount: true,
        lastAccessed: true,
        createdAt: true,
        isActive: true,
        expiresAt: true
      }
    });

    if (!tracker) {
      return res.status(404).json({
        error: 'Tracker not found',
        message: 'The specified trip tracker could not be found'
      });
    }

    // Verify email access
    if (email && tracker.email !== email) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Invalid email for this tracker'
      });
    }

    res.json({
      success: true,
      stats: {
        trackerId: tracker.trackerId,
        accessCount: tracker.accessCount,
        lastAccessed: tracker.lastAccessed,
        createdAt: tracker.createdAt,
        isActive: tracker.isActive,
        isExpired: tracker.expiresAt ? new Date() > tracker.expiresAt : false,
        expiresAt: tracker.expiresAt
      }
    });

  } catch (error) {
    console.error('Get tracker stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch tracker statistics',
      message: 'An error occurred while fetching tracker statistics'
    });
  }
});

// Validate tracker (check if it exists and is active)
router.get('/:trackerId/validate', async (req, res) => {
  try {
    const { trackerId } = req.params;

    const tracker = await prisma.tripTracker.findUnique({
      where: { trackerId },
      select: {
        trackerId: true,
        isActive: true,
        expiresAt: true,
        trip: {
          select: {
            tripName: true,
            destination: true
          }
        }
      }
    });

    if (!tracker) {
      return res.json({
        success: false,
        valid: false,
        reason: 'Tracker not found'
      });
    }

    if (!tracker.isActive) {
      return res.json({
        success: false,
        valid: false,
        reason: 'Tracker is inactive'
      });
    }

    if (tracker.expiresAt && new Date() > tracker.expiresAt) {
      return res.json({
        success: false,
        valid: false,
        reason: 'Tracker has expired'
      });
    }

    res.json({
      success: true,
      valid: true,
      tracker: {
        trackerId: tracker.trackerId,
        tripName: tracker.trip.tripName,
        destination: tracker.trip.destination
      }
    });

  } catch (error) {
    console.error('Validate tracker error:', error);
    res.status(500).json({
      error: 'Failed to validate tracker',
      message: 'An error occurred while validating the tracker'
    });
  }
});

module.exports = router; 