const express = require('express');
const path = require('path');
const axios = require('axios'); 
require("dotenv").config({ path: path.resolve(__dirname, 'credentialsDontPost/.env') });
const { MongoClient, ServerApiVersion } = require('mongodb');


const uri = `mongodb+srv://${process.env.MONGO_DB_USERNAME}:${process.env.MONGO_DB_PASSWORD}@cluster0.lblz1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function connectToDatabase() {
    try {
        await client.connect();
    } catch (e) {
        console.error("Error connecting to MongoDB:", e);
        process.exit(1);
    }
};


connectToDatabase();

const app = express();
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/search', async (req, res) => {
        const { query, searchType } = req.query;
    
        if (!query || !searchType) {
            return res.render('search', { books: null, query: '', searchType: 'title' });
        }
    
        try {
            const searchField = searchType === 'title' ? 'title' : 'author';
            const apiUrl = `http://openlibrary.org/search.json?${searchField}=${encodeURIComponent(query)}`;
    
            const response = await axios.get(apiUrl);
            const books = response.data.docs.map(doc => ({
                title: doc.title,
                author: doc.author_name ? doc.author_name.join(', ') : 'Unknown Author'
            }));
    
            res.render('search', { books, query, searchType });
        } catch (error) {
            console.error('Error fetching books:', error.message);
            res.render('search', { books: null, query, searchType });
        }
    });

app.get('/wishlist', async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.render('wishlist', { wishlist: null, message: null });
    }

    try {
        const wishlistCollection = client.db(process.env.MONGO_DB_NAME).collection(process.env.MONGO_COLLECTION);
        const userWishlist = await wishlistCollection.findOne({ email });

        if (userWishlist) {
            res.render('wishlist', { wishlist: userWishlist.books, email,  message: null });
        } else {
            res.render('wishlist', { wishlist: [], email, message: "No wishlist found for this email." });
        }
    } catch (error) {
        console.error('Error retrieving wishlist:', error.message);
        res.render('wishlist', { wishlist: null, email, message: "Failed to retrieve wishlist." });
    }
});

app.post('/wishlist', async (req, res) => {
    const { email, title, author } = req.body;

    if (!email || !title || !author) {
        return res.status(400).send("Email, title, and author are required!");
    }

    try {
        const wishlistCollection = client.db(process.env.MONGO_DB_NAME).collection(process.env.MONGO_COLLECTION);
        
        const userWishlist = await wishlistCollection.findOne({ email });

        if (userWishlist) {
            const result = await wishlistCollection.updateOne(
                { email },
                { $pull: { books: { title, author } } } 
            );

            if (result.modifiedCount === 0) {
                return res.status(404).send("Book not found in wishlist.");
            }

            res.render('confirmRemove', {email, title, author});
        } else {
            res.status(404).send("User wishlist not found.");
        }

    } catch (error) {
        console.error('Error removing from wishlist:', error.message);
        res.status(500).send("Failed to remove from wishlist.");
    }
});


app.post('/search', async (req, res) => {
    const { email, title, author } = req.body;

    if (!email || !title || !author) {
        return res.status(400).send("Email, title, and author are required!");
    }

    try {
        const wishlistCollection = client.db(process.env.MONGO_DB_NAME).collection(process.env.MONGO_COLLECTION);
        const userWishlist = await wishlistCollection.findOne({ email });

        if (userWishlist) {
            await wishlistCollection.updateOne(
                { email },
                { $addToSet: { books: { title, author } } } 
            );
        } else {
            await wishlistCollection.insertOne({
                email,
                books: [{ title, author }]
            });
        }

        res.render('confirmAddToWishlist',{email, title, author});


    } catch (error) {
        console.error('Error adding to wishlist:', error.message);
        res.status(500).send("Failed to add to wishlist.");
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});