export const protect = (req, res, next) => {
    const PASSWORD = process.env.PASSWORD;
    if (!PASSWORD) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};
