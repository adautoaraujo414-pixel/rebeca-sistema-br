const validarToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (process.env.NODE_ENV !== 'production') return next();
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
    const token = authHeader.replace('Bearer ', '');
    if (!token.startsWith('ADMIN_') && !token.startsWith('MOT_')) {
        return res.status(401).json({ error: 'Token inválido' });
    }
    req.tokenData = { tipo: token.startsWith('ADMIN_') ? 'admin' : 'motorista', token };
    next();
};

const validarMotorista = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (process.env.NODE_ENV !== 'production') return next();
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
    const token = authHeader.replace('Bearer ', '');
    if (!token.startsWith('MOT_')) return res.status(403).json({ error: 'Acesso negado' });
    req.motoristaId = token.split('_')[1];
    next();
};

const validarAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (process.env.NODE_ENV !== 'production') return next();
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
    const token = authHeader.replace('Bearer ', '');
    if (!token.startsWith('ADMIN_')) return res.status(403).json({ error: 'Acesso negado' });
    next();
};

module.exports = { validarToken, validarMotorista, validarAdmin };
