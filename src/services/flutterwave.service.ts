import axios from 'axios';

const FLW_BASE_URL =
  process.env.FLW_BASE_URL || 'https://api.flutterwave.com/v3';

const flwClient = axios.create({
  baseURL: FLW_BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
});

export default flwClient;
