// Everything in Express was middlewares to handle req --> res cycle
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const cors = require('cors');

const tourRouter = require('./routes/tourRoutes');
const userRouter = require('./routes/userRoutes');
const reviewRouter = require('./routes/reviewRoutes');
const bookingRouter = require('./routes/bookingRoutes');
const bookingController = require('./controllers/bookingController');

const viewRouter = require('./routes/viewRoutes');
const AppError = require('./utils/appError');
const globalErrorHandller = require('./controllers/errorController');

const app = express();

// Set up Pug (Template Engine)
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Serving static file, means we can access file in this dir using dir path in query string
// So file in "public" folder can be query like "http://127.0.0.1:3000/img/favicon.png"
// The way html finds css file the same like this
// app.use(express.static(`${__dirname}/public`)); //Or below
app.use(express.static(path.join(__dirname, 'public')));

// Need to put that POST here before 'app.use(express.json({ limit: '10kb' }));'. Because we want raw data
// from Stripe, not json parsed object
// If payment is successful, Stripe will call webhooks
app.post(
  '/webhook-checkout',
  express.raw({ type: 'application/json' }),
  bookingController.webhookCheckout
);

// Limit amount of data from req.body to 10kb to protect server from attacker(overload server)
app.use(express.json({ limit: '10kb' })); // Like body-parser, using this middleware to attach req.body property, default in express
app.use(express.urlencoded({ extended: true, limit: '10kb' })); // for using req.body when data was submitted by html-form
app.use(cookieParser());

// IMPLEMENT CORS (Cross-Origin-Resource-Sharing)
// We can set 'cors' in specific route -> Read doc
app.use(cors()); // Middleware to add some header('Access-Control-Allow-Origin' = * (* all req)) to request

// // Specify particular web domain in front-end to access API
// app.use(
//   cors({
//     origin: 'https://www.natours.com'
//   })
// );

// SIMPLE request is POST, GET
// COMPLEX request is DELETE, PATH
// With simple request we just use app.use(cors())
// But for complex request, browser wil do 'prefight' phase to send OPTIONS request to server to make sure
// safe to send. So we need to hande OPTIONS request
app.options('*', cors()); // options is HTTP method like PUT, GET... * is for all routes

// After attach req.body, now we need to fileter body out of malicious code in body
// Data sanitization against NoSQL injection( "email": { $gt: "" })
app.use(mongoSanitize()); // This middleware removes all . $ from req.body

// Data sanitization against XSS(cross-site script attack)
app.use(xss());

// Prevent parameter pollution like (?sort=duration&sort=price) but correct is 'sort=duration,price'
app.use(
  hpp({
    whitelist: [
      'duration',
      'ratingsAverage',
      'ratingsQuantity',
      'maxGroupSize',
      'difficulty',
      'price'
    ] // Array allows some fields to be duplicated like "{{URL}}/api/v1/tours?duration=7&duration=9"
  })
);

// For compressing text only like (JSON, HTML) in res to client
app.use(compression());

// Demo middleware
app.use((req, res, next) => {
  //create our own middleware
  // console.log('Req, Res went through this Mid-ware !');
  // console.log(req.cookies);
  next();
});

// GLOBAL MIDDLEWARES
// Set security HTTP header
app.use(helmet()); //use(put a fuction not function call, so helmet() return a function)

// Development logging using morgan
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Using rate limiting to prevent 'Brute force attack' and 'denial of server' by limiting
// number of request per certain amount of time.
const limiter = rateLimit({
  max: 100, // max request
  windowMs: 60 * 60 * 1000, // per 1 hours was transfer to milli second
  message: 'Too many requests from this IP, please try again in 1 hour !'
});
app.use('/api', limiter);

// ROUTES
app.use('/', viewRouter);
app.use('/api/v1/tours', tourRouter); //tourRouter like sub application
app.use('/api/v1/users', userRouter); //userRouter like sub application
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/bookings', bookingRouter);

// If there is no middleware was matched and run above, this is the final middlewares in req-res-cycle
// Therefore, it will handle all route was not declared.
app.all('*', (req, res, next) => {
  // const err = new Error(`Can't find ${req.originalUrl} on this server !`);
  // err.statusCode = 404;
  // err.status = 'fail';

  //next(err); //next(agr) with 1 agr will automatically run global Error handling by Express
  next(new AppError(`Can't find ${req.originalUrl} on this server !`, 404));
});

// Global Error handling by Express
// globalErrorHandller: Middleware with 4 agrs automatically known as 'global Error handling' by Express.
app.use(globalErrorHandller);

module.exports = app;
