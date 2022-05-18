const express = require('express')
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken'); 
const port = process.env.PORT || 5000;
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');

// middleware
app.use(cors())
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wysk8.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send({message:'Unauthorized'})
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({message:'Forbidden access'})
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
    try {
        await client.connect();
      const servicesCollection = client.db('doctors_portal').collection('services')
      const bookingCollection = client.db('doctors_portal').collection('bookings')
      const userCollection = client.db('doctors_portal').collection('user')
      const doctorCollection = client.db('doctors_portal').collection('doctors')

      //verify admin
      const verifyAdmin = async (req, res, next) => {
        const requester = req.decoded.email;
        const requestedAccount = await userCollection.findOne({ email: requester });
        if (requestedAccount.role === 'admin') {
          next()
        }
        else {
          res.status(403).send({message:'forbidden access'})
        }
      }
      

      //get services with specific date
      app.get('/available', async (req, res) => {
        const date = req.query.date;
        // step-1: get all services
        const services = await servicesCollection.find().toArray();
        // step-2: get the booking of that day
        const query = { date: date };
        const bookings = await bookingCollection.find(query).toArray();
        // step-3: For each services
        services.forEach(service => {
          // step-4: find booking for that service
          const serviceBookings = bookings.filter(b => b.treatment === service.name)
          // step-5: select slots for the service bookings
          const bookedSlots = serviceBookings.map(book => book.slot)
          // step-6: select those slots that are not in booked slot
          const available = service.slots.filter(slot => !bookedSlots.includes(slot));
          service.slots = available;
        })

        res.send(services);
      })

      //get all services
      app.get('/services', async (req, res) => {
          const query = {}
          const cursor = servicesCollection.find(query).project({name:1});
          const allServices = await cursor.toArray(); 
          // console.log(allServices);
          res.send(allServices);
      })

      //Get all bookings for specific user
      app.get('/booking', verifyJWT, async (req, res) => {
        const patient = req.query.patient;
        const decodedEmail = req.decoded.email;
        if (patient === decodedEmail) {
          const query = { patient: patient };
          const bookings = await bookingCollection.find(query).toArray();
          res.send(bookings);
        }
        else {
          return res.status(403).send({ message: 'forbidden' });
        }
      })

      app.get('/admin/:email', async (req, res) => {
        const email = req.params.email;
        const user = await userCollection.findOne({ email: email });
        const isAdmin = user.role === 'admin';
        res.send({ admin: isAdmin });
      })

      //add user in db
      app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
        const email = req.params.email;

        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'admin' }
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      })

      //add user in db
      app.put('/user/:email', async (req, res) => {
        const email = req.params.email;
        // console.log(email);
        const user = req.body;
        const filter = { email: email };
        const options = { upsert: true };
        const updateDoc = { $set: user };
        const result = await userCollection.updateOne(filter, updateDoc, options);
        const token = jwt.sign({
          email: email
        },
          process.env.ACCESS_TOKEN_SECRET,
          { expiresIn: '1hr' });
        res.send({result,token});
      })

      //get users
      app.get('/user', verifyJWT, async (req, res) => {
        const users = await userCollection.find().toArray();
        res.send(users);
      })
      
      //add bookings
      app.post('/booking', async (req, res) => {
        const booking = req.body;
        const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
        // console.log(query);
        const exists = await bookingCollection.findOne(query);
        if (exists) {
          return res.send({ success: false, booking: exists })
        }
        const result = await bookingCollection.insertOne(booking);
        res.send({success:true, result});
      })

      //add doctors
      app.post('/doctor',verifyJWT,verifyAdmin, async (req, res) => {
        const doctor = req.body;
        const result = await doctorCollection.insertOne(doctor);
        res.send(result);
      })

      app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
        const doctors = await doctorCollection.find().toArray();
        res.send(doctors);
      })

    }
    finally{}
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
}) 