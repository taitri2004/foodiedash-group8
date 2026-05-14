import mongoose from 'mongoose';
import { MONGODB_URI } from '../constants/env';

const connectToDatabase = async (retries = 5): Promise<void> => {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('Connected to database');
      return;
    } catch (error) {
      console.log(`DB connect attempt ${i + 1}/${retries} failed:`, error);
      if (i === retries - 1) process.exit(1);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
};

export default connectToDatabase;
