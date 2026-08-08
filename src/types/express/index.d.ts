export {};

declare global {
    namespace Express {
        interface User {
            id: string;
            name: string;
            email: string;
            role: 'customer' | 'admin';
            phone?: string;
        }

        interface Request {
            user?: User;
        }
    }
}
