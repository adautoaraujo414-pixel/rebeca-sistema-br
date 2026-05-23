const express = require('express');
const router = express.Router();
const MapsService = require('../services/maps.service');
const GPSIntegradoService = require('../services/gps-integrado.service');

// Config API Key
router.get('/config', (req, res) => {
    res.json({ apiKey: MapsService.getApiKey() ? '***configurada***' : '', configurada: !!MapsService.getApiKey() });
});

router.put('/config', (req, res) => {
    const { apiKey } = req.body;
    MapsService.setApiKey(apiKey);
    res.json({ sucesso: true });
});

// Geocodificação
router.post('/geocodificar', async (req, res) => {
    try {
      const { endereco } = req.body;
      if (!endereco) return res.status(400).json({ error: 'Endereço obrigatório' });
    
      const result = await MapsService.geocodificar(endereco);
      res.json(result);
    } catch(e) { console.error("[maps.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.post('/geocodificar-reverso', async (req, res) => {
    try {
      const { latitude, longitude } = req.body;
      if (!latitude || !longitude) return res.status(400).json({ error: 'Coordenadas obrigatórias' });
    
      const result = await MapsService.geocodificarReverso(latitude, longitude);
      res.json(result);
    } catch(e) { console.error("[maps.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

// Calcular rota
router.post('/rota', async (req, res) => {
    try {
      const { origem, destino } = req.body;
      if (!origem || !destino) return res.status(400).json({ error: 'Origem e destino obrigatórios' });
    
      const result = await MapsService.calcularRota(origem, destino);
      res.json(result);
    } catch(e) { console.error("[maps.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

// Matriz de distância
router.post('/matriz', async (req, res) => {
    try {
      const { origens, destinos } = req.body;
      if (!origens || !destinos) return res.status(400).json({ error: 'Origens e destinos obrigatórios' });
    
      const result = await MapsService.matrizDistancia(origens, destinos);
      res.json(result);
    } catch(e) { console.error("[maps.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

// Autocompletar
router.get('/autocompletar', async (req, res) => {
    try {
      const { texto } = req.query;
      if (!texto) return res.status(400).json({ error: 'Texto obrigatório' });
    
      const result = await MapsService.autocompletar(texto);
      res.json(result);
    } catch(e) { console.error("[maps.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

// Encontrar motorista mais próximo
router.post('/motorista-proximo', async (req, res) => {
    try {
      const { latitude, longitude } = req.body;
      if (!latitude || !longitude) return res.status(400).json({ error: 'Coordenadas obrigatórias' });
    
      const motoristas = GPSIntegradoService.listarTodos();
      const result = await MapsService.encontrarMotoristaProximo({ latitude, longitude }, motoristas);
      res.json(result);
    } catch(e) { console.error("[maps.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

// Calcular preço da corrida
router.post('/calcular-preco', async (req, res) => {
    try {
      const { origem, destino, taxaBase, precoKm, taxaMinima } = req.body;
      if (!origem || !destino) return res.status(400).json({ error: 'Origem e destino obrigatórios' });
    
      const rota = await MapsService.calcularRota(origem, destino);
      if (!rota.sucesso) return res.status(400).json(rota);
    
      const tb = taxaBase || 5;
      const pk = precoKm || 2.5;
      const tm = taxaMinima || 15;
    
      let preco = tb + (rota.distancia.km * pk);
      if (preco < tm) preco = tm;
    
      res.json({
          sucesso: true,
          origem: rota.origem,
          destino: rota.destino,
          distancia: rota.distancia,
          duracao: rota.duracao,
          preco: {
              taxaBase: tb,
              precoKm: pk,
              valorDistancia: rota.distancia.km * pk,
              total: Math.round(preco * 100) / 100
          },
          polyline: rota.polyline
      });
    } catch(e) { console.error("[maps.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

module.exports = router;
