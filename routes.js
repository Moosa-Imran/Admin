const express = require('express');
const path = require('path');
const { ObjectId } = require('mongodb');
const multer = require('multer');
const nodemailer = require('nodemailer');;
const router = express.Router();
const emailTemplates = require('./emailTemplates');
const dotenv = require('dotenv');

dotenv.config();

// News Image storage
const newsStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/news'); 
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// Multer instance
const uploadNewsImage = multer({ storage: newsStorage });


// Protected Route Middleware
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    } else {
        return res.redirect('/');
    }
}

// Create a transporter using Namecheap SMTP settings
const transporter = nodemailer.createTransport({
    host: "smtp.privateemail.com",
    port: 587,
    secure: false, // Set to true if using port 465
    auth: {
        user: process.env.EMAIL, // Email from your .env file
        pass: process.env.PASSWORD // Password from your .env file
    }
});

// Route for Fetching User's Detials
router.get('/fetchUser', async (req, res) => {
    // Get the user ID from the session
    const userId = req.session.user ? req.session.user.id : null;
    const usersDb = req.app.locals.usersDb;

    try {
        // Check if the user ID exists
        if (!userId) {
            return res.status(401).json({ status: false, message: 'User not authenticated.' });
        }

        // Search for the user in the Customers collection
        const user = await usersDb.collection('Admin').findOne({ _id: new ObjectId(userId) });
        if (user) {
            // If user is found, send the user data along with status
            res.status(200).json({ status: true, user });
        } else {
            // If user does not exist, send status false
            res.status(404).json({ status: false, message: 'User not found.' });
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ status: false, message: 'Internal server error' });
    }
});

// Route for Fetching Users
router.get('/allusers', isAuthenticated, async (req, res) => {
    try {
        // Connect to the Customers collection in userDb
        const userDb = req.app.locals.usersDb;
        const customersCollection = userDb.collection('Subscription');

        // Fetch all documents from the Customers collection
        const customers = await customersCollection.find({}).toArray();

        // Send the retrieved documents as a JSON response
        res.status(200).json(customers);
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Unable to fetch customers' });
    }
});

// Login Route
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const usersDb = req.app.locals.usersDb;
    try {
        // Search for the user by username or email
        const user = await usersDb.collection('Admin').findOne({ username: username });

        // If user is not found
        if (!user) {
            return res.status(401).json({ status: 'invalid', message: 'Invalid username.' });
        }

        if (user.password !== password) {
            return res.status(401).json({ status: 'incorrect', message: 'Incorrect password.' });
        }

        // If valid, store user session and create cookie
        req.session.user = {
            id: user._id,
            username: user.username,
        };

        // Send success response
        res.status(200).json({ status: 'success', message: 'Login successful!' });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

// Route for Fetching Links
router.get('/fetchLinks', async (req, res) => {
    const DataDb = req.app.locals.dataDb;

    try {
        const whatsapp = await DataDb.collection('Links').findOne({ "platform": "whatsapp" });
        const telegram = await DataDb.collection('Links').findOne({ "platform": "telegram" });

        res.status(200).json({ whatsapplink: whatsapp.link, telegramlink: telegram.link });
    } catch (error) {
        console.error('Error fetching links:', error);
        res.status(500).json({ status: false, message: 'Internal server error' });
    }
});

// Route for Editing Links
router.post('/editLinks', isAuthenticated, async (req, res) => {
    const { whatsappLink, telegramLink } = req.body;
    const DataDb = req.app.locals.dataDb;

    try {
        await DataDb.collection('Links').updateOne({ "platform": "whatsapp" }, { $set: { "link": whatsappLink } });
        await DataDb.collection('Links').updateOne({ "platform": "telegram" }, { $set: { "link": telegramLink } });

        res.status(200).json({ status: true, message: 'Links updated successfully!' });
    } catch (error) {
        console.error('Error updating links:', error);
        res.status(500).json({ status: false, message: 'Internal server error' });
    }
});

//Route for adding News
router.post('/addNews', isAuthenticated, uploadNewsImage.single('newsImage'), async (req, res) => {
    const { newsHeading, newsDescription } = req.body;
    const newsImage = req.file.filename;
    const DataDb = req.app.locals.dataDb;

    try {
        await DataDb.collection('News').insertOne({ newsHeading, newsDescription, newsImage, newsDate: new Date() });
        res.status(200).json({ status: true, message: 'News added successfully!' });
    } catch (error) {
        console.error('Error adding news:', error);
        res.status(500).json({ status: false, message: 'Internal server error' });
    }
});

// Route to fetch news
router.get('/getNews', async (req, res) => {
    const DataDb = req.app.locals.dataDb;

    try {
        const news = await DataDb.collection('News').find().sort({ newsDate: -1 }).toArray(); // Fetch sorted news
        res.status(200).json({ status: true, news });
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
})

// Route to delete news when /deleteNews/${newsId} is called with DELETE method 
router.delete('/deleteNews/:newsId', isAuthenticated, async (req, res) => {
    const { newsId } = req.params;
    const DataDb = req.app.locals.dataDb;

    try {
        await DataDb.collection('News').deleteOne({ _id: new ObjectId(newsId) });
        res.status(200).json({ status: true, message: 'News deleted successfully!' });
    } catch (error) {
        console.error('Error deleting news:', error);
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

// Route to get payment by status
router.get('/payments/status', isAuthenticated, async (req, res) => {
    const { status } = req.query;

    if (!status) {
        return res.status(400).json({ message: 'Status is required' });
    }

    try {
        const investments = await req.app.locals.dataDb.collection('Payments').find({ status }).toArray();

        // Return an empty array if no investments are found
        return res.status(200).json(investments);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

// Route to get payment by ID
router.get('/investments/:investId', isAuthenticated, async (req, res) => {
    const { investId } = req.params; // Get investId from URL parameters

    try {
        // Connect to the Investments collection and find the investment by ID
        const investment = await req.app.locals.dataDb.collection('Payments').findOne({ _id: new ObjectId(investId) });

        // Check if the investment was found
        if (!investment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        // Send the found investment as a response
        return res.status(200).json(investment);
    } catch (error) {
        console.error(error); // Log the error for debugging
        return res.status(500).json({ message: 'Internal server error' }); // Send server error response
    }
});

// Update payment status route
router.put('/investmentControl/:investId', isAuthenticated, async (req, res) => {
    const investId = req.params.investId; // Extracting investment ID from route parameters
    const { status} = req.query; // Extracting status and comment from query parameters

    // Check if the investment exists in the Investments collection
    const investment = await req.app.locals.dataDb.collection('Payments').findOne({ _id: new ObjectId(investId) });

    if (!investment) {
        return res.status(404).json({ message: 'Payment not found' });
    }

    if (status === 'active') {
        const resolveDate = new Date(); 
    
        await req.app.locals.dataDb.collection('Payments').updateOne(
            { _id: new ObjectId(investId) },
            {
                $set: {
                    status: 'resolved', // Set status to 'resolved'
                    resolveDate // Set the resolveDate to the current date
                }
            }
        );
    
        return res.status(200).json({ message: 'Payment resolved successfully' });
    } else {
        return res.status(400).json({ message: 'Invalid status' });
    }
});


// Route for Logout
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'Logout failed. Please try again later.' });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logout successful!' });
    });
});


// Dashboard Route (Protected)
router.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'dashboard.html'));
});
router.get('/add-news', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'add-news.html'));
});
router.get('/delete-news', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'delete-news.html'));
});
router.get('/edit-links', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'edit-links.html'));
});
router.get('/users', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'users.html'));
});
router.get('/pending-payment', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'pending-payments.html'));
});
router.get('/ressolved-payment', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'resolved-payments.html'));
});

module.exports = router;