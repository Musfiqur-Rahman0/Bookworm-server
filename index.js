require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const e = require("express");
const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

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

    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.status(200).send(users);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch users", error });
      }
    });

    app.post("/login", async (req, res) => {
      try {
        const { email, password } = req.body;
        console.log(email, password);

        const user = await usersCollection.findOne({ email });
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!user || !isPasswordValid) {
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

        res.send({ accessToken, user: { id: user._id, email: user.email, role: user.role } });
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
        res.send({ accessToken: newAccessToken });
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
