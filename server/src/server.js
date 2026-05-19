import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

const port = Number(process.env.PORT || 5000);

app.listen(port, () => {
  console.log(`Naveen Digital Studio API running on port ${port}`);
});
