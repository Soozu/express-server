const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create sample users
  const hashedPassword = await bcrypt.hash('password123', 12);
  
  const user1 = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      username: 'user',
      email: 'user@example.com',
      password: hashedPassword,
      firstName: 'John',
      lastName: 'Doe',
      role: 'user'
    }
  });

  const admin1 = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@example.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin'
    }
  });

  console.log('✅ Created sample users (1 user, 1 admin)');

  // Create sample trips
  const trip1 = await prisma.trip.upsert({
    where: { id: 'sample-trip-1' },
    update: {},
    create: {
      id: 'sample-trip-1',
      userId: user1.id,
      tripName: 'Amazing Philippines Adventure',
      destination: 'Philippines',
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-03-10'),
      budget: 50000,
      travelers: 2,
      status: 'active'
    }
  });

  const trip2 = await prisma.trip.upsert({
    where: { id: 'sample-trip-2' },
    update: {},
    create: {
      id: 'sample-trip-2',
      userId: admin1.id,
      tripName: 'Boracay Beach Getaway',
      destination: 'Boracay',
      startDate: new Date('2024-04-15'),
      endDate: new Date('2024-04-20'),
      budget: 25000,
      travelers: 1,
      status: 'active'
    }
  });

  console.log('✅ Created sample trips');

  // Create sample destinations
  await prisma.tripDestination.createMany({
    data: [
      {
        tripId: trip1.id,
        name: 'Rizal Park',
        city: 'Manila',
        province: 'Metro Manila',
        description: 'Historic park in the heart of Manila',
        category: 'Historical Site',
        rating: 4.2,
        budget: 0,
        latitude: 14.5832,
        longitude: 120.9794,
        operatingHours: '5:00 AM - 9:00 PM',
        orderIndex: 1
      },
      {
        tripId: trip1.id,
        name: 'Intramuros',
        city: 'Manila',
        province: 'Metro Manila',
        description: 'Historic walled city',
        category: 'Historical Site',
        rating: 4.5,
        budget: 500,
        latitude: 14.5906,
        longitude: 120.9754,
        operatingHours: '8:00 AM - 6:00 PM',
        orderIndex: 2
      },
      {
        tripId: trip2.id,
        name: 'White Beach',
        city: 'Boracay',
        province: 'Aklan',
        description: 'Famous white sand beach',
        category: 'Beach',
        rating: 4.8,
        budget: 0,
        latitude: 11.9674,
        longitude: 121.9248,
        operatingHours: '24 hours',
        orderIndex: 1
      }
    ],
    skipDuplicates: true
  });

  console.log('✅ Created sample destinations');

  // Create sample tickets
  await prisma.generatedTicket.createMany({
    data: [
      {
        ticketId: 'FL123ABC4567',
        ticketType: 'FLIGHT',
        userId: user1.id,
        includeTimestamp: true,
        metadata: {
          from: 'Manila',
          to: 'Cebu',
          airline: 'Philippine Airlines'
        }
      },
      {
        ticketId: 'HTL456DEF8901',
        ticketType: 'HOTEL',
        userId: user1.id,
        includeTimestamp: true,
        metadata: {
          hotelName: 'Boracay Beach Resort',
          checkIn: '2024-04-15',
          checkOut: '2024-04-20'
        }
      },
      {
        ticketId: 'BUS789GHI2345',
        ticketType: 'BUS',
        userId: admin1.id,
        includeTimestamp: true,
        metadata: {
          from: 'Manila',
          to: 'Baguio',
          company: 'Victory Liner'
        }
      }
    ],
    skipDuplicates: true
  });

  console.log('✅ Created sample tickets');

  // Create sample trip trackers
  await prisma.tripTracker.createMany({
    data: [
      {
        trackerId: 'TRK123ABC4567',
        tripId: trip1.id,
        email: 'friend1@example.com',
        travelerName: 'Alex Smith',
        phone: '+639123456789'
      },
      {
        trackerId: 'TRK456DEF8901',
        tripId: trip2.id,
        email: 'friend2@example.com',
        travelerName: 'Maria Garcia'
      }
    ],
    skipDuplicates: true
  });

  console.log('✅ Created sample trip trackers');

  // Create sample reviews
  await prisma.tripReview.createMany({
    data: [
      {
        tripId: trip1.id,
        reviewerName: 'Travel Enthusiast',
        rating: 5,
        reviewText: 'Amazing trip! The destinations were well-planned and the experience was unforgettable. Highly recommend visiting Rizal Park and Intramuros.',
        email: 'reviewer1@example.com'
      },
      {
        tripId: trip1.id,
        reviewerName: 'Adventure Seeker',
        rating: 4,
        reviewText: 'Great itinerary with good mix of historical and cultural sites. Manila has so much to offer!',
        email: 'reviewer2@example.com'
      },
      {
        tripId: trip2.id,
        reviewerName: 'Beach Lover',
        rating: 5,
        reviewText: 'Boracay is paradise! White Beach is absolutely stunning. Perfect for a relaxing getaway.',
        email: 'reviewer3@example.com'
      }
    ],
    skipDuplicates: true
  });

  console.log('✅ Created sample reviews');

  // Create sample user preferences
  await prisma.userPreference.createMany({
    data: [
      {
        userId: user1.id,
        preferenceKey: 'preferred_budget',
        preferenceValue: '30000'
      },
      {
        userId: user1.id,
        preferenceKey: 'preferred_destinations',
        preferenceValue: 'beaches,historical sites'
      },
      {
        userId: admin1.id,
        preferenceKey: 'preferred_budget',
        preferenceValue: '20000'
      },
      {
        userId: admin1.id,
        preferenceKey: 'preferred_destinations',
        preferenceValue: 'beaches,resorts'
      }
    ],
    skipDuplicates: true
  });

  console.log('✅ Created sample user preferences');

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📊 Sample data created:');
  console.log('- 2 Users (1 user, 1 admin)');
  console.log('- 2 Trips (Philippines Adventure, Boracay Getaway)');
  console.log('- 3 Destinations (Rizal Park, Intramuros, White Beach)');
  console.log('- 3 Tickets (Flight, Hotel, Bus)');
  console.log('- 2 Trip Trackers');
  console.log('- 3 Reviews');
  console.log('- 4 User Preferences');
  console.log('\n🔑 Login credentials:');
  console.log('- User: user@example.com | Password: password123 | Role: user');
  console.log('- Admin: admin@example.com | Password: password123 | Role: admin');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 