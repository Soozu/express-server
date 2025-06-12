const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter
const createTransporter = () => {
  console.log('Setting up email transporter with:', {
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.EMAIL_USER,
      // Not logging password for security reasons
    }
  });
  
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    debug: process.env.NODE_ENV !== 'production',
    logger: process.env.NODE_ENV !== 'production'
  });
};

// Send trip tracker confirmation email
const sendTripTrackerEmail = async (trackerData, tripData) => {
  try {
    const transporter = createTransporter();
    
    const { email, travelerName, trackerId, saveDate } = trackerData;
    const { tripName, destination, destinations } = tripData;
    
    // Format destinations list
    const destinationsList = destinations && destinations.length > 0 
      ? destinations.map((dest, index) => `${index + 1}. ${dest.name} - ${dest.city || 'Unknown City'}`).join('\n')
      : 'No destinations added yet';
    
    // Format save date
    const formattedSaveDate = saveDate ? new Date(saveDate).toLocaleDateString() : new Date().toLocaleDateString();
    
    const mailOptions = {
      from: process.env.FROM_EMAIL || process.env.EMAIL_USER,
      to: email,
      subject: `🎯 Your Trip Tracker ID: ${trackerId} - ${tripName || destination}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Trip Tracker Confirmation</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f8f9fa;
            }
            .container {
              background: white;
              border-radius: 10px;
              padding: 30px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #e9ecef;
            }
            .header h1 {
              color: #2c3e50;
              margin: 0;
              font-size: 28px;
            }
            .tracker-id {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 15px 25px;
              border-radius: 8px;
              text-align: center;
              font-size: 24px;
              font-weight: bold;
              letter-spacing: 2px;
              margin: 20px 0;
              box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            }
            .trip-details {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .trip-details h3 {
              color: #495057;
              margin-top: 0;
              border-bottom: 1px solid #dee2e6;
              padding-bottom: 10px;
            }
            .destinations {
              background: white;
              padding: 15px;
              border-radius: 6px;
              border-left: 4px solid #28a745;
              margin: 15px 0;
            }
            .destinations pre {
              margin: 0;
              font-family: inherit;
              white-space: pre-wrap;
              color: #495057;
            }
            .instructions {
              background: #e3f2fd;
              padding: 20px;
              border-radius: 8px;
              border-left: 4px solid #2196f3;
              margin: 25px 0;
            }
            .instructions h3 {
              color: #1976d2;
              margin-top: 0;
            }
            .instructions ol {
              margin: 10px 0;
              padding-left: 20px;
            }
            .instructions li {
              margin: 8px 0;
              color: #424242;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e9ecef;
              color: #6c757d;
              font-size: 14px;
            }
            .highlight {
              background: #fff3cd;
              padding: 2px 6px;
              border-radius: 4px;
              font-weight: bold;
              color: #856404;
            }
            @media (max-width: 600px) {
              body {
                padding: 10px;
              }
              .container {
                padding: 20px;
              }
              .tracker-id {
                font-size: 20px;
                padding: 12px 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎯 Trip Tracker Saved Successfully!</h1>
              <p>Hello ${travelerName || 'Traveler'}! Your trip has been saved and is ready to track.</p>
            </div>
            
            <div class="tracker-id">
              ${trackerId}
            </div>
            
            <div class="trip-details">
              <h3>📋 Trip Information</h3>
              <p><strong>Trip Name:</strong> ${tripName || destination}</p>
              <p><strong>Main Destination:</strong> ${destination}</p>
              <p><strong>Saved Date:</strong> ${formattedSaveDate}</p>
              <p><strong>Traveler:</strong> ${travelerName || 'Not specified'}</p>
              
              <div class="destinations">
                <h4>🗺️ Planned Destinations:</h4>
                <pre>${destinationsList}</pre>
              </div>
            </div>
            
            <div class="instructions">
              <h3>🔍 How to Access Your Trip</h3>
              <ol>
                <li>Visit the <strong>Ticket Tracker</strong> page on WerTigo</li>
                <li>Enter your Tracker ID: <span class="highlight">${trackerId}</span></li>
                <li>Click "Track Trip" to view your complete itinerary</li>
                <li>Share this Tracker ID with travel companions to let them view the trip</li>
              </ol>
            </div>
            
            <div class="footer">
              <p>🌟 <strong>WerTigo Travel Planner</strong></p>
              <p>This email was sent because you saved a trip tracker on our platform.</p>
              <p>Keep this email safe - you'll need the Tracker ID to access your trip!</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
🎯 Trip Tracker Saved Successfully!

Hello ${travelerName || 'Traveler'}!

Your trip tracker has been created successfully. Here are the details:

TRACKER ID: ${trackerId}

Trip Information:
- Trip Name: ${tripName || destination}
- Main Destination: ${destination}
- Saved Date: ${formattedSaveDate}
- Traveler: ${travelerName || 'Not specified'}

Planned Destinations:
${destinationsList}

How to Access Your Trip:
1. Visit the Ticket Tracker page on WerTigo
2. Enter your Tracker ID: ${trackerId}
3. Click "Track Trip" to view your complete itinerary
4. Share this Tracker ID with travel companions

Keep this email safe - you'll need the Tracker ID to access your trip!

🌟 WerTigo Travel Planner
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Trip tracker email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('Error sending trip tracker email:', error);
    return { success: false, error: error.message };
  }
};

// Test email configuration
const testEmailConnection = async () => {
  try {
    console.log('Creating email transporter for testing...');
    const transporter = createTransporter();
    
    console.log('Verifying transporter configuration...');
    await transporter.verify();
    
    console.log('Email service is ready');
    return true;
  } catch (error) {
    console.error('Email service configuration error:', error);
    
    // More specific error handling
    if (error.code === 'EAUTH') {
      console.error('Authentication failed. This is likely due to:');
      console.error('1. Using your regular password instead of an App Password');
      console.error('2. App Password is incorrect or has been revoked');
      console.error('3. The email account has 2FA enabled but no App Password is being used');
    } else if (error.code === 'ESOCKET') {
      console.error('Connection error. This could be due to:');
      console.error('1. Incorrect SMTP host or port');
      console.error('2. Network connectivity issues');
      console.error('3. Firewall blocking the connection');
    }
    
    return false;
  }
};

module.exports = {
  sendTripTrackerEmail,
  testEmailConnection
}; 