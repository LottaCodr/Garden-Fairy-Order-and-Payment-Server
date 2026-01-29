import { Types } from "mongoose";

declare global {
    namespace Express {
        interface User {
            id: string;
            email: string;
            role: "user" | "admin";
            name: string
        }

        interface Request {
            user?: User;
        }
    }
}
