const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, param, query, validationResult } = require('express-validator');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const prisma = new PrismaClient();

// Validation middleware
const validateTrip = [
  body('tripName').optional().isLength({ min: 1, max: 100 }).withMessage('Trip name must be 1-100 characters'),
  body('destination').optional().isLength({ min: 1, max: 100 }).withMessage('Destination must be 1-100 characters'),
  body('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
  body('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  body('budget').optional().isFloat({ min: 0 }).withMessage('Budget must be a positive number'),
  body('travelers').optional().isInt({ min: 1, max: 50 }).withMessage('Travelers must be between 1 and 50'),
];

const validateDestination = [
  body('name').notEmpty().isLength({ min: 1, max: 255 }).withMessage('Destination name is required'),
  body('city').optional().isLength({ max: 100 }).withMessage('City must be max 100 characters'),
  body('province').optional().isLength({ max: 100 }).withMessage('Province must be max 100 characters'),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description must be max 1000 characters'),
  body('category').optional().isLength({ max: 50 }).withMessage('Category must be max 50 characters'),
  body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
  body('budget').optional().isFloat({ min: 0 }).withMessage('Budget must be positive'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Helper function to get user/session identifier
const getUserIdentifier = (req) => {
  if (req.user) {
    return { userId: req.user.id, sessionId: null };
  } else {
    // For non-authenticated users, use session ID from headers
    const sessionId = req.headers['x-session-id'];
    return { userId: null, sessionId };
  }
};

// Create a new trip
router.post('/', optionalAuth, validateTrip, handleValidationErrors, async (req, res) => {
  try {
    const { tripName, destination, startDate, endDate, budget, travelers = 1 } = req.body;
    const { userId, sessionId } = getUserIdentifier(req);

    const trip = await prisma.trip.create({
      data: {
        id: uuidv4(),
        userId,
        sessionId,
        tripName,
        destination,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        budget: budget ? parseFloat(budget) : null,
        travelers: parseInt(travelers),
        status: 'active'
      },
      include: {
        destinations: {
          orderBy: { orderIndex: 'asc' }
        },
        routes: {
          orderBy: { calculatedAt: 'desc' },
          take: 1
        }
      }
    });

    res.json({
      success: true,
      message: 'Trip created successfully',
      trip: {
        ...trip,
        trip_id: trip.id,
        route_data: trip.routes[0]?.routeData || null
      }
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create trip',
      error: error.message
    });
  }
});

// Get a specific trip
router.get('/:tripId', optionalAuth, param('tripId').isUUID().withMessage('Invalid trip ID'), handleValidationErrors, async (req, res) => {
  try {
    const { tripId } = req.params;
    const { userId, sessionId } = getUserIdentifier(req);

    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId: userId },
          { sessionId: sessionId }
        ]
      },
      include: {
        destinations: {
          orderBy: { orderIndex: 'asc' }
        },
        routes: {
          orderBy: { calculatedAt: 'desc' },
          take: 1
        }
      }
    });

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    res.json({
      success: true,
      trip: {
        ...trip,
        route_data: trip.routes[0]?.routeData || null
      }
    });
  } catch (error) {
    console.error('Error getting trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trip',
      error: error.message
    });
  }
});

// Update a trip
router.put('/:tripId', optionalAuth, param('tripId').isUUID(), validateTrip, handleValidationErrors, async (req, res) => {
  try {
    const { tripId } = req.params;
    const { tripName, destination, startDate, endDate, budget, travelers, status } = req.body;
    const { userId, sessionId } = getUserIdentifier(req);

    // Check if trip exists and belongs to user/session
    const existingTrip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId: userId },
          { sessionId: sessionId }
        ]
      }
    });

    if (!existingTrip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    const updateData = {};
    if (tripName !== undefined) updateData.tripName = tripName;
    if (destination !== undefined) updateData.destination = destination;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : new Date();
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (budget !== undefined) updateData.budget = budget ? parseFloat(budget) : null;
    if (travelers !== undefined) updateData.travelers = parseInt(travelers);
    if (status !== undefined) updateData.status = status;

    const trip = await prisma.trip.update({
      where: { id: tripId },
      data: updateData,
      include: {
        destinations: {
          orderBy: { orderIndex: 'asc' }
        },
        routes: {
          orderBy: { calculatedAt: 'desc' },
          take: 1
        }
      }
    });

    res.json({
      success: true,
      message: 'Trip updated successfully',
      trip: {
        ...trip,
        route_data: trip.routes[0]?.routeData || null
      }
    });
  } catch (error) {
    console.error('Error updating trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update trip',
      error: error.message
    });
  }
});

// Delete a trip
router.delete('/:tripId', optionalAuth, param('tripId').isUUID(), handleValidationErrors, async (req, res) => {
  try {
    const { tripId } = req.params;
    const { userId, sessionId } = getUserIdentifier(req);

    // Check if trip exists and belongs to user/session
    const existingTrip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId: userId },
          { sessionId: sessionId }
        ]
      }
    });

    if (!existingTrip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    await prisma.trip.delete({
      where: { id: tripId }
    });

    res.json({
      success: true,
      message: 'Trip deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete trip',
      error: error.message
    });
  }
});

// Add destination to trip
router.post('/:tripId/destinations', optionalAuth, param('tripId').isUUID(), validateDestination, handleValidationErrors, async (req, res) => {
  try {
    const { tripId } = req.params;
    const { userId, sessionId } = getUserIdentifier(req);
    const destinationData = req.body;

    // Check if trip exists and belongs to user/session
    const existingTrip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId: userId },
          { sessionId: sessionId }
        ]
      }
    });

    if (!existingTrip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    // Get the next order index
    const lastDestination = await prisma.tripDestination.findFirst({
      where: { tripId },
      orderBy: { orderIndex: 'desc' }
    });

    const orderIndex = (lastDestination?.orderIndex || 0) + 1;

    const destination = await prisma.tripDestination.create({
      data: {
        tripId,
        name: destinationData.name,
        city: destinationData.city,
        province: destinationData.province,
        description: destinationData.description,
        category: destinationData.category,
        rating: destinationData.rating ? parseFloat(destinationData.rating) : null,
        budget: destinationData.budget ? parseFloat(destinationData.budget) : null,
        latitude: destinationData.latitude ? parseFloat(destinationData.latitude) : null,
        longitude: destinationData.longitude ? parseFloat(destinationData.longitude) : null,
        operatingHours: destinationData.operatingHours,
        contactInformation: destinationData.contactInformation,
        orderIndex
      }
    });

    // Get updated trip with all destinations
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        destinations: {
          orderBy: { orderIndex: 'asc' }
        },
        routes: {
          orderBy: { calculatedAt: 'desc' },
          take: 1
        }
      }
    });

    res.json({
      success: true,
      message: 'Destination added successfully',
      destination_id: destination.id,
      trip: {
        ...trip,
        route_data: trip.routes[0]?.routeData || null
      }
    });
  } catch (error) {
    console.error('Error adding destination:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add destination',
      error: error.message
    });
  }
});

// Remove destination from trip
router.delete('/:tripId/destinations/:destinationId', optionalAuth, param('tripId').isUUID(), param('destinationId').isInt(), handleValidationErrors, async (req, res) => {
  try {
    const { tripId, destinationId } = req.params;
    const { userId, sessionId } = getUserIdentifier(req);

    // Check if trip exists and belongs to user/session
    const existingTrip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId: userId },
          { sessionId: sessionId }
        ]
      }
    });

    if (!existingTrip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    // Check if destination exists in this trip
    const destination = await prisma.tripDestination.findFirst({
      where: {
        id: parseInt(destinationId),
        tripId
      }
    });

    if (!destination) {
      return res.status(404).json({
        success: false,
        message: 'Destination not found in this trip'
      });
    }

    await prisma.tripDestination.delete({
      where: { id: parseInt(destinationId) }
    });

    // Get updated trip with remaining destinations
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        destinations: {
          orderBy: { orderIndex: 'asc' }
        },
        routes: {
          orderBy: { calculatedAt: 'desc' },
          take: 1
        }
      }
    });

    res.json({
      success: true,
      message: 'Destination removed successfully',
      trip: {
        ...trip,
        route_data: trip.routes[0]?.routeData || null
      }
    });
  } catch (error) {
    console.error('Error removing destination:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove destination',
      error: error.message
    });
  }
});

// Save route to trip
router.post('/:tripId/route', optionalAuth, param('tripId').isUUID(), handleValidationErrors, async (req, res) => {
  try {
    const { tripId } = req.params;
    const { userId, sessionId } = getUserIdentifier(req);
    const { routeData, distanceKm, timeMinutes, routeSource } = req.body;

    // Check if trip exists and belongs to user/session
    const existingTrip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId: userId },
          { sessionId: sessionId }
        ]
      }
    });

    if (!existingTrip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    const route = await prisma.tripRoute.create({
      data: {
        tripId,
        routeData: routeData || null,
        distanceKm: distanceKm ? parseFloat(distanceKm) : null,
        timeMinutes: timeMinutes ? parseInt(timeMinutes) : null,
        routeSource: routeSource || 'manual'
      }
    });

    res.json({
      success: true,
      message: 'Route saved successfully',
      route: {
        id: route.id,
        routeData: route.routeData,
        distanceKm: route.distanceKm,
        timeMinutes: route.timeMinutes,
        routeSource: route.routeSource,
        calculatedAt: route.calculatedAt
      }
    });
  } catch (error) {
    console.error('Error saving route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save route',
      error: error.message
    });
  }
});

// Get user trips (authenticated users only)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const userId = req.user.id;

    const where = { userId };
    if (status) {
      where.status = status;
    }

    const trips = await prisma.trip.findMany({
      where,
      include: {
        destinations: {
          orderBy: { orderIndex: 'asc' }
        },
        routes: {
          orderBy: { calculatedAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            destinations: true,
            trackers: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    const totalTrips = await prisma.trip.count({ where });

    const formattedTrips = trips.map(trip => ({
      ...trip,
      route_data: trip.routes[0]?.routeData || null,
      destination_count: trip._count.destinations,
      tracker_count: trip._count.trackers
    }));

    res.json({
      success: true,
      trips: formattedTrips,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalTrips,
        pages: Math.ceil(totalTrips / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting user trips:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trips',
      error: error.message
    });
  }
});

module.exports = router; 