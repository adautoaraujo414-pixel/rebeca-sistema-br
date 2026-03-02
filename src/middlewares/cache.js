const cacheStore = {};

function cache(seconds) {
    return (req, res, next) => {
        const key = req.originalUrl;
        const now = Date.now();

        if (cacheStore[key] && (now - cacheStore[key].time < seconds * 1000)) {
            return res.json(cacheStore[key].data);
        }

        const originalJson = res.json.bind(res);

        res.json = (body) => {
            cacheStore[key] = {
                data: body,
                time: Date.now()
            };
            return originalJson(body);
        };

        next();
    };
}

module.exports = cache;

