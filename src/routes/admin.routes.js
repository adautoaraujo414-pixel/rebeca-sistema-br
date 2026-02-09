
// ==================== FILA DE ESPERA ====================
router.get('/fila-espera', async (req, res) => {
    try {
        const { FilaEspera } = require('../models');
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        
        const fila = await FilaEspera.find({ 
            adminId, 
            status: { $in: ['aguardando', 'notificado'] } 
        }).sort({ posicao: 1 });
        
        res.json({ fila, total: fila.length });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

router.delete('/fila-espera/:id', async (req, res) => {
    try {
        const { FilaEspera } = require('../models');
        await FilaEspera.findByIdAndUpdate(req.params.id, { status: 'expirado' });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});
