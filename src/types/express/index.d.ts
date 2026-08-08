export {};

declare global {
    namespace Express {
        interface User {
            id: string;
            email: string;
            role: 'customer' | 'admin';
            name: string;
        }

        interface Request {
            user?: User;
        }
    }
}
