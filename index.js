const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;  


app.use(cors());
app.use(express.json());

async function run() {

    try {

    app.get("/", async (req, res) => {
      res.send("Book-worm  server is getting ready...");
    
    
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
