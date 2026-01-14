require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const e = require("express");
const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nliquld.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    console.log("MongoDB connected");
    const db = client.db("book-worm");
    const usersCollection = db.collection("users");
    const booksCollection = db.collection("books");
    const reviewsCollection = db.collection("reviews");
    const genreCollection = db.collection("genre");
    const tutorialCollection = db.collection("tutorials");

    const varifyAccessToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      try {
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "your_jwt_secret_key"
        );
        req.user = decoded;

        next();
      } catch (error) {
        res.status(403).send({ message: "forbidden access" });
      }
    };

    const varifyAdmin = async (req, res, next) => {
      const { role } = req.user;
      if (!role || role !== "admin") {
        return res.status(403).send({
          message: "forbidden access",
        });
      }
      next();
    };

    const varifyMember = async (req, res, next) => {
      const { role } = req?.user;
      if (!role || role !== "user") {
        return res.status(403).send({
          message: "forbidden access",
        });
      }
      next();
    };

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

        const hashedPassword = await bcrypt.hash(newUser.password, 12);

        const user = {
          email: newUser.email,
          password: hashedPassword,
          name: newUser.name,
          role: "user",
          profile_picture: newUser.photo || "",
          created_at: new Date().toISOString(),
        };

        const result = await usersCollection.insertOne(user);

        res.status(201).send({
          message: "User created successfully",
          userId: result.insertedId,
          
        });
      } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).send({ message: "Error creating new user" });
      }
    });

    app.get("/users", varifyAccessToken, varifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.status(200).send(users);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch users", error });
      }
    });

    app.delete(
      "/users:id",
      varifyAccessToken,
      varifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const query = { _id: new ObjectId(id) };
          const result = await usersCollection.deleteOne(query);
          res.status(200).send(result);
        } catch (error) {
          res.status(500).send({ message: "Unable to update the user", error });
        }
      }
    );

    app.post("/login", async (req, res) => {
      try {
        const { email, password } = req.body;

        const user = await usersCollection.findOne({ email });
          
    if (!user) {
      return res.status(401).send({ message: "Authentication failed" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).send({ message: "Authentication failed" });
    }
        const accessToken = jwt.sign(
          {
            id: user._id,
            role: user.role,
          },
          process.env.JWT_SECRET,

          { expiresIn: "1d" }
        );

        const refreshToken = jwt.sign(
          { id: user._id },
          process.env.JWT_REFRESH_SECRET,
          { expiresIn: "7d" }
        );
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { refreshToken } }
        );

        res.cookie("refreshtoken", refreshToken, {
          httpOnly: true,
          secure: true,
          sameSite: "None",
          maxAge: 7 * 24 * 60 * 60 * 1000, //7 days
        });

        res.send({
          accessToken,
          user: { id: user._id, email: user.email, role: user.role },
        });
      } catch (error) {
        res.status(500).send({ message: "Login failed", error });
      }
    });

    app.post("/refresh", async (req, res) => {
      try {
        const token = req.cookies.refreshtoken;
        if (!token) {
          return res.status(400).send({ message: "No refresh token provided" });
        }
        const user = await usersCollection.findOne({ refreshToken: token });

        if (!user) {
          return res.status(401).send({ message: "Invalid refresh token" });
        }
        jwt.verify(token, process.env.JWT_REFRESH_SECRET, (err, decoded) => {
          if (err || user._id.toString() !== decoded.id) {
            return res.status(401).send({ message: "Invalid refresh token" });
          }
        });

        const newAccessToken = jwt.sign(
          {
            id: user._id,
            role: user.role,
          },
          process.env.JWT_SECRET,
          { expiresIn: "1d" }
        );
        res.send({
          accessToken: newAccessToken,
          user: { id: user._id, email: user.email, role: user.role },
        });
      } catch (error) {
        res.status(500).send({ message: "Token generation failed", error });
      }
    });

    app.post("/logout", async (req, res) => {
      try {
        const token = req.cookies.refreshtoken;
        if (!token) {
          return res.status(400).send({ message: "No refresh token provided" });
        } else {
          await usersCollection.updateOne(
            { refreshToken: token },
            { $unset: { refreshToken: "" } }
          );
        }
        res.clearCookie("refreshtoken");
        res.sendStatus(204);
      } catch (error) {
        res.status(500).send({ message: "Logout failed", error });
      }
    });

    app.get("/books", varifyAccessToken, async (req, res) => {
      try {
        const { page, limit } = req.query;

        const pageInNumber = Number(page) || 1;
        const limitInNumber = Number(limit) || 6;

        const skip = (pageInNumber - 1) * limitInNumber;
        const query = {};
        const options = {
          sort: { added_on: -1 },
        };

        const total = await booksCollection.countDocuments(query);
        const courts = await booksCollection
          .find(query, options)
          .skip(skip)
          .limit(limitInNumber)
          .toArray();
        res.send({
          courts,
          totalPages: Math.ceil(total / limitInNumber),
          totalCourts: total,
        });
      } catch (error) {
        res.status(500).send({ message: "Error getting courts data", error });
      }
    });

    app.get("/books/:id", varifyAccessToken, async (req, res) => {
      try {
        const { id } = req.params;
        const query = {
          _id: new ObjectId(id),
        };

        const singleBook = await booksCollection.findOne(query);
        res.send(singleBook);
      } catch (error) {
        res.status(500).send({ message: "error getting data", error });
      }
    });

    app.post("/books", varifyAccessToken, varifyAdmin, async (req, res) => {
      try {
        const newBook = req.body;
        const result = await booksCollection.insertOne(newBook);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Error posting books data", error });
      }
    });

    app.put("/books/:id", varifyAccessToken, varifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const updatedBook = req.body;
        const updatedDoc = {
          $set: updatedBook,
        };
        const query = { _id: new ObjectId(id) };
        const result = await booksCollection.updateOne(query, updatedDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "error updating court", error });
      }
    });

    app.patch(
      "/books/:id",
      varifyAccessToken,
      varifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { inStock } = req.body;

          const query = {
            _id: new ObjectId(id),
          };

          const updateDoc = { $set: { inStock } };
          const result = await booksCollection.updateOne(query, updateDoc);

          if (result.matchedCount === 0) {
            return res.status(404).send({ message: "Book not found" });
          }

          res.send(result);
        } catch (error) {
          res.status(500).send({ message: "Error updating data", error });
        }
      }
    );

    app.delete(
      "/book/:id",
      varifyAccessToken,
      varifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const query = { _id: new ObjectId(id) };
          const result = await booksCollection.deleteOne(query);
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: "error deleting data", error });
        }
      }
    );

    app.get("/genre", varifyAccessToken, async (req, res) => {
      try {
        const genre = await genreCollection.find().toArray();
        res.status(200).send(genre);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch genre", error });
      }
    });

    app.post("/genre", varifyAccessToken, varifyAdmin, async (req, res) => {
      try {
        const newGenre = req.body;
        const result = await booksCollection.insertOne(newGenre);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch genre", error });
      }
    });

    app.put("/genre/:id", varifyAccessToken, varifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const updatedGenre = req.body;
        const updatedDoc = {
          $set: updatedGenre,
        };

        const query = { _id: new ObjectId(id) };
        const result = await genreCollection.updateOne(query, updatedDoc);

        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch genre", error });
      }
    });

    app.delete("/genre/:id", varifyAccessToken, async (req, res) => {
      try {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await genreCollection.deleteOne(query);
        res.status(204).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update genre", error });
      }
    });

    app.get("/tutorials", varifyAccessToken, async (req, res) => {
      try {
        const tutorials = await tutorialCollection.find().toArray();
        res.status(200).send(tutorials);
      } catch (error) {
        res.status(500).send({ message: "Unable to fetch tutorials", error });
      }
    });

    app.post("/tutorials", varifyAccessToken, varifyAdmin, async (req, res) => {
      try {
        const newTutorial = req.body;

        const result = await tutorialCollection.insertOne(newTutorial);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Unable to post tutorials", error });
      }
    });

    app.delete("/tutorials/:id", varifyAccessToken, varifyAdmin,  async(req, res)=> {
      try {
          const {id} = req.params;
          const query = {_id : new ObjectId(id)};

          const result = await tutorialCollection.deleteOne(query)
        res.status(204).send(result);
      } catch (error) {
        res.status(500).send({message : "Error deleting user", error})
      }
    }); 

    app.put("/tutorials/:id", varifyAccessToken, varifyAdmin, async(req, res)=> {
      try {
        const {id}  = req.params;
        const query = {id : new ObjectId(id)}

        const updatedTutorials = req.body;
        const updatedDoc = {
          $set : updatedTutorials
        }
        const result = await tutorialCollection.updateOne(query, updatedDoc);

        res.status(200).message(result);
        
      } catch (error) {
        res.status(500).send({message : "Error updating the tutorials data", error})
      }
    })

    
    
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch admin stats", error });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
