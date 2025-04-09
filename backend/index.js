require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const app = express();

app.use(express.json());
app.use(cors());

// Token Verify Midddlewares
const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "Unauthorized access!!" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access!!" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hqlh5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Database
    const DB = client.db("Prime-Pillar");
    const apartmentCollection = DB.collection("Apartments");
    const agreementCollection = DB.collection("Agreements");
    const announcementCollection = DB.collection("Announcements");
    const usersCollection = DB.collection("Users");
    const couponsCollection = DB.collection("Coupons");
    const paymentCollection = DB.collection("Payments");
    const reviewsCollection = DB.collection("Reviews");

    // Verify admin
    const verifyAdmin = async (req, res, next) => {
      // console.log('data from verifyToken middleware--->', req.user?.email)
      const email = req.user?.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "admin")
        return res
          .status(403)
          .send({ message: "Forbidden Access! Admin Only Actions!" });

      next();
    };

    // Verify Member
    const verifyMember = async (req, res, next) => {
      const email = req.user?.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "member")
        return res
          .status(403)
          .send({ message: "Forbidden Access! Member Only Actions!" });

      next();
    };

    // JWT API
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "30d",
      });
      res.send({ token });
    });

    

    // Connect MongoDB Client
    // await client.connect();
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello From StayEase...");
});

app.listen(port, () => {
  console.log(`StayEase is running on port ${port}`);
});
