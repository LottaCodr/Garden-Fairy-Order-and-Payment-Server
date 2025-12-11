import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { Order } from "../models/order.model";
import { Plant } from "../models/plant.model";

const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY!;
const FLW_REDIRECT = process.env.FLUTTERWAVE_REDIRECT_URL!;

// create order (no payment yet). Frontend sends cart items and shipping address
export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user; // optional
        const { items, shippingAddress, deliveryMethod } = req.body;

        // basic server-side validation & price calc
        let subtotal = 0;
        const itemsDetailed = await Promise.all(items.map(async (it: any) => {
            const product = await Plant.findById(it.productId);
            if (!product) throw new Error("Product not found: " + it.productId);
            const price = it.price ?? product.price;
            subtotal += price * it.qty;
            return {
                product: product._id,
                name: product.name,
                price,
                qty: it.qty,
                image: (product as any).images?.[0] || "",
                size: it.size
            };
        }));

        // estimate delivery fee — simplistic rule (you should replace with partner API)
        const deliveryFee = deliveryMethod === "express" ? 2500 : 1200;
        const total = subtotal + deliveryFee;

        const order = await Order.create({
            user: user?.id,
            items: itemsDetailed,
            shippingAddress,
            payment: { provider: "flutterwave", status: "unpaid", amount: total },
            delivery: { fee: deliveryFee, status: "pending" },
            status: "pending_payment",
            total
        });

        // Initiate Flutterwave payment — create payment link or payment token
        // We'll create a hosted payment link via Flutterwave's v3/hosted/payments endpoint (example)
        // NOTE: ensure FLUTTERWAVE_SECRET_KEY is set and allowed to create links.
        const payload = {
            tx_ref: `order_${order._id}_${Date.now()}`,
            amount: total,
            currency: "NGN",
            redirect_url: FLW_REDIRECT,
            customer: {
                email: user?.email || shippingAddress?.email || "customer@example.com",
                phone_number: shippingAddress?.phone,
                name: shippingAddress?.name || user?.name || "Customer"
            },
            meta: { orderId: order._id.toString() },
            // optional customization...
        };

        const response = await axios.post("https://api.flutterwave.com/v3/payments", payload, {
            headers: { Authorization: `Bearer ${FLW_SECRET}` }
        });

        const { status, data } = response.data;
        // response.data contains link or payment data depending on endpoint
        // For now, return the full response so frontend can redirect or handle as needed
        res.status(201).json({ order, paymentInit: data || response.data });
    } catch (err) {
        next(err);
    }
};
