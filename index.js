require('dotenv').config();
const express = require('express');
const cors = require('cors');


const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;  



app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nliquld.mongodb.net/?appName=Cluster0`


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function run() {

    try {

        await client.connect();

        console.log("MongoDB connected");
        const db = client.db("book-worm");
        const usersCollection = db.collection("users");
        const booksCollection = db.collection("books");
        const reviewsCollection = db.collection("reviews");

    app.get("/", async (req, res) => {
      res.send("Book-worm  server is getting ready...");
    });

    app.post("/users", async (req, res) => {
      try {
        const newUser = req.body;

        if (!newUser || !newUser.email) {
          return res.status(400).send({ message: "Invalid user data" });
        }

        const email = newUser.email;
        const existingUser = await usersCollection.findOne({ email });

        if (existingUser) {
          await usersCollection.updateOne(
            { email },
            { $set: { last_loged_in: new Date().toISOString() } }
          );
          return res
            .status(200)
            .json({ message: "User exists, last_logged_in updated" });
        }

        newUser.role = "user";
        newUser.created_at = new Date().toISOString();

        const result = await usersCollection.insertOne(newUser);

        res.status(201).send({
          message: "User created successfully",
          userId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).send({ message: "Error creating new user" });
      }
    });



    } catch (error) {
         res.status(500).send({ message: "Failed to fetch admin stats", error });
    }finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }

}

run().catch(console.dir);

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
}); 
