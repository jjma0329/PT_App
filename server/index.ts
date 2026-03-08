import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import contactRouter from './routes/contact.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/contact', contactRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
