import axios from "axios";

const flwClient = axios.create({
    baseURL: process.env.FLW_BASE_URL,
    headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json",
    },
});

export default flwClient;
