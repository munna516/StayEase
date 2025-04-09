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
    const DB = client.db("Stay-Ease");
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

    // Users
    app.post("/users", async (req, res) => {
      const user = req.body;
      if (!user.email) return;
      const isFound = await usersCollection.findOne({ email: user.email });
      if (isFound) return;
      user.role = "user";
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // Get a role By
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // Get all apartments
    app.get("/apartments", async (req, res) => {
      const result = await apartmentCollection.find().toArray();
      res.send(result);
    });

    // Get Featured Apartments
    app.get("/featured-apartments", async (req, res) => {
      const result = await apartmentCollection
        .find()
        .sort({ price: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // Get Apartment search by range
    app.get("/apartments-price", async (req, res) => {
      const { minPrice, maxPrice } = req.query;
      const query = {};
      if (minPrice) query.rent = { $gte: Number(minPrice) };
      if (maxPrice) query.rent = { ...query.rent, $lte: Number(maxPrice) };
      const result = await apartmentCollection
        .find(query)
        .sort({ rent: 1 })
        .toArray();
      res.send(result);
    });

    // Get all members
    app.get("/members", verifyToken, verifyAdmin, async (req, res) => {
      const query = { role: "member" };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // Remove Members
    app.patch("/remove-members", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.body.email;
      const query = { email };
      const updateDoc = {
        $set: {
          role: "user",
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Post Agrements
    app.post("/agreements", async (req, res) => {
      const agreement = req.body;
      const query = { email: agreement.email };
      const data = await agreementCollection.findOne(query);
      if (data) {
        return res.send({
          message: "Oops! You already have an active agreement",
        });
      }
      const result = await agreementCollection.insertOne(agreement);
      res.send(result);
    });

    // Admin Profile
    app.get("/admin-profile", verifyToken, verifyAdmin, async (req, res) => {
      const totalRoom = await apartmentCollection.estimatedDocumentCount();
      const availableRoom = await apartmentCollection.countDocuments({
        status: "available",
      });
      const totalUser = await usersCollection.countDocuments({ role: "user" });
      const totalMember = await usersCollection.countDocuments({
        role: "member",
      });
      const result = { totalRoom, totalMember, totalUser, availableRoom };
      res.send(result);
    });

    // Get All Agreements
    app.get("/agreements", verifyToken, async (req, res) => {
      const query = { status: "Pending" };
      const result = await agreementCollection.find(query).toArray();
      result.map((agreement) => {
        const date = new ObjectId(agreement._id).getTimestamp();
        agreement.requestDate = date;
      });
      res.send(result);
    });

    // Post Agreement Request
    app.post(
      "/manage-agreement-request",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.body?.id;
        const action = req.body?.action;
        const apartmentId = req.body?.apartmentId;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "Checked",
            acceptDate: new Date(),
          },
        };
        const updateAgreement = await agreementCollection.updateOne(
          query,
          updateDoc
        );
        const agreement = await agreementCollection.findOne(query);
        const email = agreement.email;
        if (action === "accept") {
          const query2 = { _id: new ObjectId(apartmentId) };
          const updatedoc2 = {
            $set: {
              status: "unavailable",
            },
          };
          const updatedRes = await apartmentCollection.updateOne(
            query2,
            updatedoc2
          );
          const query1 = { email };
          const updateDoc1 = {
            $set: {
              role: "member",
            },
          };
          const result = await usersCollection.updateOne(query1, updateDoc1);
          res.send(result);
        } else {
          res.send({ message: "Agreement Rejected" });
        }
      }
    );

    // Get a specific agreement
    app.get(
      "/agreement/:email",
      verifyToken,
      verifyMember,
      async (req, res) => {
        const email = req.params.email;
        const result = await agreementCollection.findOne({ email });
        res.send(result);
      }
    );

    // Announcement
    app.post("/announcements", verifyToken, verifyAdmin, async (req, res) => {
      const announcement = req.body;
      const result = await announcementCollection.insertOne(announcement);
      res.send(result);
    });

    // Post Coupons
    app.post("/coupons", verifyToken, verifyAdmin, async (req, res) => {
      const coupon = req.body;
      const result = await couponsCollection.insertOne(coupon);
      res.send(result);
    });

    // Get All Coupons
    app.get("/all-coupons", async (req, res) => {
      const result = await couponsCollection.find().toArray();
      res.send(result);
    });

    // Delete A coupons
    app.get(
      "/delete-coupon/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const result = await couponsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );

    // Validate Coupons
    app.post(
      "/validate-coupons",
      verifyToken,
      verifyMember,
      async (req, res) => {
        const coupons = req.body.coupon;
        const result = await couponsCollection.findOne({ code: coupons });
        if (result) {
          res.send(result);
        } else {
          res.send({ message: "Invalid Coupon" });
        }
      }
    );

    // Creating Payment Intent
    app.post(
      "/create-payment-intent",
      verifyToken,
      verifyMember,
      async (req, res) => {
        const { price } = req.body;
        const amount = price * 100;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      }
    );

    // Payments
    app.post("/payments", verifyToken, verifyMember, async (req, res) => {
      const paymentInfo = req.body;
      const result = await paymentCollection.insertOne(paymentInfo);
      res.send(result);
    });

    // Payment History
    app.get(
      "/payment-history/:email",
      verifyToken,
      verifyMember,
      async (req, res) => {
        const email = req.params.email;
        const result = await paymentCollection.find({ email }).toArray();
        res.send(result);
      }
    );

    // Get all announcement
    app.get("/announcements", async (req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    });

    // Get all reviews
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
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
