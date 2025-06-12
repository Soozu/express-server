const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Apply optional auth to all routes
router.use(optionalAuth);

// Validation rules
const reviewValidation = [
  body('tripId')
    .notEmpty()
    .withMessage('Trip ID is required')
    .isLength({ max: 36 })
    .withMessage('Invalid trip ID'),
  body('reviewerName')
    .notEmpty()
    .withMessage('Reviewer name is required')
    .isLength({ min: 2, max: 255 })
    .withMessage('Reviewer name must be between 2 and 255 characters'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('reviewText')
    .notEmpty()
    .withMessage('Review text is required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Review text must be between 10 and 2000 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
];

// Validation rules for platform reviews
const platformReviewValidation = [
  body('reviewerName')
    .notEmpty()
    .withMessage('Reviewer name is required')
    .isLength({ min: 2, max: 255 })
    .withMessage('Reviewer name must be between 2 and 255 characters'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('reviewText')
    .notEmpty()
    .withMessage('Review text is required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Review text must be between 10 and 2000 characters'),
  body('destination')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Destination must be less than 255 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
];

// Create a new review (handles both trip reviews and platform reviews)
router.post('/', async (req, res) => {
  try {
    const { tripId, reviewerName, rating, reviewText, email, destination } = req.body;

    // Determine if this is a trip review or platform review
    const isTripReview = tripId && !tripId.startsWith('review-');
    
    let validationRules;
    if (isTripReview) {
      // Use existing trip review validation
      validationRules = reviewValidation;
    } else {
      // Use platform review validation
      validationRules = platformReviewValidation;
    }

    // Validate the request
    await Promise.all(validationRules.map(validation => validation.run(req)));
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        details: errors.array()
      });
    }

    let review;

    if (isTripReview) {
      // Create trip-specific review
      // First check if trip exists
      const tripExists = await prisma.trip.findUnique({
        where: { id: tripId }
      });

      if (!tripExists) {
        return res.status(404).json({
          error: 'Trip not found',
          message: 'The specified trip does not exist'
        });
      }

      review = await prisma.tripReview.create({
        data: {
          tripId,
          reviewerName,
          rating,
          reviewText,
          email: email || null
        },
        select: {
          id: true,
          tripId: true,
          reviewerName: true,
          rating: true,
          reviewText: true,
          isApproved: true,
          createdAt: true,
          updatedAt: true
        }
      });
    } else {
      // Create platform review
      review = await prisma.platformReview.create({
        data: {
          reviewerName,
          rating,
          reviewText,
          destination: destination || null,
          email: email || null
        },
        select: {
          id: true,
          reviewerName: true,
          rating: true,
          reviewText: true,
          destination: true,
          isApproved: true,
          createdAt: true,
          updatedAt: true
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      review,
      type: isTripReview ? 'trip' : 'platform'
    });

  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      error: 'Failed to create review',
      message: 'An error occurred while creating the review'
    });
  }
});

// Create a platform review (for general travel experiences)
router.post('/platform', platformReviewValidation, async (req, res) => {
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

    const { reviewerName, rating, reviewText, destination, email } = req.body;

    // Create platform review
    const review = await prisma.platformReview.create({
      data: {
        reviewerName,
        rating,
        reviewText,
        destination: destination || null,
        email: email || null
      },
      select: {
        id: true,
        reviewerName: true,
        rating: true,
        reviewText: true,
        destination: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'Platform review created successfully',
      review
    });

  } catch (error) {
    console.error('Create platform review error:', error);
    res.status(500).json({
      error: 'Failed to create platform review',
      message: 'An error occurred while creating the platform review'
    });
  }
});

// Get reviews for a trip
router.get('/trip/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { page = 1, limit = 20, approved = 'true' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const where = { tripId };
    
    // Only show approved reviews by default
    if (approved === 'true') {
      where.isApproved = true;
    }

    // Get reviews with pagination
    const [reviews, total] = await Promise.all([
      prisma.tripReview.findMany({
        where,
        select: {
          id: true,
          reviewerName: true,
          rating: true,
          reviewText: true,
          isApproved: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.tripReview.count({ where })
    ]);

    // Calculate average rating
    const avgRating = await prisma.tripReview.aggregate({
      where: { tripId, isApproved: true },
      _avg: {
        rating: true
      }
    });

    res.json({
      success: true,
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      stats: {
        totalReviews: total,
        averageRating: avgRating._avg.rating ? parseFloat(avgRating._avg.rating.toFixed(1)) : 0
      }
    });

  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({
      error: 'Failed to fetch reviews',
      message: 'An error occurred while fetching reviews'
    });
  }
});

// Get review statistics for a trip
router.get('/trip/:tripId/stats', async (req, res) => {
  try {
    const { tripId } = req.params;

    // Get review statistics
    const [totalReviews, avgRating, ratingDistribution] = await Promise.all([
      prisma.tripReview.count({
        where: { tripId, isApproved: true }
      }),
      prisma.tripReview.aggregate({
        where: { tripId, isApproved: true },
        _avg: { rating: true }
      }),
      prisma.tripReview.groupBy({
        by: ['rating'],
        where: { tripId, isApproved: true },
        _count: { rating: true },
        orderBy: { rating: 'desc' }
      })
    ]);

    // Format rating distribution
    const distribution = {};
    for (let i = 1; i <= 5; i++) {
      distribution[i] = 0;
    }
    ratingDistribution.forEach(item => {
      distribution[item.rating] = item._count.rating;
    });

    res.json({
      success: true,
      stats: {
        totalReviews,
        averageRating: avgRating._avg.rating ? parseFloat(avgRating._avg.rating.toFixed(1)) : 0,
        ratingDistribution: distribution
      }
    });

  } catch (error) {
    console.error('Get review stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch review statistics',
      message: 'An error occurred while fetching review statistics'
    });
  }
});

// Get a specific review
router.get('/:reviewId', async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await prisma.tripReview.findUnique({
      where: { id: parseInt(reviewId) },
      select: {
        id: true,
        tripId: true,
        reviewerName: true,
        rating: true,
        reviewText: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!review) {
      return res.status(404).json({
        error: 'Review not found',
        message: 'The specified review could not be found'
      });
    }

    // Only show approved reviews to public
    if (!review.isApproved) {
      return res.status(404).json({
        error: 'Review not found',
        message: 'The specified review could not be found'
      });
    }

    res.json({
      success: true,
      review
    });

  } catch (error) {
    console.error('Get review error:', error);
    res.status(500).json({
      error: 'Failed to fetch review',
      message: 'An error occurred while fetching the review'
    });
  }
});

// Update review approval status (admin function)
router.put('/:reviewId/approve', async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { isApproved } = req.body;

    // Note: In a real application, you'd want to add admin authentication here
    // For now, this is a simple approval toggle

    const review = await prisma.tripReview.findUnique({
      where: { id: parseInt(reviewId) }
    });

    if (!review) {
      return res.status(404).json({
        error: 'Review not found',
        message: 'The specified review could not be found'
      });
    }

    const updatedReview = await prisma.tripReview.update({
      where: { id: parseInt(reviewId) },
      data: { isApproved: Boolean(isApproved) },
      select: {
        id: true,
        tripId: true,
        reviewerName: true,
        rating: true,
        reviewText: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      message: `Review ${isApproved ? 'approved' : 'unapproved'} successfully`,
      review: updatedReview
    });

  } catch (error) {
    console.error('Update review approval error:', error);
    res.status(500).json({
      error: 'Failed to update review approval',
      message: 'An error occurred while updating the review'
    });
  }
});

// Delete a review
router.delete('/:reviewId', async (req, res) => {
  try {
    const { reviewId } = req.params;

    // Note: In a real application, you'd want to add proper authorization here
    // to ensure only the review author or admin can delete

    const review = await prisma.tripReview.findUnique({
      where: { id: parseInt(reviewId) }
    });

    if (!review) {
      return res.status(404).json({
        error: 'Review not found',
        message: 'The specified review could not be found'
      });
    }

    await prisma.tripReview.delete({
      where: { id: parseInt(reviewId) }
    });

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });

  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      error: 'Failed to delete review',
      message: 'An error occurred while deleting the review'
    });
  }
});

// Get recent reviews (across all trips)
router.get('/recent/all', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const reviews = await prisma.tripReview.findMany({
      where: { isApproved: true },
      select: {
        id: true,
        tripId: true,
        reviewerName: true,
        rating: true,
        reviewText: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json({
      success: true,
      reviews
    });

  } catch (error) {
    console.error('Get recent reviews error:', error);
    res.status(500).json({
      error: 'Failed to fetch recent reviews',
      message: 'An error occurred while fetching recent reviews'
    });
  }
});

// Search reviews
router.get('/search/query', async (req, res) => {
  try {
    const { q, tripId, rating, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const where = { isApproved: true };

    if (tripId) {
      where.tripId = tripId;
    }

    if (rating) {
      where.rating = parseInt(rating);
    }

    if (q) {
      where.OR = [
        { reviewText: { contains: q } },
        { reviewerName: { contains: q } }
      ];
    }

    // Get reviews with pagination
    const [reviews, total] = await Promise.all([
      prisma.tripReview.findMany({
        where,
        select: {
          id: true,
          tripId: true,
          reviewerName: true,
          rating: true,
          reviewText: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.tripReview.count({ where })
    ]);

    res.json({
      success: true,
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      query: { q, tripId, rating }
    });

  } catch (error) {
    console.error('Search reviews error:', error);
    res.status(500).json({
      error: 'Failed to search reviews',
      message: 'An error occurred while searching reviews'
    });
  }
});

// Get overall platform review statistics and recent reviews
router.get('/platform/stats', async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    // Get statistics from both trip reviews and platform reviews
    const [
      tripReviewStats,
      platformReviewStats,
      tripReviewDistribution,
      platformReviewDistribution,
      recentTripReviews,
      recentPlatformReviews
    ] = await Promise.all([
      // Trip review statistics
      Promise.all([
        prisma.tripReview.count({ where: { isApproved: true } }),
        prisma.tripReview.aggregate({
          where: { isApproved: true },
          _avg: { rating: true },
          _sum: { rating: true }
        })
      ]),
      
      // Platform review statistics
      Promise.all([
        prisma.platformReview.count({ where: { isApproved: true } }),
        prisma.platformReview.aggregate({
          where: { isApproved: true },
          _avg: { rating: true },
          _sum: { rating: true }
        })
      ]),
      
      // Trip review rating distribution
      prisma.tripReview.groupBy({
        by: ['rating'],
        where: { isApproved: true },
        _count: { rating: true },
        orderBy: { rating: 'desc' }
      }),
      
      // Platform review rating distribution
      prisma.platformReview.groupBy({
        by: ['rating'],
        where: { isApproved: true },
        _count: { rating: true },
        orderBy: { rating: 'desc' }
      }),
      
      // Recent trip reviews
      prisma.tripReview.findMany({
        where: { isApproved: true },
        select: {
          id: true,
          tripId: true,
          reviewerName: true,
          rating: true,
          reviewText: true,
          email: true,
          createdAt: true,
          trip: {
            select: {
              tripName: true,
              destinations: {
                select: {
                  name: true,
                  city: true,
                  province: true
                },
                take: 1
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: Math.ceil(parseInt(limit) / 2)
      }),
      
      // Recent platform reviews
      prisma.platformReview.findMany({
        where: { isApproved: true },
        select: {
          id: true,
          reviewerName: true,
          rating: true,
          reviewText: true,
          destination: true,
          email: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: Math.ceil(parseInt(limit) / 2)
      })
    ]);

    // Combine statistics
    const totalTripReviews = tripReviewStats[0];
    const totalPlatformReviews = platformReviewStats[0];
    const totalReviews = totalTripReviews + totalPlatformReviews;

    // Calculate combined average rating
    const tripRatingSum = tripReviewStats[1]._sum.rating || 0;
    const platformRatingSum = platformReviewStats[1]._sum.rating || 0;
    const totalRatingSum = tripRatingSum + platformRatingSum;
    const averageRating = totalReviews > 0 ? parseFloat((totalRatingSum / totalReviews).toFixed(1)) : 0;

    // Combine rating distributions
    const combinedDistribution = {};
    for (let i = 1; i <= 5; i++) {
      combinedDistribution[i] = 0;
    }

    // Add trip review distribution
    tripReviewDistribution.forEach(item => {
      combinedDistribution[item.rating] += item._count.rating;
    });

    // Add platform review distribution
    platformReviewDistribution.forEach(item => {
      combinedDistribution[item.rating] += item._count.rating;
    });

    // Format rating distribution for frontend
    const distribution = [];
    for (let i = 5; i >= 1; i--) {
      const count = combinedDistribution[i];
      const percentage = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
      
      distribution.push({
        stars: i,
        count: count,
        percentage: percentage
      });
    }

    // Format and combine recent reviews
    const formattedTripReviews = recentTripReviews.map(review => {
      let destination = 'Philippines';
      if (review.trip && review.trip.destinations && review.trip.destinations.length > 0) {
        const dest = review.trip.destinations[0];
        destination = dest.city || dest.name || 'Philippines';
        if (dest.province && dest.province !== dest.city) {
          destination += `, ${dest.province}`;
        }
      }

      return {
        id: `trip-${review.id}`,
        name: review.reviewerName,
        location: destination,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(review.reviewerName)}&background=${getRandomColor()}&color=fff&size=150`,
        rating: review.rating,
        title: generateReviewTitle(review.rating),
        review: review.reviewText,
        destination: destination,
        tripDate: formatTripDate(review.createdAt),
        verified: true,
        type: 'trip'
      };
    });

    const formattedPlatformReviews = recentPlatformReviews.map(review => {
      const destination = review.destination || 'Philippines';

      return {
        id: `platform-${review.id}`,
        name: review.reviewerName,
        location: destination,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(review.reviewerName)}&background=${getRandomColor()}&color=fff&size=150`,
        rating: review.rating,
        title: generateReviewTitle(review.rating),
        review: review.reviewText,
        destination: destination,
        tripDate: formatTripDate(review.createdAt),
        verified: true,
        type: 'platform'
      };
    });

    // Combine and sort all reviews by date
    const allReviews = [...formattedTripReviews, ...formattedPlatformReviews]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      stats: {
        totalReviews,
        averageRating,
        ratingDistribution: distribution,
        breakdown: {
          tripReviews: totalTripReviews,
          platformReviews: totalPlatformReviews
        }
      },
      reviews: allReviews
    });

  } catch (error) {
    console.error('Get platform stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch platform statistics',
      message: 'An error occurred while fetching platform statistics'
    });
  }
});

// Helper function to generate random avatar colors
function getRandomColor() {
  const colors = ['1da1f2', '2e7d32', 'e91e63', 'ff9800', '9c27b0', '3f51b5', '009688', 'f44336', '4caf50', 'ff5722'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Helper function to generate review titles based on rating
function generateReviewTitle(rating) {
  const titles = {
    5: ['Amazing Experience!', 'Perfect Trip Planning', 'Highly Recommended!', 'Outstanding Service', 'Exceeded Expectations'],
    4: ['Great Experience', 'Very Satisfied', 'Good Trip Planning', 'Recommended', 'Pleasant Journey'],
    3: ['Decent Experience', 'Average Service', 'Okay Trip', 'Fair Planning', 'Could Be Better'],
    2: ['Below Average', 'Needs Improvement', 'Disappointing', 'Not Satisfied', 'Poor Experience'],
    1: ['Very Poor', 'Terrible Experience', 'Not Recommended', 'Waste of Time', 'Awful Service']
  };
  
  const titleArray = titles[rating] || titles[3];
  return titleArray[Math.floor(Math.random() * titleArray.length)];
}

// Helper function to format trip date
function formatTripDate(createdAt) {
  const date = new Date(createdAt);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  } else if (diffDays <= 365) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  } else {
    return date.getFullYear().toString();
  }
}

module.exports = router; 