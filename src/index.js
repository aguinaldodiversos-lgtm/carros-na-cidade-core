const adsRoutes = require('./routes/ads');
const paymentRoutes = require('./routes/payments');
const authRoutes = require('./routes/auth');
const sitemapRoute = require('./routes/sitemap');

const app = express();
app.use(express.json());

app.use('/api/ads', adsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/auth', authRoutes);

// sitemap
app.use('/', sitemapRoute);
