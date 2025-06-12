const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { optionalAuth, getSessionId, authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Apply session middleware to all routes
router.use(getSessionId);
router.use(optionalAuth);

// Validate a ticket ID
router.get('/:ticketId/validate', async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await prisma.generatedTicket.findUnique({
      where: { ticketId },
      select: {
        id: true,
        ticketId: true,
        ticketType: true,
        isUsed: true,
        usedAt: true,
        createdAt: true,
        metadata: true
      }
    });

    if (!ticket) {
      return res.json({
        success: true,
        valid: false,
        message: 'Ticket not found'
      });
    }

    res.json({
      success: true,
      valid: true,
      ticket: ticket
    });

  } catch (error) {
    console.error('Validate ticket error:', error);
    res.status(500).json({
      error: 'Failed to validate ticket',
      message: 'An error occurred while validating the ticket'
    });
  }
});

// Enhanced search for tickets with AI recommendation tracking
router.post('/search', [
  body('ticketId')
    .optional()
    .isString()
    .withMessage('Ticket ID must be a string'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Email must be valid'),
  body('query')
    .optional()
    .isString()
    .withMessage('Search query must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        details: errors.array()
      });
    }

    const { ticketId, email, query } = req.body;

    if (!ticketId && !email) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'Either ticketId or email must be provided'
      });
    }

    // If searching by ticket ID
    if (ticketId) {
      const ticket = await prisma.generatedTicket.findUnique({
        where: { ticketId },
        select: {
          id: true,
          ticketId: true,
          ticketType: true,
          isUsed: true,
          usedAt: true,
          createdAt: true,
          metadata: true,
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!ticket) {
        // Also check trip trackers
        const tracker = await prisma.tripTracker.findUnique({
          where: { trackerId: ticketId },
          include: {
            trip: {
              include: {
                destinations: true,
                routes: true
              }
            }
          }
        });

        if (tracker) {
          // Format the start date nicely
          const startDateFormatted = tracker.trip.startDate
            ? new Date(tracker.trip.startDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })
            : 'Not specified';

          return res.json({
            success: true,
            type: 'trip',
            trip: tracker.trip,
            tracker: {
              trackerId: tracker.trackerId,
              email: tracker.email,
              travelerName: tracker.travelerName,
              phone: tracker.phone,
              accessCount: tracker.accessCount,
              createdAt: tracker.createdAt,
              saveDate: tracker.saveDate,
              startDate: tracker.trip.startDate,
              startDateFormatted: startDateFormatted
            }
          });
        }

        return res.status(404).json({
          error: 'Not found',
          message: 'No ticket or trip tracker found with this ID'
        });
      }

      return res.json({
        success: true,
        type: 'ticket',
        ticket: ticket
      });
    }

    // If searching by email
    if (email) {
      const [tickets, tripTrackers] = await Promise.all([
        prisma.generatedTicket.findMany({
          where: {
            user: {
              email: email
            }
          },
          select: {
            id: true,
            ticketId: true,
            ticketType: true,
            isUsed: true,
            usedAt: true,
            createdAt: true,
            metadata: true
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.tripTracker.findMany({
          where: { email },
          include: {
            trip: {
              include: {
                destinations: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      return res.json({
        success: true,
        type: 'email_search',
        tickets: tickets,
        trip_trackers: tripTrackers.map(tracker => {
          // Format the start date nicely
          const startDateFormatted = tracker.trip.startDate
            ? new Date(tracker.trip.startDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })
            : 'Not specified';

          return {
            trackerId: tracker.trackerId,
            email: tracker.email,
            travelerName: tracker.travelerName,
            phone: tracker.phone,
            accessCount: tracker.accessCount,
            createdAt: tracker.createdAt,
            saveDate: tracker.saveDate,
            startDate: tracker.trip.startDate,
            startDateFormatted: startDateFormatted,
            trip: tracker.trip
          };
        })
      });
    }

  } catch (error) {
    console.error('Search tickets error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'An error occurred while searching for tickets'
    });
  }
});

module.exports = router; 